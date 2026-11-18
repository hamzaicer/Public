import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

function proxied(url, userAgent, referrer) {
  const ua = userAgent ? `&ua=${encodeURIComponent(userAgent)}` : ''
  const ref = referrer ? `&ref=${encodeURIComponent(referrer)}` : ''
  return `/api/proxy?url=${encodeURIComponent(url)}${ua}${ref}`
}

function isHlsUrl(url) {
  const u = url.toLowerCase()
  return u.includes('.m3u8') || u.includes('m3u8') || u.endsWith('.m3u') || u.includes('/hls/')
}

function isDashUrl(url) {
  return url.toLowerCase().includes('.mpd')
}

let proxyProbePromise

function detectProxy() {
  if (!proxyProbePromise) {
    proxyProbePromise = fetch('/api/proxy', { method: 'GET' })
      .then((res) => {
        // Express route answers 400 "Missing url" when the proxy is mounted.
        return res.status === 400 || res.status === 200
      })
      .catch(() => false)
  }
  return proxyProbePromise
}

function httpCodeFromHls(data) {
  return data?.response?.code || data?.response?.status || 0
}

function describeHlsError(data) {
  if (!data) return 'Yayın açılamadı.'
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    const code = httpCodeFromHls(data)
    if (code === 403 || code === 401) {
      return `Teknik erişim reddi (HTTP ${code}). Geo-block, oturum veya kaynak kısıtı olabilir; bu otomatik telif kararı değildir. DRM aşılmadı.`
    }
    if (code === 404) return 'Yayın adresi bulunamadı (HTTP 404).'
    if (code) return `Ağ hatası (HTTP ${code}).`
    return 'Ağ hatası: yayın adresine ulaşılamadı veya CORS engeli var.'
  }
  if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
    return 'Medya hatası: akış çözülemedi.'
  }
  return 'Yayın açılamadı.'
}

function isAccessDenied(data) {
  const code = httpCodeFromHls(data)
  return code === 401 || code === 403
}

const SOURCE_LABELS = {
  'iptv-org': 'iptv-org',
  'free-tv': 'Free-TV',
  nexus: 'Nexus',
  'nexus-online': 'Nexus Online',
  'nexus-best': 'Nexus Best',
  'world-iptv': 'World IPTV',
  'italy-open': 'İtalya',
  'pluto-tv': 'Pluto TV',
  'samsung-tv': 'Samsung+',
  'plex-tv': 'Plex',
  'tubi-tv': 'Tubi',
  'roku-tv': 'Roku',
  'whale-tv': 'Whale',
  'vidaa-tv': 'VIDAA',
  'iptv-org-streams': 'iptv-org',
}

export default function Player({ channel }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    let cancelled = false
    let loadTimer
    let hardTimer

    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }

    const clearTimers = () => {
      clearTimeout(loadTimer)
      clearTimeout(hardTimer)
    }

    setError('')
    setDetail('')
    setStatus(channel ? 'loading' : 'idle')
    cleanupHls()
    video.removeAttribute('src')
    video.load()

    if (!channel?.url) return undefined

    const sourceUrl = channel.url
    const userAgent = channel.userAgent || ''
    const referrer = channel.referrer || ''

    const fail = (message, extra = '') => {
      if (cancelled) return
      clearTimers()
      setStatus('error')
      setError(message)
      setDetail(extra)
      cleanupHls()
    }

    if (isDashUrl(sourceUrl)) {
      fail('DASH (.mpd) bu oynatıcıda desteklenmiyor.', 'DRM/DASH için yetkili sağlayıcı oynatıcısı gerekir.')
      return undefined
    }

    loadTimer = setTimeout(() => {
      if (!cancelled) {
        setDetail((d) => d || 'Bağlantı uzun sürüyor…')
      }
    }, 8000)

    // Never leave the UI stuck on “Bağlanıyor…” (e.g. repeated HLS recover on 403).
    hardTimer = setTimeout(() => {
      if (cancelled) return
      fail(
        'Yayın zaman aşımına uğradı.',
        'Kaynak yanıt vermiyor, CORS engeli var veya erişim reddedildi.',
      )
    }, 20000)

    ;(async () => {
      const hasProxy = await detectProxy()
      if (cancelled) return

      const useProxy = hasProxy
      const playUrl = useProxy ? proxied(sourceUrl, userAgent, referrer) : sourceUrl

      if (!useProxy) {
        setDetail('Bağlantı kuruluyor…')
      }

      const attachNative = (url) => {
        video.src = url
        const onLoaded = () => {
          if (cancelled) return
          clearTimers()
          setStatus('playing')
          setDetail('Canlı yayın')
          video.play().catch(() => {})
        }
        const onErr = () => {
          fail(
            'Yayın yüklenemedi.',
            useProxy
              ? 'Proxy yanıt verdi ama medya açılamadı.'
              : 'CORS veya bağlantı engeli olabilir. `npm start` ile proxy’li sunucuyu deneyin.',
          )
        }
        video.addEventListener('loadedmetadata', onLoaded, { once: true })
        video.addEventListener('error', onErr, { once: true })
      }

      const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl')

      const tryHls =
        Hls.isSupported() &&
        (isHlsUrl(sourceUrl) || /^https?:/i.test(sourceUrl))

      if (tryHls) {
        let didNetworkRecover = false
        let didMediaRecover = false
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxMaxBufferLength: 60,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 6,
          // Authorized public HLS only — no DRM license hooking.
          xhrSetup(xhr, requestUrl) {
            if (!useProxy) return
            if (requestUrl.includes('/api/proxy?url=')) return
            // hls.js calls open() before xhrSetup; reopen against the CORS proxy.
            xhr.open('GET', proxied(requestUrl, userAgent, referrer), true)
          },
        })
        hlsRef.current = hls
        hls.loadSource(playUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return
          clearTimers()
          setStatus('playing')
          setDetail('Canlı yayın')
          video.play().catch(() => {})
        })

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (cancelled || !data?.fatal) return
          // Do not retry access-denied responses (rights / auth) — surface them immediately.
          if (isAccessDenied(data)) {
            fail(describeHlsError(data), 'Teknik erişim sonucu; yayın adresi gösterilmez.')
            return
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !didNetworkRecover) {
            didNetworkRecover = true
            try {
              hls.startLoad()
              return
            } catch {
              // fall through
            }
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !didMediaRecover) {
            didMediaRecover = true
            try {
              hls.recoverMediaError()
              return
            } catch {
              // fall through
            }
          }
          fail(describeHlsError(data), 'Teknik hata; yayın adresi gösterilmez.')
        })
      } else if (isHlsUrl(sourceUrl) && canNativeHls) {
        attachNative(playUrl)
      } else if (isHlsUrl(sourceUrl)) {
        fail('Bu tarayıcıda HLS desteklenmiyor.', 'Modern Chrome/Firefox veya Safari kullanın.')
      } else {
        // MPEG-TS / progressive / unknown — try native <video>, report clearly on failure.
        setDetail('HLS dışı kaynak; tarayıcı desteği sınırlı olabilir.')
        attachNative(playUrl)
        // If metadata never arrives, time out to error.
        setTimeout(() => {
          if (cancelled) return
          if (video.readyState < 1) {
            fail(
              'Bu yayın formatı tarayıcıda açılamıyor.',
              'Yetkili sağlayıcının HLS (m3u8) veya desteklenen bir adresi gerekir.',
            )
          }
        }, 10000)
      }
    })()

    return () => {
      cancelled = true
      clearTimers()
      cleanupHls()
    }
  }, [channel, reloadKey])

  const sourceLabel = channel?.source ? SOURCE_LABELS[channel.source] || channel.source : ''

  return (
    <section className="panel player">
      <div className="player-stage">
        <video ref={videoRef} controls playsInline autoPlay muted />
        {!channel && (
          <div className="player-empty">
            <strong>Bir kanal seç</strong>
            <span>Soldan paket veya kategori seç, listeden yayına tıkla.</span>
          </div>
        )}
        {channel && status === 'loading' && (
          <div className="player-empty">
            <strong>Bağlanıyor…</strong>
            <span>{channel.name}</span>
            {detail && <span className="player-detail">{detail}</span>}
          </div>
        )}
        {channel && status === 'error' && (
          <div className="player-error">
            <strong>Yayın yüklenmedi</strong>
            <span>{error}</span>
            {detail && <span className="player-detail">{detail}</span>}
          </div>
        )}
      </div>
      <div className="player-meta">
        <div>
          <h3>{channel?.name || 'Beacon Player'}</h3>
          <p>
            {channel ? channel.group : 'Açık yayın kataloğu'}
            {sourceLabel ? ` · ${sourceLabel}` : ''}
            {status === 'playing' && detail ? ` · ${detail}` : ''}
          </p>
        </div>
        {channel && status === 'error' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Yeniden dene
          </button>
        )}
      </div>
    </section>
  )
}
