import { cleanArtist, cleanTitle } from './filename.js'

export const LYRICS_CACHE_MAX = 30

export const NOISE_RE =
  /\b(official|oficial|lyric|lyrics|letra|letras|video|vídeo|audio|áudio|clipe|clip|mv|m\/v|hd|hq|4k|8k|visualizer|remaster(ed)?|sub|subtitulado|subtitulada|espanol|español|spanish|english|ingl[eé]s|traducci[oó]n|tradu[cç][aã]o|legendado|legendada|legenda(s)?|karaoke|color ?coded|en vivo|full ?hd)\b/i

export function parseLRC(text) {
  if (!text) return []
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const lines = []
  text.split('\n').forEach((raw) => {
    const stamps = [...raw.matchAll(re)]
    if (!stamps.length) return
    const content = raw.replace(re, '').trim()
    stamps.forEach((m) => {
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, '0')}`) : 0
      lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: content })
    })
  })
  return lines.sort((a, b) => a.time - b.time)
}

export function buildLyrics(data) {
  if (!data) return null
  const source = {
    id: data.id,
    artistName: data.artistName,
    trackName: data.trackName,
    albumName: data.albumName,
    duration: data.duration,
  }
  if (data.instrumental) return { instrumental: true, synced: false, lines: [], source }
  const synced = parseLRC(data.syncedLyrics)
  if (synced.length) return { synced: true, lines: synced, source }
  if (data.plainLyrics) {
    return {
      synced: false,
      lines: data.plainLyrics.split('\n').map((text) => ({ time: null, text })),
      source,
    }
  }
  return null
}

export async function searchLyrics(query) {
  const q = (query || '').trim()
  if (!q) return []
  const get = async (url) => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return []
      const arr = await res.json()
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  const results = []
  const seen = new Set()
  const push = (arr) => {
    if (!Array.isArray(arr)) return
    arr.forEach((c) => {
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        results.push(c)
      }
    })
  }

  const qUrl = (params) =>
    `https://lrclib.net/api/search?${Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')}`

  push(await get(qUrl({ q })))

  if (!results.length) {
    const dash = q.split(/\s*[-–—:]\s*/)
    if (dash.length > 1) {
      const guessArtist = dash[0]
      const guessTitle = dash[dash.length - 1]
      push(
        await get(
          qUrl({
            artist_name: guessArtist.length > 2 ? guessArtist : '',
            track_name: guessTitle,
          }),
        ),
      )
    }
    push(await get(qUrl({ track_name: q })))
  }

  return results
}

export function titleVariants(raw) {
  const base = cleanTitle(raw)
  if (!base) return []
  const out = new Set([base])
  const noFeat = base
    .replace(/\s*[([]?\s*(feat|ft|with)\.?\s+[^)\]]+[)\]]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (noFeat) out.add(noFeat)
  ;[' - ', ' | ', ' – '].forEach((sep) => {
    if (base.includes(sep)) out.add(base.split(sep)[0].trim())
  })
  const withoutParen = base
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (withoutParen && withoutParen !== base) out.add(withoutParen)
  const love = base.replace(/\b(featuring|featuring\.)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (love && love !== base) out.add(love)
  return [...out].filter(Boolean).slice(0, 4)
}

export const normText = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export async function fetchLyrics(title, artist, duration) {
  const a = cleanArtist(artist)
  const hasArtist = a && a.toLowerCase() !== 'desconhecido'
  const variants = titleVariants(title)
  if (!variants.length) return null

  const artistVariants = []
  if (hasArtist) {
    artistVariants.push(a)
    const first = a.split(/\s*(?:,|&|;|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b)\s*/i)[0].trim()
    if (first && normText(first) !== normText(a)) artistVariants.push(first)
  }
  artistVariants.push('')

  const qs = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

  const candidates = []
  const seen = new Set()
  const push = (list) => {
    if (!Array.isArray(list)) return
    list.forEach((c) => {
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        candidates.push(c)
      }
    })
  }

  const hasStrongMatch = () =>
    candidates.some(
      (c) => c.syncedLyrics && duration && Math.abs(c.duration - duration) <= 2,
    )

  try {
    const res = await fetch(
      `https://lrclib.net/api/get?${qs({
        artist_name: hasArtist ? a : '',
        track_name: variants[0],
        duration: duration ? Math.round(duration) : '',
      })}`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.ok) push([await res.json()])
  } catch {
    /* tenta busca */
  }

  for (const v of variants) {
    for (const av of artistVariants) {
      if (hasStrongMatch()) break
      try {
        const res = await fetch(
          `https://lrclib.net/api/search?${qs({ artist_name: av, track_name: v })}`,
          { headers: { Accept: 'application/json' } },
        )
        if (res.ok) push(await res.json())
      } catch {
        /* ignora variante */
      }
    }
    if (hasStrongMatch()) break
  }

  if (!candidates.length) return null

  const artistNorms = [...new Set(artistVariants.filter(Boolean).map(normText))]
  const score = (c) => {
    let s = 0
    if (c.syncedLyrics) s += 120
    else if (c.plainLyrics) s += 15
    if (c.instrumental) s -= 10
    if (duration && c.duration) {
      const diff = Math.abs(c.duration - duration)
      if (diff <= 2) s += 80
      else s += Math.max(0, 45 - diff * 3)
    }
    if (artistNorms.length) {
      const ca = normText(c.artistName)
      if (artistNorms.some((n) => ca === n)) s += 50
      else if (artistNorms.some((n) => ca.includes(n) || n.includes(ca))) s += 25
    }
    if (variants.some((v) => normText(v) === normText(c.trackName))) s += 10
    return s
  }

  candidates.sort((x, y) => score(y) - score(x))
  const best = candidates[0]
  const bestArtist = normText(best.artistName)
  const artistOk =
    artistNorms.length > 0 &&
    artistNorms.some((n) => bestArtist === n || bestArtist.includes(n) || n.includes(bestArtist))
  const durationOk =
    !!duration && !!best.duration && Math.abs(best.duration - duration) <= 8
  const bestTrackN = normText(best.trackName)
  const exactTitle = variants.some((v) => normText(v) === bestTrackN)
  const fuzzyTitle =
    exactTitle ||
    (bestTrackN &&
      (bestTrackN.includes(normText(variants[0])) || normText(variants[0]).includes(bestTrackN)))
  const synced = !!best.syncedLyrics
  const accept =
    (artistOk && durationOk) ||
    (artistOk && fuzzyTitle) ||
    (durationOk && fuzzyTitle) ||
    (synced && exactTitle && !best.instrumental)
  if (!accept) return null
  const built = buildLyrics(best)
  if (built) return built
  return fetchPlainLyrics(a, variants[0])
}

/* Letras simples (sem sincronização) — fallback para músicas que
   não existem no LRCLIB (boa cobertura em português/outros idiomas). */

export async function fetchPlainLyrics(artist, title) {
  const candidates = []
  candidates.push({ a: artist, t: title })
  if (artist) candidates.push({ a: '', t: title })
  for (const { a, t } of candidates) {
    if (!a || !t) continue
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) continue
      const data = await res.json()
      const text = data && typeof data.lyrics === 'string' ? data.lyrics : ''
      if (!text.trim()) continue
      return {
        synced: false,
        lines: text.split('\n').map((l) => ({ time: null, text: l })),
        source: { provider: 'lyrics.ovh', artistName: a || undefined, trackName: t },
        fallback: true,
      }
    } catch {
      /* tenta a próxima variação */
    }
  }
  return null
}
