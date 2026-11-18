import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAYLISTS = path.join(ROOT, 'public/playlists')
const OUT = path.join(ROOT, 'public/catalog')

const ATTR_RE = /([a-zA-Z0-9-]+)="([^"]*)"/g

function splitExtinf(line) {
  // Channel name starts after the last comma that is outside double quotes.
  // Needed because http-user-agent values often contain commas.
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
const freeTvFile = path.join(PLAYLISTS, 'free-tv.m3u8')

const freeTvChannels = fs.existsSync(freeTvFile)
  ? parseM3u(freeTvFile, { source: 'free-tv' })
  : []

const countries = []
const categories = []
let total = 0

for (const file of fs.readdirSync(countryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const code = file.replace(/\.m3u$/, '')
  const local = parseM3u(path.join(countryDir, file))
  const fromFreeTv = freeTvChannels.filter((c) => c.country === code)
  const { merged } = mergeUnique(local, fromFreeTv)
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(merged))
  countries.push({ code, count: merged.length })
  total += merged.length
}

// Free-TV country codes that have no iptv-org country file yet
const knownCountryCodes = new Set(countries.map((c) => c.code))
const orphanByCountry = new Map()
for (const ch of freeTvChannels) {
  if (!ch.country || knownCountryCodes.has(ch.country)) continue
  if (!orphanByCountry.has(ch.country)) orphanByCountry.set(ch.country, [])
  orphanByCountry.get(ch.country).push(ch)
}
for (const [code, list] of [...orphanByCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(list))
  countries.push({ code, count: list.length })
  total += list.length
}

for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const slug = file.replace(/\.m3u$/, '')
  const channels = parseM3u(path.join(categoryDir, file))
  fs.writeFileSync(path.join(OUT, 'categories', `${slug}.json`), JSON.stringify(channels))
  categories.push({ slug, count: channels.length })
}

const orgAll = fs.existsSync(indexFile) ? parseM3u(indexFile) : []
const { merged: allChannels, added: freeTvAdded } = mergeUnique(orgAll, freeTvChannels)

fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(allChannels))
fs.writeFileSync(path.join(OUT, 'categories', 'free-tv.json'), JSON.stringify(freeTvChannels))
categories.push({ slug: 'free-tv', count: freeTvChannels.length })

const meta = {
  generatedAt: new Date().toISOString(),
  totalStreams: allChannels.length || total,
  allCount: allChannels.length,
  freeTvCount: freeTvChannels.length,
  freeTvAdded: freeTvAdded.length,
  countries: countries.sort((a, b) => b.count - a.count),
  categories: categories.sort((a, b) => b.count - a.count),
  playlists: {
    all: '/playlists/index.m3u',
    byCountry: '/playlists/index.country.m3u',
    byCategory: '/playlists/index.category.m3u',
    byLanguage: '/playlists/index.language.m3u',
    freeTv: '/playlists/free-tv.m3u8',
  },
  sources: [
    { id: 'iptv-org', label: 'iptv-org', count: orgAll.length },
    { id: 'free-tv', label: 'Free-TV/IPTV', count: freeTvChannels.length },
  ],
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))
console.log(
  `Catalog ready: ${meta.totalStreams} in index (+${freeTvAdded.length} Free-TV unique), ${countries.length} countries, ${categories.length} categories`,
)
