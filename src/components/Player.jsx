import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

function proxied(url, userAgent) {
  const ua = userAgent ? `&ua=${encodeURIComponent(userAgent)}` : ''
  return `/api/proxy?url=${encodeURIComponent(url)}${ua}`
}

async function resolvePlayUrl(sourceUrl, userAgent) {
  try {
    const probe = await fetch(proxied(sourceUrl, userAgent), { method: 'GET' })
    if (probe.ok) return proxied(sourceUrl, userAgent)
  } catch {
    // fall through
  }
  return sourceUrl
}

export default function Player({ channel }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    let cancelled = false
    setError('')
    setStatus(channel ? 'loading' : 'idle')

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    video.removeAttribute('src')
    video.load()

    if (!channel?.url) return undefined

    const sourceUrl = channel.url
    const userAgent = channel.userAgent || ''
    const onError = (message) => {
      if (cancelled) return
      setStatus('error')
      setError(message)
    }

    if (sourceUrl.includes('.mpd')) {
      onError('Bu yayın DASH formatında; bu tarayıcıda açılamıyor.')
      return undefined
    }

    ;(async () => {
      const playUrl = await resolvePlayUrl(sourceUrl, userAgent)
      if (cancelled) return
      const usingProxy = playUrl.includes('/api/proxy?url=')

      const playViaHls = (url) => {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          xhrSetup(xhr, requestUrl) {
            if (usingProxy && !requestUrl.includes('/api/proxy?url=')) {
              xhr.open('GET', proxied(requestUrl, userAgent), true)
            }
          },
        })
        hlsRef.current = hls
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return
          setStatus('playing')
          video.play().catch(() => {})
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return
          onError('Yayın açılamadı. Başka bir kanal dene.')
          hls.destroy()
          hlsRef.current = null
        })
      }

      if (
        Hls.isSupported() &&
        (sourceUrl.includes('.m3u8') || sourceUrl.includes('m3u8') || sourceUrl.includes('.m3u'))
      ) {
        playViaHls(playUrl)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playUrl
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (cancelled) return
            setStatus('playing')
            video.play().catch(() => {})
          },
          { once: true },
        )
        video.addEventListener('error', () => onError('Yayın yüklenemedi.'), { once: true })
      } else {
        video.src = usingProxy ? playUrl : sourceUrl
        video.play().catch(() => onError('Bu format tarayıcıda desteklenmiyor.'))
        setStatus('playing')
      }
    })()

    return () => {
      cancelled = true
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [channel])

  return (
    <section className="panel player">
      <div className="player-stage">
        <video ref={videoRef} controls playsInline autoPlay muted />
        {!channel && (
          <div className="player-empty">
            <strong>Bir kanal seç</strong>
            <span>Soldan ülke veya kategori seç, listeden yayına tıkla.</span>
          </div>
        )}
        {channel && status === 'loading' && (
          <div className="player-empty">
            <strong>Bağlanıyor…</strong>
            <span>{channel.name}</span>
          </div>
        )}
        {channel && status === 'error' && (
          <div className="player-error">
            <strong>Önizleme yok</strong>
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="player-meta">
        <div>
          <h3>{channel?.name || 'Beacon Player'}</h3>
          <p>{channel ? channel.group : 'iptv-org açık yayınları'}</p>
        </div>
        {channel && (
          <div className="cta-row">
            <a className="btn btn-ghost" href={channel.url} target="_blank" rel="noreferrer">
              Kaynak URL
            </a>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigator.clipboard.writeText(channel.url)}
            >
              Linki kopyala
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
