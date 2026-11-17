const countryNames = {
  ad: 'Andorra',
  ae: 'BAE',
  al: 'Arnavutluk',
  am: 'Ermenistan',
  ar: 'Arjantin',
  at: 'Avusturya',
  au: 'Avustralya',
  az: 'Azerbaycan',
  ba: 'Bosna-Hersek',
  be: 'Belçika',
  bg: 'Bulgaristan',
  br: 'Brezilya',
  by: 'Belarus',
  ca: 'Kanada',
  ch: 'İsviçre',
  cl: 'Şili',
  cn: 'Çin',
  cr: 'Kosta Rika',
  cy: 'Kıbrıs',
  cz: 'Çekya',
  de: 'Almanya',
  dk: 'Danimarka',
  do: 'Dominik Cumhuriyeti',
  ee: 'Estonya',
  eg: 'Mısır',
  es: 'İspanya',
  fi: 'Finlandiya',
  fo: 'Faroe',
  fr: 'Fransa',
  ge: 'Gürcistan',
  gl: 'Grönland',
  gr: 'Yunanistan',
  hk: 'Hong Kong',
  hr: 'Hırvatistan',
  hu: 'Macaristan',
  id: 'Endonezya',
  ie: 'İrlanda',
  il: 'İsrail',
  in: 'Hindistan',
  iq: 'Irak',
  ir: 'İran',
  is: 'İzlanda',
  it: 'İtalya',
  jp: 'Japonya',
  ke: 'Kenya',
  kp: 'Kuzey Kore',
  kr: 'Güney Kore',
  kz: 'Kazakistan',
  lb: 'Lübnan',
  lt: 'Litvanya',
  lu: 'Lüksemburg',
  lv: 'Letonya',
  mc: 'Monako',
  md: 'Moldova',
  me: 'Karadağ',
  mk: 'Kuzey Makedonya',
  mn: 'Moğolistan',
  mo: 'Makao',
  mt: 'Malta',
  mx: 'Meksika',
  ng: 'Nijerya',
  nl: 'Hollanda',
  no: 'Norveç',
  pl: 'Polonya',
  pt: 'Portekiz',
  py: 'Paraguay',
  pe: 'Peru',
  qa: 'Katar',
  ro: 'Romanya',
  rs: 'Sırbistan',
  ru: 'Rusya',
  sa: 'Suudi Arabistan',
  se: 'İsveç',
  si: 'Slovenya',
  sk: 'Slovakya',
  sm: 'San Marino',
  so: 'Somali',
  td: 'Çad',
  tm: 'Türkmenistan',
  tr: 'Türkiye',
  tt: 'Trinidad ve Tobago',
  tw: 'Tayvan',
  ua: 'Ukrayna',
  uk: 'Birleşik Krallık',
  us: 'ABD',
  ve: 'Venezuela',
  xk: 'Kosova',
}

export function countryLabel(code) {
  return countryNames[code] || code.toUpperCase()
}

export function groupLabel(meta, slug) {
  const found = meta?.groups?.find((g) => g.slug === slug)
  return found?.title || slug
}

export async function loadMeta() {
  const res = await fetch('./catalog/meta.json')
  if (!res.ok) throw new Error('Katalog yüklenemedi')
  return res.json()
}

export async function loadCountry(code) {
  const res = await fetch(`./catalog/countries/${code}.json`)
  if (!res.ok) throw new Error('Ülke listesi yüklenemedi')
  return res.json()
}

export async function loadGroup(slug) {
  const res = await fetch(`./catalog/groups/${slug}.json`)
  if (!res.ok) throw new Error('Grup listesi yüklenemedi')
  return res.json()
}
