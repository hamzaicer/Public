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

/** Public open playlists — license assumed allowed unless markers say otherwise. */
export const EXTRA_SOURCES = [
  {
    name: 'free-tv',
    label: 'Free-TV/IPTV',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    file: 'free-tv.m3u8',
    categorySlug: 'free-tv',
    defaultLicense: 'allowed',
  },
  {
    name: 'nexus',
    label: 'IPTV Nexus',
    url: 'https://dearbulut.github.io/iptv/playlists/index.m3u',
    file: 'nexus.m3u',
    categorySlug: 'nexus',
    defaultLicense: 'allowed',
  },
  {
    name: 'nexus-online',
    label: 'Nexus Online',
    url: 'https://dearbulut.github.io/iptv/playlists/online.m3u',
    file: 'nexus-online.m3u',
    categorySlug: 'nexus-online',
    defaultLicense: 'allowed',
  },
  {
    name: 'world-iptv',
    label: 'World IPTV',
    url: 'https://romaxa55.github.io/world_ip_tv/output/index.m3u',
    file: 'world-iptv.m3u',
    categorySlug: 'world-iptv',
    defaultLicense: 'allowed',
  },
  {
    name: 'nexus-best',
    label: 'Nexus Best',
    url: 'https://dearbulut.github.io/iptv/playlists/best.m3u',
    file: 'nexus-best.m3u',
    categorySlug: 'nexus-best',
    defaultLicense: 'allowed',
  },
  {
    name: 'italy-open',
    label: 'Open IPTV Italy',
    url: 'https://raw.githubusercontent.com/xN1ckuz/OpenIPTVItaly/main/OpenIPTVItaly.m3u',
    file: 'italy-open.m3u',
    categorySlug: 'italy-open',
    defaultLicense: 'allowed',
  },
  {
    name: 'turkey-live',
    label: 'Beacon Türkiye',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_turkey.m3u8',
    file: 'turkey-live.m3u8',
    categorySlug: 'turkey-live',
    defaultLicense: 'allowed',
    defaultReferrer: 'https://www.trt.net.tr/',
  },
  {
    name: 'turkey-lang',
    label: 'Türkçe Yayınlar',
    url: 'https://iptv-org.github.io/iptv/languages/tur.m3u',
    file: 'turkey-lang.m3u',
    categorySlug: 'turkey-lang',
    defaultLicense: 'allowed',
  },
  {
    name: 'samsung-tv',
    label: 'Samsung TV Plus',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_all.m3u',
    file: 'samsung-tv.m3u',
    categorySlug: 'samsung-tv',
    defaultLicense: 'allowed',
    defaultReferrer: 'https://www.samsung.com/',
  },
  {
    name: 'plex-tv',
    label: 'Plex Live TV',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_all.m3u',
    file: 'plex-tv.m3u',
    categorySlug: 'plex-tv',
    defaultLicense: 'allowed',
    defaultReferrer: 'https://watch.plex.tv/',
  },
  {
    name: 'tubi-tv',
    label: 'Tubi Live',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/tubi_all.m3u',
    file: 'tubi-tv.m3u',
    categorySlug: 'tubi-tv',
    defaultLicense: 'allowed',
    defaultReferrer: 'https://tubitv.com/',
  },
  {
    name: 'roku-tv',
    label: 'The Roku Channel',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/roku_all.m3u',
    file: 'roku-tv.m3u',
    categorySlug: 'roku-tv',
    defaultLicense: 'allowed',
    defaultReferrer: 'https://therokuchannel.roku.com/',
  },
  {
    name: 'whale-tv',
    label: 'Whale TV Plus',
    url: 'https://www.apsattv.com/whaletvplus_all.m3u',
    file: 'whale-tv.m3u',
    categorySlug: 'whale-tv',
    defaultLicense: 'allowed',
  },
  {
    name: 'vidaa-tv',
    label: 'VIDAA Free',
    url: 'https://www.apsattv.com/vidaa.m3u',
    file: 'vidaa-tv.m3u',
    categorySlug: 'vidaa-tv',
    defaultLicense: 'allowed',
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
    ? fs
        .readdirSync(path.join(PLAYLISTS, kind))
        .filter((f) => f.endsWith('.m3u'))
        .map((f) => f.replace(/\.m3u$/, ''))
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
          'xxx',
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

function licenseHintFromLabels(labels) {
  const normalized = labels.map((l) => String(l).toLowerCase())
  if (normalized.some((l) => l.includes('nsfw') || l.includes('adult') || l === 'xxx')) {
    return {
      status: 'review',
      reason: 'adult-or-nsfw-label',
    }
  }
  return { status: 'allowed', reason: '' }
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
  let review = 0
  for (const s of streams) {
    if (!s?.url) continue
    const labels = Array.isArray(s.labels) ? s.labels : []
    // Do NOT drop unverified/adult-labelled rows: mark for review instead of deleting.
    const hint = licenseHintFromLabels(labels)
    if (hint.status === 'review') review += 1
    const title = s.title || s.channel || 'Stream'
    const quality = s.quality ? ` (${s.quality})` : ''
    const ua = s.user_agent ? ` http-user-agent="${escapeAttr(s.user_agent)}"` : ''
    const statusAttr = ` beacon-license="${hint.status}"`
    const reasonAttr = hint.reason ? ` beacon-reason="${escapeAttr(hint.reason)}"` : ''
    lines.push(
      `#EXTINF:-1 tvg-id="${escapeAttr(s.channel || '')}" tvg-logo=""${ua}${statusAttr}${reasonAttr} group-title="iptv-org-streams",${title}${quality}`,
    )
    if (s.referrer) lines.push(`#EXTVLCOPT:http-referrer=${s.referrer}`)
    if (s.user_agent) lines.push(`#EXTVLCOPT:http-user-agent=${s.user_agent}`)
    lines.push(s.url)
    kept += 1
  }
  fs.writeFileSync(path.join(PLAYLISTS, 'iptv-org-streams.m3u'), `${lines.join('\n')}\n`)
  console.log(`ok (${kept} channels, ${review} marked review)`)
  return kept
}

/** Inject a default VLC referrer after each EXTINF when the playlist lacks one. */
function withDefaultReferrer(text, referrer) {
  if (!referrer) return text
  const lines = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)
    if (!line.startsWith('#EXTINF:')) continue
    const next = lines[i + 1] || ''
    if (next.startsWith('#EXTVLCOPT:http-referrer=')) continue
    out.push(`#EXTVLCOPT:http-referrer=${referrer}`)
  }
  return `${out.join('\n')}\n`
}

async function downloadPlutoBundle() {
  // BuddyChewChew jmp2.uk links mint a fresh Pluto JWT on each request (static JWTs expire ~24h).
  process.stdout.write('source pluto-tv… ')
  const url =
    'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_all.m3u'
  const text = withDefaultReferrer(await fetchText(url), 'https://pluto.tv/')
  fs.writeFileSync(path.join(PLAYLISTS, 'pluto-tv.m3u8'), text)
  const total = text.split(/\r?\n/).filter((l) => l.startsWith('#EXTINF:')).length
  console.log(`ok (${total} channels via live JWT redirect)`)
  return text
}

/** Beacon Diziler: iptv-org series + Türkçe dizi/FAST drama kanalları. */
async function downloadDiziBundle(extraTexts = []) {
  process.stdout.write('source beacon-dizi… ')
  const chunks = ['#EXTM3U']
  const seen = new Set()
  const pushPair = (inf, opts, url) => {
    const key = url.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    chunks.push(inf)
    for (const o of opts) chunks.push(o)
    chunks.push(url)
  }

  const ingest = (text, forceGroup) => {
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.startsWith('#EXTINF:')) continue
      const name = line.split(',').pop() || ''
      const blob = `${line} ${name}`.toLowerCase()
      const isSeriesish =
        forceGroup ||
        blob.includes('series') ||
        blob.includes('dizi') ||
        blob.includes('drama') ||
        blob.includes('soap') ||
        blob.includes('merhaba') ||
        blob.includes('türkische serien') ||
        blob.includes('turkische serien')
      if (!isSeriesish) continue
      const opts = []
      let url = ''
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]
        if (next.startsWith('#EXTINF:')) break
        if (next.startsWith('#EXTVLCOPT:')) {
          opts.push(next)
          continue
        }
        if (next.startsWith('http')) {
          url = next
          break
        }
      }
      if (!url) continue
      let inf = line
      if (forceGroup && !/group-title="/i.test(inf)) {
        inf = inf.replace('#EXTINF:', '#EXTINF:-1 group-title="Beacon Diziler",')
      } else if (forceGroup) {
        inf = inf.replace(/group-title="[^"]*"/i, 'group-title="Beacon Diziler"')
      }
      pushPair(inf, opts, url)
    }
  }

  try {
    ingest(await fetchText('https://iptv-org.github.io/iptv/categories/series.m3u'), true)
  } catch (err) {
    console.warn(`\nskip series base: ${err.message}`)
  }
  for (const text of extraTexts) ingest(text, false)

  fs.writeFileSync(path.join(PLAYLISTS, 'beacon-dizi.m3u'), `${chunks.join('\n')}\n`)
  console.log(`ok (${seen.size} channels)`)
}

async function downloadExtraSources() {
  ensureDir(PLAYLISTS)
  const captured = {}
  for (const src of EXTRA_SOURCES) {
    process.stdout.write(`source ${src.name}… `)
    try {
      let text = await fetchText(src.url)
      if (src.defaultReferrer) text = withDefaultReferrer(text, src.defaultReferrer)
      fs.writeFileSync(path.join(PLAYLISTS, src.file), text)
      captured[src.name] = text
      const n = text.split(/\r?\n/).filter((l) => l.startsWith('#EXTINF:')).length
      console.log(`ok (${n} channels)`)
    } catch (err) {
      console.warn(`skip ${src.name}: ${err.message}`)
    }
  }
  const plutoText = await downloadPlutoBundle()
  await downloadDiziBundle([plutoText, captured['samsung-tv'], captured['plex-tv']].filter(Boolean))
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
