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

export async function buildBackup({ library = [], settings, equalizer, lyricSync, playlists = null } = {}) {
  const items = []
  for (const t of library) {
    const stored = t.audioBlob || t.coverBlob ? null : await getFile(t.id).catch(() => null)
    items.push({
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
      audioData: await blobToDataUrl(t.audioBlob || stored?.audioBlob || null),
      coverData: await blobToDataUrl(t.coverBlob || stored?.coverBlob || null),
      coverRemote: t.coverRemote || null,
    })
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
  return data.tracks
    .filter((t) => t && t.audioData)
    .map((t, i) => {
      const audioBlob = dataUrlToBlob(t.audioData)
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
        src: URL.createObjectURL(audioBlob),
        coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : t.coverRemote || null,
      }
    })
}
