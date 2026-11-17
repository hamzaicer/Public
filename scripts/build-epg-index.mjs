import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'public/epg/tr.json')
const OUT_DIR = path.join(ROOT, 'public/epg')
const OUT_INDEX = path.join(OUT_DIR, 'index.json')
const OUT_BY = path.join(OUT_DIR, 'channels')

if (!fs.existsSync(SRC)) {
  console.error('Missing public/epg/tr.json — run iptv-org/epg grab first')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
fs.mkdirSync(OUT_BY, { recursive: true })

const byChannel = new Map()

for (const p of raw.programs || []) {
  const id = p.channel
  if (!id || typeof id !== 'string') continue
  const title = p.titles?.[0]?.value || 'Program'
  const desc = p.descriptions?.[0]?.value || ''
  const category = p.categories?.[0]?.value || ''
  const icon = p.icons?.[0]?.src || p.images?.[0]?.value || ''
  const item = {
    start: p.start,
    stop: p.stop,
    title,
    desc: desc.slice(0, 280),
    category,
    icon,
  }
  if (!byChannel.has(id)) byChannel.set(id, [])
  byChannel.get(id).push(item)
}

for (const list of byChannel.values()) {
  list.sort((a, b) => a.start - b.start)
}

// Drop empty / numeric-only junk channel keys that do not match iptv-org ids
const usable = [...byChannel.entries()].filter(([id]) => id.includes('.'))

const meta = {
  generatedAt: new Date().toISOString(),
  source: 'iptv-org/epg',
  sites: ['tvplus.com.tr', 'digiturk.com.tr', 'dsmart.com.tr', 'turksatkablo.com.tr'],
  date: raw.date || null,
  channels: usable.length,
  programs: usable.reduce((n, [, list]) => n + list.length, 0),
  ids: usable.map(([id]) => id).sort(),
}

for (const [id, programs] of usable) {
  const safe = id.replace(/[^\w.@+-]+/g, '_')
  fs.writeFileSync(path.join(OUT_BY, `${safe}.json`), JSON.stringify({ id, programs }))
}

fs.writeFileSync(OUT_INDEX, JSON.stringify(meta, null, 2))
console.log(
  `EPG index ready: ${meta.channels} channels, ${meta.programs} programs → public/epg/channels/`,
)
