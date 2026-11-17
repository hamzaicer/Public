import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import Player from './components/Player.jsx'
import {
  countryLabel,
  groupLabel,
  loadCountry,
  loadGroup,
  loadMeta,
} from './lib/catalog.js'

function ChannelLogo({ name, logo }) {
  const [failed, setFailed] = useState(false)
  if (!logo || failed) {
    return <div className="channel-fallback">{name.slice(0, 1)}</div>
  }
  return (
    <img
      className="channel-logo"
      src={logo}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export default function App() {
  const [meta, setMeta] = useState(null)
  const [mode, setMode] = useState('country')
  const [selected, setSelected] = useState('tr')
  const [channels, setChannels] = useState([])
  const [active, setActive] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadMeta()
        if (cancelled) return
        setMeta(data)
        const hasTr = data.countries.some((c) => c.code === 'tr')
        setSelected(hasTr ? 'tr' : data.countries[0]?.code || '')
      } catch (err) {
        if (!cancelled) setError(err.message || 'Yükleme hatası')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const list =
          mode === 'country' ? await loadCountry(selected) : await loadGroup(selected)
        if (cancelled) return
        startTransition(() => {
          setChannels(list)
          setActive(null)
          setLoading(false)
        })
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Liste yüklenemedi')
          setChannels([])
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, selected])

  const filtered = channels.filter((ch) => {
    if (!deferredQuery.trim()) return true
    const q = deferredQuery.toLowerCase()
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.group.toLowerCase().includes(q) ||
      (ch.id || '').toLowerCase().includes(q)
    )
  })

  const playlistHref =
    mode === 'country'
      ? `./playlists/by-country/${selected}.m3u8`
      : `./playlists/by-group/${selected}.m3u8`

  return (
    <div className="app">
      <header className="hero">
        <h1 className="brand">
          Free <span>TV</span>
        </h1>
        <p className="lede">
          Free-TV/IPTV ücretsiz kanallarını tarayıcıda aç. Ülke seç, yayını dene veya M3U
          playlist’i VLC’ye bağla.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="./playlists/index.m3u8" download>
            Tüm kanallar (.m3u8)
          </a>
          <a className="btn btn-ghost" href="./playlists/by-country/tr.m3u8" download>
            Türkiye playlist
          </a>
        </div>
        {meta && (
          <div className="stats">
            <div>
              <strong>{meta.totalStreams.toLocaleString('tr-TR')}</strong>
              yayın
            </div>
            <div>
              <strong>{meta.countries.length}</strong>
              ülke
            </div>
            <div>
              <strong>{meta.groups.length}</strong>
              grup
            </div>
          </div>
        )}
      </header>

      <div className="shell">
        <aside className="panel sidebar">
          <h2>Gezinme</h2>
          <select
            className="field"
            value={mode}
            onChange={(e) => {
              const next = e.target.value
              setMode(next)
              setQuery('')
              if (next === 'country') {
                setSelected(
                  meta?.countries.some((c) => c.code === 'tr')
                    ? 'tr'
                    : meta?.countries[0]?.code || '',
                )
              } else {
                setSelected(meta?.groups[0]?.slug || '')
              }
            }}
          >
            <option value="country">Ülkelere göre</option>
            <option value="group">Gruplara göre</option>
          </select>

          <input
            className="field"
            type="search"
            placeholder="Kanal ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="filter-list">
            {mode === 'country' &&
              meta?.countries.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`filter-item${selected === c.code ? ' active' : ''}`}
                  onClick={() => setSelected(c.code)}
                >
                  {countryLabel(c.code)}
                  <span>{c.count}</span>
                </button>
              ))}
            {mode === 'group' &&
              meta?.groups.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  className={`filter-item${selected === g.slug ? ' active' : ''}`}
                  onClick={() => setSelected(g.slug)}
                >
                  {g.title}
                  <span>{g.count}</span>
                </button>
              ))}
          </div>
        </aside>

        <main className="main">
          <Player channel={active} />

          <section className="panel">
            <div className="toolbar">
              <div className="toolbar-left">
                <span className="chip">
                  {mode === 'country' ? countryLabel(selected) : groupLabel(meta, selected)}
                </span>
                <span className="chip">{filtered.length} kanal</span>
              </div>
              <a className="btn btn-ghost" href={playlistHref} download>
                Bu listeyi indir
              </a>
            </div>

            {error && <div className="empty">{error}</div>}
            {loading && !error && <div className="empty">Kanallar yükleniyor…</div>}
            {!loading && !error && filtered.length === 0 && (
              <div className="empty">Bu filtrede kanal yok.</div>
            )}

            <div className="channel-grid">
              {filtered.map((ch) => (
                <button
                  key={`${ch.id}-${ch.url}`}
                  type="button"
                  className={`channel${active?.url === ch.url ? ' active' : ''}`}
                  onClick={() => setActive(ch)}
                >
                  <ChannelLogo name={ch.name} logo={ch.logo} />
                  <div>
                    <strong>{ch.name}</strong>
                    <small>
                      {ch.group}
                      {ch.kind && ch.kind !== 'hls' ? ` · ${ch.kind}` : ''}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>

      <footer className="footer">
        Kaynak:{' '}
        <a href="https://github.com/Free-TV/IPTV" target="_blank" rel="noreferrer">
          Free-TV/IPTV
        </a>
        . Ham playlist:{' '}
        <a
          href="https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
          target="_blank"
          rel="noreferrer"
        >
          playlist.m3u8
        </a>
        . Bazı yayınlar CORS / geo-block nedeniyle tarayıcıda açılmaz; VLC önerilir.
      </footer>
    </div>
  )
}
