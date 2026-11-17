import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAYLIST = path.join(ROOT, 'public/playlists/index.m3u8')
const OUT = path.join(ROOT, 'public/catalog')
const COUNTRY_M3U = path.join(ROOT, 'public/playlists/by-country')
const GROUP_M3U = path.join(ROOT, 'public/playlists/by-group')

const ATTR_RE = /([a-zA-Z0-9-]+)="([^"]*)"/g

const GROUP_TO_CODE = {
  albania: 'al',
  andorra: 'ad',
  argentina: 'ar',
  armenia: 'am',
  australia: 'au',
  austria: 'at',
  azerbaijan: 'az',
  belarus: 'by',
  belgium: 'be',
  'bosnia and herzegovina': 'ba',
  brazil: 'br',
  bulgaria: 'bg',
  canada: 'ca',
  chad: 'td',
  chile: 'cl',
  china: 'cn',
  'costa rica': 'cr',
  croatia: 'hr',
  cyprus: 'cy',
  'czech republic': 'cz',
  denmark: 'dk',
  'dominican republic': 'do',
  egypt: 'eg',
  estonia: 'ee',
  'faroe islands': 'fo',
  finland: 'fi',
  france: 'fr',
  georgia: 'ge',
  germany: 'de',
  greece: 'gr',
  greenland: 'gl',
  'hong kong': 'hk',
  hungary: 'hu',
  iceland: 'is',
  india: 'in',
  indonesia: 'id',
  iran: 'ir',
  iraq: 'iq',
  ireland: 'ie',
  israel: 'il',
  italy: 'it',
  japan: 'jp',
  '日本 / japan': 'jp',
  kazakhstan: 'kz',
  kenya: 'ke',
  korea: 'kr',
  kosovo: 'xk',
  latvia: 'lv',
  lebanon: 'lb',
  lithuania: 'lt',
  luxembourg: 'lu',
  macau: 'mo',
  malta: 'mt',
  mexico: 'mx',
  moldova: 'md',
  monaco: 'mc',
  mongolia: 'mn',
  montenegro: 'me',
  netherlands: 'nl',
  nigeria: 'ng',
  'north korea': 'kp',
  'north macedonia': 'mk',
  norway: 'no',
  paraguay: 'py',
  peru: 'pe',
  poland: 'pl',
  portugal: 'pt',
  qatar: 'qa',
  romania: 'ro',
  russia: 'ru',
  'san marino': 'sm',
  'saudi arabia': 'sa',
  serbia: 'rs',
  slovakia: 'sk',
  slovenia: 'si',
  somalia: 'so',
  spain: 'es',
  sweden: 'se',
  switzerland: 'ch',
  taiwan: 'tw',
  trinidad: 'tt',
  turkey: 'tr',
  turkmenistan: 'tm',
  uk: 'uk',
  ukraine: 'ua',
  'united arab emirates': 'ae',
  usa: 'us',
  venezuela: 've',
}

function parseExtinf(line) {
  const comma = line.indexOf(',')
  const attrsPart = comma >= 0 ? line.slice(0, comma) : line
  const name = comma >= 0 ? line.slice(comma + 1).trim() : 'Unknown'
  const attrs = {}
  for (const match of attrsPart.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2]
  }
  return { name, attrs }
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

function resolveCountry(attrs, group) {
  const raw = (attrs['tvg-country'] || '').trim().toLowerCase()
  if (raw && /^[a-z]{2}$/.test(raw)) return raw
  if (raw.includes(',')) {
    const first = raw.split(',')[0].trim().toLowerCase()
    if (/^[a-z]{2}$/.test(first)) return first
  }
  return GROUP_TO_CODE[group.toLowerCase()] || null
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
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next || next.startsWith('#')) continue
      url = next
      i = j
      break
    }
    if (!url) continue
    const group = attrs['group-title'] || 'General'
    const country = resolveCountry(attrs, group)
    const kind = /youtube\.com|youtu\.be/i.test(url)
      ? 'youtube'
      : /twitch\.tv/i.test(url)
        ? 'twitch'
        : /\.mpd(\?|$)/i.test(url)
          ? 'dash'
          : /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
            ? 'hls'
            : 'other'
    channels.push({
      id: attrs['tvg-id'] || `${slugify(name)}-${channels.length}`,
      name,
      logo: attrs['tvg-logo'] || '',
      group,
      country: country || '',
      url,
      kind,
    })
  }
  return channels
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeM3u(filePath, channels) {
  const body = ['#EXTM3U']
  for (const ch of channels) {
    const logo = ch.logo ? ` tvg-logo="${ch.logo}"` : ''
    const id = ch.id ? ` tvg-id="${ch.id}"` : ''
    const country = ch.country ? ` tvg-country="${ch.country.toUpperCase()}"` : ''
    body.push(`#EXTINF:-1${id}${logo}${country} group-title="${ch.group}",${ch.name}`)
    body.push(ch.url)
  }
  fs.writeFileSync(filePath, `${body.join('\n')}\n`)
}

fs.rmSync(path.join(OUT, 'countries'), { recursive: true, force: true })
fs.rmSync(path.join(OUT, 'groups'), { recursive: true, force: true })
fs.rmSync(COUNTRY_M3U, { recursive: true, force: true })
fs.rmSync(GROUP_M3U, { recursive: true, force: true })
ensureDir(OUT)
ensureDir(path.join(OUT, 'countries'))
ensureDir(path.join(OUT, 'groups'))
ensureDir(COUNTRY_M3U)
ensureDir(GROUP_M3U)

const all = parseM3u(PLAYLIST)
const byCountry = new Map()
const byGroup = new Map()

for (const ch of all) {
  if (ch.country) {
    if (!byCountry.has(ch.country)) byCountry.set(ch.country, [])
    byCountry.get(ch.country).push(ch)
  }
  const gslug = slugify(ch.group)
  if (!byGroup.has(gslug)) byGroup.set(gslug, { title: ch.group, channels: [] })
  byGroup.get(gslug).channels.push(ch)
}

const countries = []
for (const [code, channels] of [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length)) {
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(channels))
  writeM3u(path.join(COUNTRY_M3U, `${code}.m3u8`), channels)
  countries.push({ code, count: channels.length })
}

const groups = []
for (const [slug, { title, channels }] of [...byGroup.entries()].sort(
  (a, b) => b[1].channels.length - a[1].channels.length,
)) {
  fs.writeFileSync(path.join(OUT, 'groups', `${slug}.json`), JSON.stringify(channels))
  writeM3u(path.join(GROUP_M3U, `${slug}.m3u8`), channels)
  groups.push({ slug, title, count: channels.length })
}

const meta = {
  source: 'https://github.com/Free-TV/IPTV',
  generatedAt: new Date().toISOString(),
  totalStreams: all.length,
  countries,
  groups,
  playlists: {
    all: '/playlists/index.m3u8',
    raw: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
  },
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))
fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(all))

console.log(
  `Free-TV catalog ready: ${all.length} streams, ${countries.length} countries, ${groups.length} groups`,
)
