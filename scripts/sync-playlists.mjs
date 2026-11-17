import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAYLISTS = path.join(ROOT, 'public/playlists')
const BASE = 'https://iptv-org.github.io/iptv'

const INDEXES = {
  countries: `${BASE}/index.country.m3u`,
  categories: `${BASE}/index.category.m3u`,
  all: `${BASE}/index.m3u`,
  byLanguage: `${BASE}/index.language.m3u`,
}

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

function parseIndexCodes(text, kind) {
  // Prefer dedicated per-file endpoints: /countries/tr.m3u and /categories/news.m3u
  // Index files are full channel dumps grouped by title; we still keep them locally.
  const codes = new Set()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('#EXTINF:')) continue
    const match = line.match(/group-title="([^"]+)"/)
    if (!match) continue
    const title = match[1].trim()
    if (!title) continue
    if (kind === 'categories') {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^$/, 'undefined')
      // category files use lowercase slug names on iptv-org hosting
      codes.add(title.toLowerCase())
    } else {
      // country index groups by country name, not code — use known files list instead
      codes.add(title)
    }
  }
  return [...codes]
}

async function listRemoteFiles(kind) {
  // iptv-org publishes stable per-code playlists
  // Discover by probing the existing local set first, then refresh from a known directory listing via index.m3u country codes in filenames.
  // Reliable approach: download the archive listing from the countries/categories index pages is not available,
  // so we parse codes from existing local files + ensure TR and popular ones, then also scrape from
  // https://iptv-org.github.io/api/streams.json is heavy. Use the mirror directory via GitHub raw paths.
  const api = kind === 'countries'
    ? 'https://api.github.com/repos/iptv-org/iptv/contents/streams?ref=master'
    : null

  if (kind === 'countries' && api) {
    // streams/ folder uses country codes as filenames in older layouts; current layout uses generated site.
  }

  const known = fs.existsSync(path.join(PLAYLISTS, kind))
    ? fs.readdirSync(path.join(PLAYLISTS, kind)).filter((f) => f.endsWith('.m3u')).map((f) => f.replace(/\.m3u$/, ''))
    : []

  // Always include core set
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

async function main() {
  console.log('Syncing playlists from iptv-org…')
  await downloadIndexes()

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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
