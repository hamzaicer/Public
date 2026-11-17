import net from 'node:net'
import { URL } from 'node:url'

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal'])

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

export function rewriteM3u(body, baseUrl, proxyPrefix) {
  const base = new URL(baseUrl)
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        // Rewrite URI="..." inside tags
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          try {
            const abs = new URL(uri, base).toString()
            return `URI="${proxyPrefix}${encodeURIComponent(abs)}"`
          } catch {
            return _m
          }
        })
      }
      try {
        const abs = new URL(trimmed, base).toString()
        return `${proxyPrefix}${encodeURIComponent(abs)}`
      } catch {
        return line
      }
    })
    .join('\n')
}

export async function proxyFetch(targetUrl, reqHeaders = {}) {
  const parsed = assertSafeProxyUrl(targetUrl)
  const headers = {
    'user-agent':
      reqHeaders['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    accept: reqHeaders.accept || '*/*',
  }
  if (reqHeaders.referer) headers.referer = reqHeaders.referer
  if (reqHeaders.origin) headers.origin = reqHeaders.origin

  const res = await fetch(parsed.toString(), {
    headers,
    redirect: 'follow',
  })
  return { res, parsed }
}
