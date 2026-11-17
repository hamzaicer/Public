import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import EpgPanel from './components/EpgPanel.jsx'
import Player from './components/Player.jsx'
import {
  categoryLabel,
  countryLabel,
  loadAllChannels,
  loadCategory,
  loadCountry,
  loadMeta,
} from './lib/catalog.js'
import { loadEpgMeta } from './lib/epg.js'

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
  const [mode, setMode] = useState('all')
  const [selected, setSelected] = useState('all')
  const [channels, setChannels] = useState([])
  const [active, setActive] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [epgIds, setEpgIds] = useState(() => new Set())
  const [visibleCount, setVisibleCount] = useState(300)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [data, epg] = await Promise.all([loadMeta(), loadEpgMeta()])
        if (cancelled) return
        setMeta(data)
        if (epg?.ids) setEpgIds(new Set(epg.ids))
        setMode('all')
        setSelected('all')
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
        let list
        if (mode === 'all') list = await loadAllChannels()
        else if (mode === 'country') list = await loadCountry(selected)
        else list = await loadCategory(selected)
        if (cancelled) return
        startTransition(() => {
          setChannels(list)
          setActive(null)
          setVisibleCount(300)
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
  const visible = filtered.slice(0, visibleCount)

  const playlistHref =
    mode === 'all'
      ? '/playlists/index.m3u'
      : mode === 'country'
        ? `/playlists/countries/${selected}.m3u`
        : `/playlists/categories/${selected}.m3u`

  return (
    <div className="app">
      <header className="hero">
        <h1 className="brand">
          Bea<span>con</span>
        </h1>
        <p className="lede">
          iptv-org yayınları + EPG rehberi — kanal seç, şimdi/sonra programını gör, M3U veya XMLTV indir.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="/playlists/index.m3u" download>
            Tüm kanallar (.m3u)
          </a>
          <a className="btn btn-ghost" href="/playlists/countries/tr.m3u" download>
            Türkiye playlist
          </a>
          <a className="btn btn-ghost" href="/epg/tr.xml" download>
            Türkiye EPG (.xml)
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
              <strong>{meta.categories.length}</strong>
              kategori
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
              if (next === 'all') setSelected('all')
              else if (next === 'country') {
                setSelected(
                  meta?.countries.some((c) => c.code === 'tr')
                    ? 'tr'
                    : meta?.countries[0]?.code || '',
                )
              } else {
                setSelected(meta?.categories[0]?.slug || '')
              }
            }}
          >
            <option value="all">Tüm kanallar (dosya)</option>
            <option value="country">Ülkelere göre</option>
            <option value="category">Kategoriye göre</option>
          </select>

          <input
            className="field"
            type="search"
            placeholder="Kanal ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="filter-list">
            {mode === 'all' && (
              <button type="button" className="filter-item active">
                index.m3u
                <span>{meta?.allCount ?? meta?.totalStreams ?? '…'}</span>
              </button>
            )}
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
            {mode === 'category' &&
              meta?.categories.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  className={`filter-item${selected === c.slug ? ' active' : ''}`}
                  onClick={() => setSelected(c.slug)}
                >
                  {categoryLabel(c.slug)}
                  <span>{c.count}</span>
                </button>
              ))}
          </div>
        </aside>

        <main className="main">
          <Player channel={active} />
          <EpgPanel channelId={active?.id} />

          <section className="panel">
            <div className="toolbar">
              <div className="toolbar-left">
                <span className="chip">
                  {mode === 'all'
                    ? 'Tüm kanallar'
                    : mode === 'country'
                      ? countryLabel(selected)
                      : categoryLabel(selected)}
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
              {visible.map((ch) => (
                <button
                  key={`${ch.id}-${ch.url}`}
                  type="button"
                  className={`channel${active?.url === ch.url ? ' active' : ''}`}
                  onClick={() => setActive(ch)}
                >
                  <ChannelLogo name={ch.name} logo={ch.logo} />
                  <div>
                    <strong>
                      {ch.name}
                      {epgIds.has(ch.id) && <span className="epg-badge">EPG</span>}
                    </strong>
                    <small>{ch.group}</small>
                  </div>
                </button>
              ))}
            </div>
            {visible.length < filtered.length && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '0.75rem', width: '100%' }}
                onClick={() => setVisibleCount((n) => n + 400)}
              >
                Daha fazla göster ({filtered.length - visible.length} kaldı)
              </button>
            )}
          </section>
        </main>
      </div>

      <footer className="footer">
        Yayın:{' '}
        <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">
          iptv-org/iptv
        </a>
        {' · '}
        Rehber:{' '}
        <a href="https://github.com/iptv-org/epg" target="_blank" rel="noreferrer">
          iptv-org/epg
        </a>
        {' '}
        (tvplus / digiturk / dsmart / turksat)
      </footer>
    </div>
  )
}
