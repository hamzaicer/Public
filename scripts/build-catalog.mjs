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

function parseM3u(filePath) {
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
    channels.push({
      id: attrs['tvg-id'] || `${name}-${channels.length}`,
      name,
      logo: attrs['tvg-logo'] || '',
      group,
      url,
      userAgent: userAgent || undefined,
    })
  }
  return channels
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

ensureDir(OUT)
ensureDir(path.join(OUT, 'countries'))
ensureDir(path.join(OUT, 'categories'))

const countryDir = path.join(PLAYLISTS, 'countries')
const categoryDir = path.join(PLAYLISTS, 'categories')
const indexFile = path.join(PLAYLISTS, 'index.m3u')

const countries = []
const categories = []
let total = 0

for (const file of fs.readdirSync(countryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const code = file.replace(/\.m3u$/, '')
  const channels = parseM3u(path.join(countryDir, file))
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(channels))
  countries.push({ code, count: channels.length })
  total += channels.length
}

for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const slug = file.replace(/\.m3u$/, '')
  const channels = parseM3u(path.join(categoryDir, file))
  fs.writeFileSync(path.join(OUT, 'categories', `${slug}.json`), JSON.stringify(channels))
  categories.push({ slug, count: channels.length })
}

const allChannels = fs.existsSync(indexFile) ? parseM3u(indexFile) : []
fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(allChannels))

const meta = {
  generatedAt: new Date().toISOString(),
  totalStreams: allChannels.length || total,
  allCount: allChannels.length,
  countries: countries.sort((a, b) => b.count - a.count),
  categories: categories.sort((a, b) => b.count - a.count),
  playlists: {
    all: '/playlists/index.m3u',
    byCountry: '/playlists/index.country.m3u',
    byCategory: '/playlists/index.category.m3u',
    byLanguage: '/playlists/index.language.m3u',
  },
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))
console.log(
  `Catalog ready: ${meta.totalStreams} in index, ${countries.length} countries, ${categories.length} categories`,
)
