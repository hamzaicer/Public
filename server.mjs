import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proxyFetch, rewriteM3u } from './scripts/proxy-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, 'dist')
const app = express()
const port = Number(process.env.PORT || 4173)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, proxy: true })
})

app.get('/api/proxy', async (req, res) => {
  try {
    const target = req.query.url
    if (!target || typeof target !== 'string') {
      res.status(400).send('Missing url')
      return
    }
    const userAgent = typeof req.query.ua === 'string' ? req.query.ua : undefined
    const { res: upstream, parsed } = await proxyFetch(target, req.headers, { userAgent })
    if (!upstream.ok) {
      res.status(upstream.status).set('access-control-allow-origin', '*').send(`Upstream ${upstream.status}`)
      return
    }
    const contentType = upstream.headers.get('content-type') || ''
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.set('access-control-allow-origin', '*')
    res.set('cache-control', 'no-store')

    const isManifest =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      parsed.pathname.endsWith('.m3u8') ||
      parsed.pathname.endsWith('.m3u')

    if (isManifest) {
      const rewritten = rewriteM3u(buf.toString('utf8'), parsed.toString(), '/api/proxy?url=', userAgent)
      res.type('application/vnd.apple.mpegurl').send(rewritten)
      return
    }

    if (contentType) res.type(contentType)
    res.send(buf)
  } catch (err) {
    res.status(400).set('access-control-allow-origin', '*').send(String(err.message || err))
  }
})

app.use(express.static(dist))
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next(err)
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Beacon listening on http://127.0.0.1:${port}`)
})
