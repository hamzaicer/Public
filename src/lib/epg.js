function channelFileName(id) {
  return `${id.replace(/[^\w.@+-]+/g, '_')}.json`
}

export async function loadEpgMeta() {
  const res = await fetch('/epg/index.json')
  if (!res.ok) return null
  return res.json()
}

export async function loadChannelEpg(channelId) {
  if (!channelId) return null
  const file = channelFileName(channelId)
  const res = await fetch(`/epg/channels/${encodeURIComponent(file)}`)
  if (!res.ok) return null
  return res.json()
}

export function pickNowNext(programs, now = Date.now()) {
  if (!programs?.length) return { now: null, next: null, upcoming: [] }
  let current = null
  let next = null
  const upcoming = []
  for (const p of programs) {
    if (p.start <= now && now < p.stop) {
      current = p
      continue
    }
    if (p.start >= now) {
      if (!next) next = p
      if (upcoming.length < 8) upcoming.push(p)
    }
  }
  return { now: current, next, upcoming }
}

export function formatTime(ms, timeZone = 'Europe/Istanbul') {
  if (!ms) return ''
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(ms))
}

export function formatRange(program, timeZone = 'Europe/Istanbul') {
  if (!program) return ''
  return `${formatTime(program.start, timeZone)}–${formatTime(program.stop, timeZone)}`
}

export function progressPercent(program, now = Date.now()) {
  if (!program) return 0
  const span = program.stop - program.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((now - program.start) / span) * 100))
}
