import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

export default function Player({ channel }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    setError('')
    setStatus(channel ? 'loading' : 'idle')

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    video.removeAttribute('src')
    video.load()

    if (!channel?.url) return undefined

    const url = channel.url
    const kind = channel.kind || 'other'
    const onError = (message) => {
      setStatus('error')
      setError(message)
    }

    if (kind === 'youtube' || kind === 'twitch') {
      onError(
        kind === 'youtube'
          ? 'Bu kanal YouTube live. Tarayıcı oynatıcısı yerine Kaynak URL ile açın.'
          : 'Bu kanal Twitch live. Tarayıcı oynatıcısı yerine Kaynak URL ile açın.',
      )
      return undefined
    }

    if (kind === 'dash' || url.includes('.mpd')) {
      onError('Bu yayın DASH formatında; tarayıcıda açılamayabilir. VLC ile deneyin.')
      return undefined
    }

    if (Hls.isSupported() && (kind === 'hls' || url.includes('m3u8'))) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('playing')
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        onError('Yayın tarayıcıda açılamadı (CORS / geo-block / kaynak kapalı). VLC ile deneyin.')
        hls.destroy()
        hlsRef.current = null
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener(
        'loadedmetadata',
        () => {
          setStatus('playing')
          video.play().catch(() => {})
        },
        { once: true },
      )
      video.addEventListener('error', () => onError('Yayın yüklenemedi.'), { once: true })
    } else {
      video.src = url
      video.play().catch(() => onError('Bu format tarayıcıda desteklenmiyor.'))
      setStatus('playing')
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [channel])

  return (
    <section className="panel player">
      <div className="player-stage">
        <video ref={videoRef} controls playsInline />
        {!channel && (
          <div className="player-empty">
            <strong>Bir kanal seç</strong>
            <span>Soldan ülke veya grup seç, listeden yayına tıkla.</span>
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
          <h3>{channel?.name || 'Free TV Player'}</h3>
          <p>{channel ? channel.group : 'Free-TV/IPTV ücretsiz kanallar'}</p>
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
