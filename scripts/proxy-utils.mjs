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

export function rewriteM3u(body, baseUrl, proxyPrefix, ua) {
  const base = new URL(baseUrl)
  const uaQ = ua ? `&ua=${encodeURIComponent(ua)}` : ''
  const wrap = (abs) => `${proxyPrefix}${encodeURIComponent(abs)}${uaQ}`
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

  const res = await undiciFetch(parsed.toString(), {
    headers,
    redirect: 'follow',
    dispatcher: insecureAgent,
  })
  return { res, parsed }
}
