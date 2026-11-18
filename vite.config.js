import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { looksLikeM3u, proxyFetch, rewriteM3u } from './scripts/proxy-utils.mjs'

function attachStreamProxy(middlewares) {
  middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/api/proxy')) return next()
    try {
      const incoming = new URL(req.url, 'http://127.0.0.1')
      const target = incoming.searchParams.get('url')
      const userAgent = incoming.searchParams.get('ua') || undefined
      const referer = incoming.searchParams.get('ref') || undefined
      if (!target) {
        res.statusCode = 400
        res.end('Missing url')
        return
      }
      const { res: upstream, finalUrl } = await proxyFetch(target, req.headers, { userAgent, referer })
      if (!upstream.ok) {
        res.statusCode = upstream.status
        res.setHeader('access-control-allow-origin', '*')
        res.end(`Upstream ${upstream.status}`)
        return
      }

      const contentType = upstream.headers.get('content-type') || ''
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.statusCode = 200
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('cache-control', 'no-store')

      const text = buf.toString('utf8')
      let pathName = ''
      try {
        pathName = new URL(finalUrl).pathname
      } catch {
        // ignore
      }
      if (looksLikeM3u(contentType, text, pathName)) {
        const rewritten = rewriteM3u(text, finalUrl, '/api/proxy?url=', userAgent, referer)
        res.setHeader('content-type', 'application/vnd.apple.mpegurl')
        res.end(rewritten)
        return
      }

      if (contentType) res.setHeader('content-type', contentType)
      res.end(buf)
    } catch (err) {
      res.statusCode = 400
      res.setHeader('access-control-allow-origin', '*')
      res.end(String(err.message || err))
    }
  })
}

function streamProxyPlugin() {
  return {
    name: 'iptv-stream-proxy',
    configureServer(server) {
      attachStreamProxy(server.middlewares)
    },
    configurePreviewServer(server) {
      // Same CORS proxy for `vite preview` (previously missing → yayınlar CORS’ta düşüyordu).
      attachStreamProxy(server.middlewares)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), streamProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
