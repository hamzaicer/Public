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
    name: 'pluto-tv',
    label: 'Pluto TV',
    file: 'pluto-tv.m3u8',
    categorySlug: 'pluto-tv',
    defaultLicense: 'allowed',
  },
  {
    name: 'beacon-dizi',
    label: 'Beacon Diziler',
    file: 'beacon-dizi.m3u',
    categorySlug: 'beacon-dizi',
    defaultLicense: 'allowed',
  },
  {
    name: 'iptv-org-streams',
    label: 'iptv-org streams API',
    file: 'iptv-org-streams.m3u',
    categorySlug: 'iptv-org-streams',
    defaultLicense: 'allowed',
  },
]

const ALLOWED_SOURCES = new Set([
  'iptv-org',
  ...EXTRA_PLAYLISTS.map((s) => s.name),
])

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

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url)
}

function classifyLicense(channel, source, defaultLicense = 'allowed') {
  const explicit = (channel.licenseStatus || '').toLowerCase()
  if (explicit === 'blocked') {
    return { licenseStatus: 'blocked', rejectReason: channel.rejectReason || 'explicit-blocked' }
  }
  if (explicit === 'review') {
    return {
      licenseStatus: 'review',
      rejectReason: channel.rejectReason || 'license-unverified',
    }
  }

  const blob = `${channel.name} ${channel.group} ${channel.id || ''}`.toLowerCase()
  if (source === 'xxx' || channel.group?.toLowerCase() === 'xxx') {
    return { licenseStatus: 'review', rejectReason: 'adult-category' }
  }
  if (/\b(nsfw|xxx)\b/.test(blob)) {
    return { licenseStatus: 'review', rejectReason: 'adult-or-nsfw-marker' }
  }

  if (ALLOWED_SOURCES.has(source) || defaultLicense === 'allowed') {
    return { licenseStatus: 'allowed', rejectReason: null }
  }

  // Unknown source → review, never silent-delete.
  return { licenseStatus: 'review', rejectReason: 'license-unknown' }
}

function parseM3u(filePath, { source, defaultLicense = 'allowed' } = {}) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const channels = []
  const invalid = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF:')) continue
    const { name, attrs } = parseExtinf(line)
    let url = ''
    let userAgent = attrs['http-user-agent'] || ''
    let referrer = ''

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next) continue
      if (next.startsWith('#EXTVLCOPT:http-user-agent=')) {
        userAgent = next.slice('#EXTVLCOPT:http-user-agent='.length)
        continue
      }
      if (next.startsWith('#EXTVLCOPT:http-referrer=')) {
        referrer = next.slice('#EXTVLCOPT:http-referrer='.length)
        continue
      }
      if (next.startsWith('#')) continue
      url = next
      i = j
      break
    }

    if (!url) {
      invalid.push({ name, reason: 'missing-url', source })
      continue
    }
    if (!isHttpUrl(url)) {
      // Keep non-http (youtube/twitch/etc.) in review — technically listed, not DRM bypass.
      const channel = {
        id: attrs['tvg-id'] || `${name}-${channels.length}`,
        name,
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || 'General',
        url,
        userAgent: userAgent || undefined,
        referrer: referrer || undefined,
        country: (attrs['tvg-country'] || '').toLowerCase() || undefined,
        source,
        licenseStatus: 'review',
        rejectReason: 'non-http-stream',
      }
      channels.push(channel)
      continue
    }

    const channel = {
      id: attrs['tvg-id'] || `${name}-${channels.length}`,
      name,
      logo: attrs['tvg-logo'] || '',
      group: attrs['group-title'] || 'General',
      url,
      userAgent: userAgent || undefined,
      referrer: referrer || undefined,
      country: (attrs['tvg-country'] || '').toLowerCase() || undefined,
      source,
      licenseStatus: attrs['beacon-license'] || undefined,
      rejectReason: attrs['beacon-reason'] || undefined,
    }

    const classified = classifyLicense(channel, source, defaultLicense)
    channel.licenseStatus = classified.licenseStatus
    channel.rejectReason = classified.rejectReason || undefined
    channels.push(channel)
  }

  return { channels, invalid }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return String(url || '').trim()
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function bumpReason(map, reason) {
  const key = reason || 'unspecified'
  map[key] = (map[key] || 0) + 1
}

function emptySourceStats(id, label) {
  return {
    id,
    label,
    found: 0,
    added: 0,
    duplicate: 0,
    review: 0,
    blocked: 0,
    invalid: 0,
    rejectReasons: {},
  }
}

ensureDir(OUT)
ensureDir(path.join(OUT, 'countries'))
ensureDir(path.join(OUT, 'categories'))

const countryDir = path.join(PLAYLISTS, 'countries')
const categoryDir = path.join(PLAYLISTS, 'categories')
const indexFile = path.join(PLAYLISTS, 'index.m3u')

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    found: 0,
    allowed: 0,
    review: 0,
    blocked: 0,
    duplicate: 0,
    invalid: 0,
  },
  sources: [],
  notes: [
    'licenseStatus=allowed → normal channel list',
    'licenseStatus=review → İnceleme Bekliyor (not auto-deleted)',
    'licenseStatus=blocked → not published; reason listed',
    'Technical playback errors are separate from licenseStatus',
    'No DRM or access-control bypass is performed',
  ],
}

const sourceStats = new Map()
function statsFor(id, label) {
  if (!sourceStats.has(id)) sourceStats.set(id, emptySourceStats(id, label))
  return sourceStats.get(id)
}

const seenUrls = new Set()
const allowedChannels = []
const reviewChannels = []
const blockedChannels = []

function ingest(channels, invalid, sourceId, sourceLabel) {
  const st = statsFor(sourceId, sourceLabel)
  st.found += channels.length + invalid.length
  report.totals.found += channels.length + invalid.length
  st.invalid += invalid.length
  report.totals.invalid += invalid.length
  for (const row of invalid) bumpReason(st.rejectReasons, row.reason)

  for (const ch of channels) {
    const key = normalizeUrl(ch.url)
    if (seenUrls.has(key)) {
      st.duplicate += 1
      report.totals.duplicate += 1
      bumpReason(st.rejectReasons, 'duplicate-url')
      continue
    }
    seenUrls.add(key)

    if (ch.licenseStatus === 'blocked') {
      st.blocked += 1
      report.totals.blocked += 1
      bumpReason(st.rejectReasons, ch.rejectReason || 'blocked')
      blockedChannels.push(ch)
      continue
    }

    if (ch.licenseStatus === 'review') {
      st.review += 1
      report.totals.review += 1
      bumpReason(st.rejectReasons, ch.rejectReason || 'review')
      reviewChannels.push(ch)
      continue
    }

    st.added += 1
    report.totals.allowed += 1
    allowedChannels.push(ch)
  }
}

// Base iptv-org index
if (fs.existsSync(indexFile)) {
  const { channels, invalid } = parseM3u(indexFile, {
    source: 'iptv-org',
    defaultLicense: 'allowed',
  })
  ingest(channels, invalid, 'iptv-org', 'iptv-org')
}

// Extra playlists
const extraBundles = []
for (const src of EXTRA_PLAYLISTS) {
  const filePath = path.join(PLAYLISTS, src.file)
  if (!fs.existsSync(filePath)) continue
  const { channels, invalid } = parseM3u(filePath, {
    source: src.name,
    defaultLicense: src.defaultLicense || 'allowed',
  })
  extraBundles.push({ ...src, channels })
  ingest(channels, invalid, src.name, src.label)
  fs.writeFileSync(
    path.join(OUT, 'categories', `${src.categorySlug}.json`),
    JSON.stringify(channels.filter((c) => c.licenseStatus === 'allowed')),
  )
}

// Country files (iptv-org) + merge allowed extras with matching country
const countries = []
const allExtraAllowed = allowedChannels.filter((c) => c.source && c.source !== 'iptv-org')

for (const file of fs.readdirSync(countryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const code = file.replace(/\.m3u$/, '')
  const { channels } = parseM3u(path.join(countryDir, file), {
    source: 'iptv-org',
    defaultLicense: code === 'xxx' ? 'review' : 'allowed',
  })
  // Country snapshots are views: keep allowed-only for public country browse.
  const localAllowed = channels.filter((c) => c.licenseStatus === 'allowed')
  const fromExtras = allExtraAllowed.filter((c) => c.country === code)
  const seen = new Set(localAllowed.map((c) => normalizeUrl(c.url)))
  const merged = [...localAllowed]
  for (const ch of fromExtras) {
    const key = normalizeUrl(ch.url)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(ch)
  }
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(merged))
  countries.push({ code, count: merged.length })
}

// Orphan countries from extras
const knownCountryCodes = new Set(countries.map((c) => c.code))
const orphanByCountry = new Map()
for (const ch of allExtraAllowed) {
  if (!ch.country || knownCountryCodes.has(ch.country)) continue
  if (!orphanByCountry.has(ch.country)) orphanByCountry.set(ch.country, [])
  orphanByCountry.get(ch.country).push(ch)
}
for (const [code, list] of [...orphanByCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const seen = new Set()
  const unique = []
  for (const ch of list) {
    const key = normalizeUrl(ch.url)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ch)
  }
  fs.writeFileSync(path.join(OUT, 'countries', `${code}.json`), JSON.stringify(unique))
  countries.push({ code, count: unique.length })
}

// Standard iptv-org categories (allowed only in public category files)
const categories = []
for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.m3u')).sort()) {
  const slug = file.replace(/\.m3u$/, '')
  const { channels } = parseM3u(path.join(categoryDir, file), {
    source: slug === 'xxx' ? 'xxx' : 'iptv-org',
    defaultLicense: slug === 'xxx' ? 'review' : 'allowed',
  })

  if (slug === 'xxx') {
    // Adult category → review queue only (do not publish as normal category).
    for (const ch of channels) {
      if (ch.licenseStatus !== 'review') {
        ch.licenseStatus = 'review'
        ch.rejectReason = ch.rejectReason || 'adult-category'
      }
    }
    // Already counted via index/extras; append unique review rows only.
    for (const ch of channels) {
      const key = normalizeUrl(ch.url)
      if (seenUrls.has(key)) continue
      seenUrls.add(key)
      reviewChannels.push(ch)
      report.totals.found += 1
      report.totals.review += 1
      const st = statsFor('xxx', 'iptv-org xxx')
      st.found += 1
      st.review += 1
      bumpReason(st.rejectReasons, 'adult-category')
    }
    continue
  }

  const allowed = channels.filter((c) => c.licenseStatus === 'allowed')
  fs.writeFileSync(path.join(OUT, 'categories', `${slug}.json`), JSON.stringify(allowed))
  categories.push({ slug, count: allowed.length })
}

for (const src of EXTRA_PLAYLISTS) {
  const allowedPath = path.join(OUT, 'categories', `${src.categorySlug}.json`)
  if (!fs.existsSync(allowedPath)) continue
  const list = JSON.parse(fs.readFileSync(allowedPath, 'utf8'))
  categories.push({ slug: src.categorySlug, count: list.length })
}

fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(allowedChannels))
fs.writeFileSync(path.join(OUT, 'categories', 'review.json'), JSON.stringify(reviewChannels))
fs.writeFileSync(path.join(OUT, 'categories', 'blocked.json'), JSON.stringify(blockedChannels))
categories.push({ slug: 'review', count: reviewChannels.length })
if (blockedChannels.length) categories.push({ slug: 'blocked', count: blockedChannels.length })

report.sources = [...sourceStats.values()]

const meta = {
  generatedAt: new Date().toISOString(),
  totalStreams: allowedChannels.length,
  allCount: allowedChannels.length,
  reviewCount: reviewChannels.length,
  blockedCount: blockedChannels.length,
  duplicateCount: report.totals.duplicate,
  invalidCount: report.totals.invalid,
  addedBySource: Object.fromEntries(
    report.sources.map((s) => [s.id, s.added]),
  ),
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
    nexusBest: '/playlists/nexus-best.m3u',
    worldIptv: '/playlists/world-iptv.m3u',
    italyOpen: '/playlists/italy-open.m3u',
    turkeyLive: '/playlists/turkey-live.m3u8',
    turkeyLang: '/playlists/turkey-lang.m3u',
    plutoTv: '/playlists/pluto-tv.m3u8',
    beaconDizi: '/playlists/beacon-dizi.m3u',
    iptvOrgStreams: '/playlists/iptv-org-streams.m3u',
  },
  sources: report.sources.map((s) => ({
    id: s.id,
    label: s.label,
    found: s.found,
    added: s.added,
    duplicate: s.duplicate,
    review: s.review,
    blocked: s.blocked,
    invalid: s.invalid,
  })),
  importReport: '/catalog/import-report.json',
}

fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))
fs.writeFileSync(path.join(OUT, 'import-report.json'), JSON.stringify(report, null, 2))

console.log(
  `Catalog ready: allowed=${allowedChannels.length}, review=${reviewChannels.length}, blocked=${blockedChannels.length}, duplicates=${report.totals.duplicate}, invalid=${report.totals.invalid}`,
)
