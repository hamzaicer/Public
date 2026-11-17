import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { proxyFetch, rewriteM3u } from './scripts/proxy-utils.mjs'

function streamProxyPlugin() {
  return {
    name: 'iptv-stream-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/proxy')) return next()
        try {
          const incoming = new URL(req.url, 'http://127.0.0.1')
          const target = incoming.searchParams.get('url')
          const userAgent = incoming.searchParams.get('ua') || undefined
          if (!target) {
            res.statusCode = 400
            res.end('Missing url')
            return
          }
          const { res: upstream, parsed } = await proxyFetch(target, req.headers, { userAgent })
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

          const isManifest =
            contentType.includes('mpegurl') ||
            contentType.includes('m3u8') ||
            parsed.pathname.endsWith('.m3u8') ||
            parsed.pathname.endsWith('.m3u')

          if (isManifest) {
            const text = buf.toString('utf8')
            const rewritten = rewriteM3u(text, parsed.toString(), '/api/proxy?url=', userAgent)
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
