import { useEffect, useState } from 'react'
import { formatRange, loadChannelEpg, pickNowNext, progressPercent } from '../lib/epg.js'

export default function EpgPanel({ channelId }) {
  const [state, setState] = useState({ loading: false, error: '', bundle: null, slice: null })

  useEffect(() => {
    if (!channelId) {
      setState({ loading: false, error: '', bundle: null, slice: null })
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    ;(async () => {
      try {
        const bundle = await loadChannelEpg(channelId)
        if (cancelled) return
        if (!bundle) {
          setState({ loading: false, error: 'Bu kanal için EPG yok', bundle: null, slice: null })
          return
        }
        setState({
          loading: false,
          error: '',
          bundle,
          slice: pickNowNext(bundle.programs),
        })
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err.message || 'EPG yüklenemedi', bundle: null, slice: null })
        }
      }
    })()
    const timer = setInterval(() => {
      setState((s) => {
        if (!s.bundle) return s
        return { ...s, slice: pickNowNext(s.bundle.programs) }
      })
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [channelId])

  if (!channelId) return null

  const { loading, error, slice } = state
  const current = slice?.now
  const next = slice?.next
  const upcoming = slice?.upcoming || []

  return (
    <section className="panel epg">
      <div className="epg-head">
        <h3>Program rehberi</h3>
        <span className="chip">iptv-org/epg · Europe/Istanbul</span>
      </div>

      {loading && <div className="empty">EPG yükleniyor…</div>}
      {!loading && error && <div className="empty">{error}</div>}

      {!loading && !error && current && (
        <div className="epg-now">
          <div className="epg-now-top">
            <span className="epg-live">Şimdi</span>
            <span className="epg-time">{formatRange(current)}</span>
          </div>
          <strong>{current.title}</strong>
          {current.category && <small>{current.category}</small>}
          {current.desc && <p>{current.desc}</p>}
          <div className="epg-progress" aria-hidden="true">
            <i style={{ width: `${progressPercent(current)}%` }} />
          </div>
        </div>
      )}

      {!loading && !error && !current && next && (
        <div className="epg-now">
          <div className="epg-now-top">
            <span className="chip">Sıradaki</span>
            <span className="epg-time">{formatRange(next)}</span>
          </div>
          <strong>{next.title}</strong>
          {next.category && <small>{next.category}</small>}
        </div>
      )}

      {!loading && !error && upcoming.length > 0 && (
        <ul className="epg-list">
          {upcoming.map((p) => (
            <li key={`${p.start}-${p.title}`}>
              <span>{formatRange(p)}</span>
              <div>
                <strong>{p.title}</strong>
                {p.category && <small>{p.category}</small>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && !current && !next && (
        <div className="empty">Bu kanal için yakında program kaydı yok.</div>
      )}
    </section>
  )
}
