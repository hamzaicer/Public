import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import EpgPanel from './components/EpgPanel.jsx'
import Player from './components/Player.jsx'
import {
  categoryLabel,
  countryLabel,
  loadAllChannels,
  loadCategory,
  loadCountry,
  loadImportReport,
  loadMeta,
} from './lib/catalog.js'
import { loadEpgMeta } from './lib/epg.js'

const SOURCE_SLUGS = new Set([
  'free-tv',
  'nexus',
  'nexus-online',
  'world-iptv',
  'iptv-org-streams',
  'review',
  'blocked',
])

const SOURCE_PLAYLISTS = {
  'free-tv': '/playlists/free-tv.m3u8',
  nexus: '/playlists/nexus.m3u',
  'nexus-online': '/playlists/nexus-online.m3u',
  'world-iptv': '/playlists/world-iptv.m3u',
  'iptv-org-streams': '/playlists/iptv-org-streams.m3u',
}

const REASON_LABELS = {
  'duplicate-url': 'Tekrarlayan kayıt',
  'non-http-stream': 'Tarayıcıda açılamayan biçim',
  'adult-or-nsfw-marker': 'İçerik incelemesi',
  'adult-or-nsfw-label': 'İçerik incelemesi',
  'adult-category': 'Yetişkin kategori',
  'license-unknown': 'Lisans belirsiz',
  'license-unverified': 'Lisans doğrulanamadı',
  'missing-url': 'Eksik yayın kaydı',
  'explicit-blocked': 'Yayın engelli',
}

function reasonLabel(code) {
  return REASON_LABELS[code] || 'İnceleme gerekli'
}

function sourceCount(meta, id) {
  const row = meta?.sources?.find((s) => s.id === id)
  return row?.added ?? row?.count ?? null
}

function ChannelLogo({ name, logo }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [logo])
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

function firstContentCategory(meta) {
  const preferred = ['general', 'news', 'sports', 'entertainment']
  const list = meta?.categories || []
  for (const slug of preferred) {
    if (list.some((c) => c.slug === slug)) return slug
  }
  return list.find((c) => !SOURCE_SLUGS.has(c.slug))?.slug || list[0]?.slug || ''
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
  const [importReport, setImportReport] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [data, epg, report] = await Promise.all([
          loadMeta(),
          loadEpgMeta(),
          loadImportReport().catch(() => null),
        ])
        if (cancelled) return
        setMeta(data)
        setImportReport(report)
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

  const contentCategories = useMemo(
    () => (meta?.categories || []).filter((c) => !SOURCE_SLUGS.has(c.slug)),
    [meta],
  )

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
        : SOURCE_PLAYLISTS[selected] ||
          (SOURCE_SLUGS.has(selected) ? '' : `/playlists/categories/${selected}.m3u`)

  const canDownloadPlaylist = Boolean(playlistHref)

  const scrollToBrowse = () => {
    document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-media" aria-hidden="true">
          <img
            src="https://images.unsplash.com/photo-1478737270239-2f02bb3fff1f?auto=format&fit=crop&w=2400&q=80"
            alt=""
          />
        </div>
        <div className="hero-veil" aria-hidden="true" />
        <div className="hero-copy">
          <p className="brand">Beacon</p>
          <h1 className="hero-title">Açık yayınları izle</h1>
          <p className="lede">
            Açık IPTV listelerinden kanal seç, program rehberine bak, M3U indir.
          </p>
          <div className="cta-row">
            <button type="button" className="btn btn-primary" onClick={scrollToBrowse}>
              İzlemeye başla
            </button>
            <a className="btn btn-ghost" href="/playlists/index.m3u" download>
              Listeyi indir
            </a>
          </div>
        </div>
      </header>

      <div className="shell" id="browse">
        <aside className="sidebar">
          <h2>Keşfet</h2>

          {meta && (
            <div className="browse-stats" aria-label="Katalog özeti">
              <div>
                <strong>{meta.allCount.toLocaleString('tr-TR')}</strong>
                yayın
              </div>
              <div>
                <strong>{(meta.reviewCount || 0).toLocaleString('tr-TR')}</strong>
                inceleme
              </div>
              <div>
                <strong>{meta.countries.length}</strong>
                ülke
              </div>
            </div>
          )}

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
                setSelected(firstContentCategory(meta))
              }
            }}
          >
            <option value="all">Tüm kanallar</option>
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

          <div className="nav-block">
            <h3 className="nav-label">Yayın paketleri</h3>
            <div className="nav-actions">
              <button
                type="button"
                className={`nav-card warn${mode === 'category' && selected === 'review' ? ' active' : ''}`}
                onClick={() => {
                  setMode('category')
                  setSelected('review')
                  setQuery('')
                  setVisibleCount(500)
                }}
              >
                <strong>İnceleme</strong>
                <span>{meta?.reviewCount ?? 0} kayıt bekliyor</span>
              </button>
              {[
                { id: 'free-tv', label: 'Free-TV', hint: 'Ücretsiz kanallar' },
                { id: 'nexus', label: 'Nexus', hint: 'Geniş katalog' },
                { id: 'nexus-online', label: 'Çevrimiçi', hint: 'Çalışan yayınlar' },
                { id: 'world-iptv', label: 'Dünya', hint: 'Doğrulanmış liste' },
              ].map((src) => {
                const count = sourceCount(meta, src.id)
                return (
                  <button
                    key={src.id}
                    type="button"
                    className={`nav-card${mode === 'category' && selected === src.id ? ' active' : ''}`}
                    onClick={() => {
                      setMode('category')
                      setSelected(src.id)
                      setQuery('')
                      setVisibleCount(500)
                    }}
                  >
                    <strong>{src.label}</strong>
                    <span>
                      {src.hint}
                      {count != null ? ` · ${count.toLocaleString('tr-TR')}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="nav-block">
            <h3 className="nav-label">Hızlı spor</h3>
            <div className="nav-actions compact">
              {['beIN', 'TRT Spor', 'S Sport', 'A Spor'].map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`nav-pill${query.toLowerCase() === q.toLowerCase() ? ' active' : ''}`}
                  onClick={() => {
                    setMode('all')
                    setSelected('all')
                    setQuery(q)
                    setVisibleCount(500)
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {importReport && (
            <div className="nav-block">
              <h3 className="nav-label">Yönetim</h3>
              <button
                type="button"
                className={`nav-card${showReport ? ' active' : ''}`}
                onClick={() => setShowReport((v) => !v)}
              >
                <strong>İçe aktarma özeti</strong>
                <span>
                  {importReport.totals.allowed.toLocaleString('tr-TR')} eklendi ·{' '}
                  {importReport.totals.review.toLocaleString('tr-TR')} inceleme
                </span>
              </button>
              {showReport && (
                <div className="import-report-body">
                  <div className="report-grid">
                    <div>
                      <strong>{importReport.totals.found.toLocaleString('tr-TR')}</strong>
                      bulunan
                    </div>
                    <div>
                      <strong>{importReport.totals.allowed.toLocaleString('tr-TR')}</strong>
                      eklenen
                    </div>
                    <div>
                      <strong>{importReport.totals.duplicate.toLocaleString('tr-TR')}</strong>
                      tekrar
                    </div>
                    <div>
                      <strong>{importReport.totals.review.toLocaleString('tr-TR')}</strong>
                      inceleme
                    </div>
                  </div>
                  <ul>
                    {importReport.sources.map((s) => (
                      <li key={s.id}>
                        <strong>{s.label}</strong>
                        <span>
                          {s.added.toLocaleString('tr-TR')} eklendi / {s.found.toLocaleString('tr-TR')}{' '}
                          bulundu
                        </span>
                        {s.rejectReasons && Object.keys(s.rejectReasons).length > 0 && (
                          <small>
                            {Object.entries(s.rejectReasons)
                              .map(([reason, count]) => `${reasonLabel(reason)}: ${count}`)
                              .join(' · ')}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="filter-list">
            {mode === 'all' && (
              <button type="button" className="filter-item active">
                Tüm liste
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
              !SOURCE_SLUGS.has(selected) &&
              contentCategories.map((c) => (
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
            {mode === 'category' && SOURCE_SLUGS.has(selected) && (
              <button type="button" className="filter-item active">
                {categoryLabel(selected)}
                <span>{filtered.length}</span>
              </button>
            )}
          </div>
        </aside>

        <main className="main">
          <Player channel={active} />
          <EpgPanel channelId={active?.id} />

          <section className="channels">
            <div className="toolbar">
              <div className="toolbar-left">
                <h2 className="section-title">
                  {mode === 'all'
                    ? 'Tüm kanallar'
                    : mode === 'country'
                      ? countryLabel(selected)
                      : categoryLabel(selected)}
                </h2>
                <span className="count">{filtered.length.toLocaleString('tr-TR')} kanal</span>
              </div>
              {canDownloadPlaylist ? (
                <a className="btn btn-ghost" href={playlistHref} download>
                  Listeyi indir
                </a>
              ) : null}
            </div>

            {selected === 'review' && (
              <p className="review-note">
                Lisans durumu doğrulanamayan kayıtlar burada tutulur. Erişim kısıtı veya DRM aşılmaz;
                yalnızca inceleme listesidir.
              </p>
            )}

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
                      {ch.licenseStatus === 'review' && (
                        <span className="epg-badge review-badge">İNCELEME</span>
                      )}
                    </strong>
                    <small>
                      {ch.group}
                      {ch.rejectReason ? ` · ${reasonLabel(ch.rejectReason)}` : ''}
                    </small>
                  </div>
                </button>
              ))}
            </div>
            {visible.length < filtered.length && (
              <button
                type="button"
                className="btn btn-ghost more-btn"
                onClick={() => setVisibleCount((n) => n + 400)}
              >
                Daha fazla göster ({(filtered.length - visible.length).toLocaleString('tr-TR')} kaldı)
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
        <a href="https://github.com/Free-TV/IPTV" target="_blank" rel="noreferrer">
          Free-TV
        </a>
        {' · '}
        <a href="https://github.com/dearbulut/iptv" target="_blank" rel="noreferrer">
          Nexus
        </a>
        {' · '}
        <a href="https://github.com/Romaxa55/world_ip_tv" target="_blank" rel="noreferrer">
          World IPTV
        </a>
        {' · '}
        Rehber:{' '}
        <a href="https://github.com/iptv-org/epg" target="_blank" rel="noreferrer">
          iptv-org/epg
        </a>
      </footer>
    </div>
  )
}
