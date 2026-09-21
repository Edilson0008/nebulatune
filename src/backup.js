import { getFile } from './storage/db'

export const BACKUP_TYPE = 'backup-completo'

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null)
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(data) {
  if (!data) return null
  const comma = data.indexOf(',')
  if (comma < 0) return null
  const mime = /^data:([^;]+)/.exec(data.slice(0, comma))?.[1] || ''
  const bin = atob(data.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function buildBackup(
  { library = [], settings, equalizer, lyricSync, playlists = null, petStats = null } = {},
  { includeMedia = false } = {},
) {
  const items = []
  for (const t of library) {
    // Por padrão NÃO converte o áudio/capa (isso é pesado). O envio real dos
    // bytes é feito sob demanda no pushBackup, só quando a conta ainda não tem
    // aquele arquivo. O `includeMedia` é usado pela exportação manual (arquivo).
    let stored = null
    if (includeMedia && (!t.audioBlob || !t.coverBlob)) {
      stored = await getFile(t.id).catch(() => null)
    }
    const audioBlob = t.audioBlob || stored?.audioBlob || null
    const coverBlob = t.coverBlob || stored?.coverBlob || null
    const item = {
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: Math.round(t.duration || 0),
      cover: t.cover,
      fav: t.fav === true,
      plays: t.plays || 0,
      playDays: t.playDays || {},
      addedAt: t.addedAt || Date.now(),
      coverRemote: t.coverRemote || null,
      // Diz ao servidor se este aparelho TEM o arquivo (para saber se vale
      // pedir os bytes e enviar). Não é o arquivo em si.
      hasAudio: Boolean((audioBlob && audioBlob.size) || t.hasAudio === true),
      hasCover: Boolean(coverBlob && coverBlob.size),
    }
    if (includeMedia) {
      item.audioData = await blobToDataUrl(audioBlob)
      item.coverData = await blobToDataUrl(coverBlob)
    }
    items.push(item)
  }
  return {
    app: 'NebulaTune',
    type: BACKUP_TYPE,
    exportedAt: new Date().toISOString(),
    count: items.length,
    tracks: items,
    settings: settings || null,
    equalizer: equalizer || null,
    lyricSync: lyricSync || null,
    playlists: Array.isArray(playlists) ? playlists : null,
    petStats: petStats || null,
  }
}

export function parseBackup(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!data || data.app !== 'NebulaTune' || !Array.isArray(data.tracks)) {
    throw new Error('não parece ser um backup do NebulaTune')
  }
  return data
}

export function tracksFromBackup(data, startAt = Date.now()) {
  const now = startAt
  // TODAS as músicas da conta entram na biblioteca, mesmo que o arquivo de som
  // ainda não tenha descido. Antes, músicas sem áudio eram DESCARTADAS — então
  // um aparelho nunca chegava ao mesmo número de músicas da nuvem (ficava
  // "faltando" a música e o aviso de "ainda não batem" nunca sumia).
  const list = Array.isArray(data?.tracks) ? data.tracks : []
  return list
    .filter((t) => t && typeof t === 'object')
    .map((t, i) => {
      const hasAudio = typeof t.audioData === 'string' && t.audioData.length > 0
      const audioBlob = hasAudio ? dataUrlToBlob(t.audioData) : null
      const coverBlob = dataUrlToBlob(t.coverData)
      return {
        id: typeof t.id === 'string' && t.id ? t.id : `restore-${now}-${i}`,
        title: t.title || 'Sem título',
        artist: t.artist || 'Desconhecido',
        album: t.album || '',
        duration: t.duration || 0,
        cover: Array.isArray(t.cover) ? t.cover : null,
        fav: t.fav === true,
        plays: t.plays || 0,
        playDays: t.playDays && typeof t.playDays === 'object' ? t.playDays : {},
        addedAt: t.addedAt || now + i,
        audioBlob,
        coverBlob,
        coverRemote: t.coverRemote || null,
        src: audioBlob ? URL.createObjectURL(audioBlob) : null,
        coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : t.coverRemote || null,
        // Marca a música que está na conta mas cujo som ainda não baixou.
        audioMissing: !audioBlob,
      }
    })
}
