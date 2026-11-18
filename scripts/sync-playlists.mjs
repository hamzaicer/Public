import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAYLISTS = path.join(ROOT, 'public/playlists')
const BASE = 'https://iptv-org.github.io/iptv'

const INDEXES = {
  countries: `${BASE}/index.country.m3u`,
  categories: `${BASE}/index.category.m3u`,
  all: `${BASE}/index.m3u`,
  byLanguage: `${BASE}/index.language.m3u`,
}

/** Public open playlists only — no paid/DRM bypass sources. */
export const EXTRA_SOURCES = [
  {
    name: 'free-tv',
    label: 'Free-TV/IPTV',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    file: 'free-tv.m3u8',
    categorySlug: 'free-tv',
  },
  {
    name: 'nexus',
    label: 'IPTV Nexus',
    url: 'https://dearbulut.github.io/iptv/playlists/index.m3u',
    file: 'nexus.m3u',
    categorySlug: 'nexus',
  },
  {
    name: 'nexus-online',
    label: 'Nexus Online',
    url: 'https://dearbulut.github.io/iptv/playlists/online.m3u',
    file: 'nexus-online.m3u',
    categorySlug: 'nexus-online',
  },
  {
    name: 'world-iptv',
    label: 'World IPTV',
    url: 'https://romaxa55.github.io/world_ip_tv/output/index.m3u',
    file: 'world-iptv.m3u',
    categorySlug: 'world-iptv',
  },
]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'BeaconIPTV/1.0 (+https://github.com/hamzaicer/Public)' },
  })
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`)
  return res.text()
}

async function listRemoteFiles(kind) {
  const known = fs.existsSync(path.join(PLAYLISTS, kind))
    ? fs.readdirSync(path.join(PLAYLISTS, kind)).filter((f) => f.endsWith('.m3u')).map((f) => f.replace(/\.m3u$/, ''))
    : []

  const extras =
    kind === 'countries'
      ? ['tr', 'us', 'uk', 'de', 'fr', 'it', 'es', 'nl', 'int']
      : [
          'news',
          'sports',
          'general',
          'entertainment',
          'music',
          'kids',
          'movies',
          'documentary',
          'religious',
          'series',
        ]

  return [...new Set([...known, ...extras])].sort()
}

async function downloadPlaylist(kind, code) {
  const url = `${BASE}/${kind}/${code}.m3u`
  const text = await fetchText(url)
  const outDir = path.join(PLAYLISTS, kind)
  ensureDir(outDir)
  fs.writeFileSync(path.join(outDir, `${code}.m3u`), text)
  return text.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).length
}

async function downloadIndexes() {
  ensureDir(PLAYLISTS)
  for (const [name, url] of Object.entries(INDEXES)) {
    const file =
      name === 'countries'
        ? 'index.country.m3u'
        : name === 'categories'
          ? 'index.category.m3u'
          : name === 'byLanguage'
            ? 'index.language.m3u'
            : 'index.m3u'
    process.stdout.write(`index ${file}… `)
    const text = await fetchText(url)
    fs.writeFileSync(path.join(PLAYLISTS, file), text)
    console.log('ok')
  }
}

function escapeAttr(value) {
  return String(value || '').replace(/"/g, "'")
}

async function downloadIptvOrgStreamsApi() {
  process.stdout.write('source iptv-org-streams… ')
  const res = await fetch('https://iptv-org.github.io/api/streams.json', {
    headers: { 'user-agent': 'BeaconIPTV/1.0 (+https://github.com/hamzaicer/Public)' },
  })
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for streams.json`)
  const streams = await res.json()
  const lines = ['#EXTM3U']
  let kept = 0
  for (const s of streams) {
    if (!s?.url) continue
    const labels = Array.isArray(s.labels) ? s.labels.map((x) => String(x).toLowerCase()) : []
    // Keep public index policy: skip adult / NSFW labelled feeds.
    if (labels.some((l) => l.includes('nsfw') || l.includes('adult') || l === 'xxx')) continue
    const title = s.title || s.channel || 'Stream'
    const quality = s.quality ? ` (${s.quality})` : ''
    const ua = s.user_agent ? ` http-user-agent="${escapeAttr(s.user_agent)}"` : ''
    const logo = ''
    lines.push(
      `#EXTINF:-1 tvg-id="${escapeAttr(s.channel || '')}" tvg-logo="${logo}"${ua} group-title="iptv-org-streams",${title}${quality}`,
    )
    if (s.referrer) lines.push(`#EXTVLCOPT:http-referrer=${s.referrer}`)
    if (s.user_agent) lines.push(`#EXTVLCOPT:http-user-agent=${s.user_agent}`)
    lines.push(s.url)
    kept += 1
  }
  fs.writeFileSync(path.join(PLAYLISTS, 'iptv-org-streams.m3u'), `${lines.join('\n')}\n`)
  console.log(`ok (${kept} channels)`)
  return kept
}

async function downloadExtraSources() {
  ensureDir(PLAYLISTS)
  for (const src of EXTRA_SOURCES) {
    process.stdout.write(`source ${src.name}… `)
    try {
      const text = await fetchText(src.url)
      fs.writeFileSync(path.join(PLAYLISTS, src.file), text)
      const n = text.split(/\r?\n/).filter((l) => l.startsWith('#EXTINF:')).length
      console.log(`ok (${n} channels)`)
    } catch (err) {
      console.warn(`skip ${src.name}: ${err.message}`)
    }
  }
  await downloadIptvOrgStreamsApi()
}

async function main() {
  console.log('Syncing playlists from iptv-org…')
  await downloadIndexes()
  console.log('Syncing extra public sources…')
  await downloadExtraSources()

  for (const kind of ['countries', 'categories']) {
    const codes = await listRemoteFiles(kind)
    let ok = 0
    let fail = 0
    for (const code of codes) {
      if (code === 'xxx') continue
      try {
        const n = await downloadPlaylist(kind, code)
        ok += 1
        process.stdout.write(`\r${kind}: ${ok}/${codes.length} (${code}: ${n} urls)   `)
      } catch (err) {
        fail += 1
        console.warn(`\nskip ${kind}/${code}: ${err.message}`)
      }
    }
    console.log(`\n${kind} done (${ok} ok, ${fail} skipped)`)
  }
  console.log('Playlist sync complete.')
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
