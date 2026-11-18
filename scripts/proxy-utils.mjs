import net from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import { URL } from 'node:url'

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal'])

const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
    timeout: 20_000,
  },
  headersTimeout: 20_000,
  bodyTimeout: 60_000,
})

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return false
  if (ip === '127.0.0.1' || ip === '::1') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('169.254.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  return false
}

export function assertSafeProxyUrl(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) URLs allowed')
  }
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blocked host')
  }
  if (isPrivateIp(host)) {
    throw new Error('Private IP blocked')
  }
  return parsed
}

export function rewriteM3u(body, baseUrl, proxyPrefix, ua, referer) {
  const base = new URL(baseUrl)
  const uaQ = ua ? `&ua=${encodeURIComponent(ua)}` : ''
  const refQ = referer ? `&ref=${encodeURIComponent(referer)}` : ''
  const wrap = (abs) => `${proxyPrefix}${encodeURIComponent(abs)}${uaQ}${refQ}`
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          try {
            return `URI="${wrap(new URL(uri, base).toString())}"`
          } catch {
            return _m
          }
        })
      }
      try {
        return wrap(new URL(trimmed, base).toString())
      } catch {
        return line
      }
    })
    .join('\n')
}

export function looksLikeM3u(contentType = '', bodyText = '', urlPath = '') {
  const ct = contentType.toLowerCase()
  if (ct.includes('mpegurl') || ct.includes('m3u8') || ct.includes('x-m3u')) return true
  const path = urlPath.toLowerCase()
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return true
  const head = bodyText.slice(0, 64).trimStart()
  return head.startsWith('#EXTM3U') || head.startsWith('#EXTINF')
}

export async function proxyFetch(targetUrl, reqHeaders = {}, opts = {}) {
  const parsed = assertSafeProxyUrl(targetUrl)
  const headers = {
    'user-agent':
      opts.userAgent ||
      reqHeaders['x-stream-ua'] ||
      reqHeaders['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    accept: reqHeaders.accept || '*/*',
  }
  if (reqHeaders.referer) headers.referer = reqHeaders.referer
  if (opts.referer) headers.referer = opts.referer
  // Many CDNs also check Origin; derive from referer when present.
  const referer = headers.referer
  if (referer) {
    try {
      headers.origin = new URL(referer).origin
    } catch {
      // ignore
    }
  }
  if (reqHeaders.range) headers.range = reqHeaders.range

  const res = await undiciFetch(parsed.toString(), {
    headers,
    redirect: 'follow',
    dispatcher: insecureAgent,
  })
  // After redirects (e.g. jmp2.uk → CDN), rewrite relative playlist URLs against the final URL.
  let finalUrl = parsed.toString()
  try {
    if (res.url) finalUrl = new URL(res.url).toString()
  } catch {
    // keep original
  }
  return { res, parsed, finalUrl }
}
