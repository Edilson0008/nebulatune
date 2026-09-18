const AUDIUS_APP = 'NebulaTune'
const AUDIUS_BASE = 'https://api.audius.co'
const AUDIUS_FALLBACK_HOST = 'https://discoveryprovider.audius.co'

let hostPromise = null

async function fetchAudiusHost() {
  const res = await fetch(AUDIUS_BASE, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('audius hosts')
  const data = await res.json()
  const hosts = Array.isArray(data?.data) ? data.data : []
  if (!hosts.length) throw new Error('audius sem provedores')
  return String(hosts[0]).replace(/\/+$/, '')
}

export function getAudiusHost() {
  if (!hostPromise) {
    hostPromise = fetchAudiusHost().catch(() => AUDIUS_FALLBACK_HOST)
  }
  return hostPromise
}

function artworkUrl(host, t) {
  const art = t.artwork || {}
  const cid =
    art['1000x1000'] || art['480x480'] || art['150x150'] || t.cover_art_sizes || t.cover_art || ''
  if (!cid) return ''
  if (/^https?:\/\//i.test(cid)) return cid
  return `${host}/content/${encodeURIComponent(cid)}`
}

function streamUrl(host, id) {
  return `${host}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${AUDIUS_APP}`
}

function conceptTrack(host, t) {
  return {
    id: `au-${t.id}`,
    title: t.title || 'Desconhecida',
    artist: t.user?.name || t.user?.handle || 'Audius',
    album: t.genre || '',
    coverUrl: artworkUrl(host, t),
    duration: Number(t.duration) || 0,
    src: 'au',
    audiusId: t.id,
    streamUrl: streamUrl(host, t.id),
  }
}

export async function searchAudiusTracks(q, limit = 25) {
  const host = await getAudiusHost()
  const url = `${host}/v1/tracks/search?query=${encodeURIComponent(q)}&limit=${limit}&app_name=${AUDIUS_APP}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('au busca')
  const data = await res.json()
  return (data?.data || [])
    .filter((t) => t && t.id && t.title)
    .map((t) => conceptTrack(host, t))
}

export async function topTracks(limit = 24) {
  const host = await getAudiusHost()
  const url = `${host}/v1/tracks/trending?limit=${limit}&app_name=${AUDIUS_APP}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('au em alta')
  const data = await res.json()
  return (data?.data || [])
    .filter((t) => t && t.id && t.title)
    .map((t) => conceptTrack(host, t))
}

export async function resolveAudiusStream(id) {
  const host = await getAudiusHost()
  return { url: streamUrl(host, id), playDuration: 0 }
}
