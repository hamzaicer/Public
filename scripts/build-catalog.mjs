import fs from 'node:fs'
import path from 'node:path'
import { EXTRA_SOURCES } from './sync-playlists.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAYLISTS = path.join(ROOT, 'public/playlists')
const OUT = path.join(ROOT, 'public/catalog')

const ATTR_RE = /([a-zA-Z0-9-]+)="([^"]*)"/g

const EXTRA_PLAYLISTS = [
  ...EXTRA_SOURCES,
  {
    name: 'iptv-org-streams',
    label: 'iptv-org streams API',
    file: 'iptv-org-streams.m3u',
    categorySlug: 'iptv-org-streams',
  },
]

function splitExtinf(line) {
  let inQuotes = false
  let lastComma = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) lastComma = i
  }
  if (lastComma < 0) return { attrsPart: line, name: 'Unknown' }
  return {
    attrsPart: line.slice(0, lastComma),
    name: line.slice(lastComma + 1).trim() || 'Unknown',
  }
}

function parseExtinf(line) {
  const { attrsPart, name } = splitExtinf(line)
  const attrs = {}
  for (const match of attrsPart.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2]
  }
  return { name, attrs }
}

function parseM3u(filePath, { source } = {}) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const channels = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF:')) continue
    const { name, attrs } = parseExtinf(line)
    let url = ''
    let userAgent = attrs['http-user-agent'] || ''
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next) continue
      if (next.startsWith('#EXTVLCOPT:http-user-agent=')) {
        userAgent = next.slice('#EXTVLCOPT:http-user-agent='.length)
        continue
      }
      if (next.startsWith('#EXTVLCOPT:http-referrer=')) continue
      if (next.startsWith('#')) continue
      url = next
      i = j
      break
    }
    if (!url) continue
    const group = attrs['group-title'] || 'General'
    const channel = {
      id: attrs['tvg-id'] || `${name}-${channels.length}`,
      name,
      logo: attrs['tvg-logo'] || '',
      group,
      url,
      userAgent: userAgent || undefined,
      country: (attrs['tvg-country'] || '').toLowerCase() || undefined,
    }
    if (source) channel.source = source
    channels.push(channel)
  }
  return channels
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function mergeUnique(base, extras) {
  const seen = new Set(base.map((c) => normalizeUrl(c.url)))
  const added = []
  for (const ch of extras) {
    const key = normalizeUrl(ch.url)
    if (seen.has(key)) continue
    seen.add(key)
    added.push(ch)
  }
  return { merged: [...base, ...added], added }
}

ensureDir(OUT)
ensureDir(path.join(OUT, 'countries'))
ensureDir(path.join(OUT, 'categories'))

const countryDir = path.join(PLAYLISTS, 'countries')
const categoryDir = path.join(PLAYLISTS, 'categories')
const indexFile = path.join(PLAYLISTS, 'index.m3u')

const extraBundles = []
for (const src of EXTRA_PLAYLISTS) {
  const filePath = path.join(PLAYLISTS, src.file)
  if (!fs.existsSync(filePath)) continue
  const channels = parseM3u(filePath, { source: src.name })
  extraBundles.push({ ...src, channels })
}

const allExtraChannels = extraBundles.flatMap((b) => b.channels)

const countries = []
const categories = []
let total = 0

for (const file of fs.readdirSync(countryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const code = file.replace(/\.m3u$/, '')
  const local = parseM3u(path.join(countryDir, file))
  const fromExtras = allExtraChannels.filter((c) => c.country === code)
  const { merged } = mergeUnique(local, fromExtras)
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(merged))
  countries.push({ code, count: merged.length })
  total += merged.length
}

const knownCountryCodes = new Set(countries.map((c) => c.code))
const orphanByCountry = new Map()
for (const ch of allExtraChannels) {
  if (!ch.country || knownCountryCodes.has(ch.country)) continue
  if (!orphanByCountry.has(ch.country)) orphanByCountry.set(ch.country, [])
  orphanByCountry.get(ch.country).push(ch)
}
for (const [code, list] of [...orphanByCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const unique = mergeUnique([], list).merged
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(unique))
  countries.push({ code, count: unique.length })
  total += unique.length
}

for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const slug = file.replace(/\.m3u$/, '')
  const channels = parseM3u(path.join(categoryDir, file))
  fs.writeFileSync(path.join(OUT, 'categories', `${slug}.json`), JSON.stringify(channels))
  categories.push({ slug, count: channels.length })
}

const orgAll = fs.existsSync(indexFile) ? parseM3u(indexFile) : []
let allChannels = orgAll
const addedBySource = {}
for (const bundle of extraBundles) {
  const { merged, added } = mergeUnique(allChannels, bundle.channels)
  allChannels = merged
  addedBySource[bundle.name] = added.length
  fs.writeFileSync(
    path.join(OUT, 'categories', `${bundle.categorySlug}.json`),
    JSON.stringify(bundle.channels),
  )
  categories.push({ slug: bundle.categorySlug, count: bundle.channels.length })
}

fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(allChannels))

const meta = {
  generatedAt: new Date().toISOString(),
  totalStreams: allChannels.length || total,
  allCount: allChannels.length,
  addedBySource,
  countries: countries.sort((a, b) => b.count - a.count),
  categories: categories.sort((a, b) => b.count - a.count),
  playlists: {
    all: '/playlists/index.m3u',
    byCountry: '/playlists/index.country.m3u',
    byCategory: '/playlists/index.category.m3u',
    byLanguage: '/playlists/index.language.m3u',
    freeTv: '/playlists/free-tv.m3u8',
    nexus: '/playlists/nexus.m3u',
    nexusOnline: '/playlists/nexus-online.m3u',
    worldIptv: '/playlists/world-iptv.m3u',
    iptvOrgStreams: '/playlists/iptv-org-streams.m3u',
  },
  sources: [
    { id: 'iptv-org', label: 'iptv-org', count: orgAll.length },
    ...extraBundles.map((b) => ({
      id: b.name,
      label: b.label,
      count: b.channels.length,
      added: addedBySource[b.name] || 0,
    })),
  ],
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))
console.log(
  `Catalog ready: ${meta.totalStreams} unique streams, ${countries.length} countries, ${categories.length} categories`,
)
console.log('Added by source:', addedBySource)
