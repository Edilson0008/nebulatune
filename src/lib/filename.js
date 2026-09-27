import { NOISE_RE } from './lyrics.js'

export const AUDIO_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i

export const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i

export function cleanTitle(raw) {
  return raw
    .replace(/[(（[]\s*[^)）\]]*[)）\]]/g, (group) => (NOISE_RE.test(group) ? ' ' : group))
    .replace(/\s*\b(feat\.?|ft\.?|with)\b[^)\]]*/gi, '')
    .replace(/\s*[-–—]\s*topic$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function cleanArtist(raw) {
  return (raw || '').replace(/\s*[-–—]\s*topic$/i, '').replace(/\s{2,}/g, ' ').trim()
}

export function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase().trim()
}

export function parseFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()
  if (base.includes(' - ')) {
    const [artist, ...rest] = base.split(' - ')
    return { artist: artist.trim(), title: rest.join(' - ').trim() }
  }
  return { artist: 'Desconhecido', title: base }
}

export function extFromType(type) {
  const t = (type || '').split(';')[0].toLowerCase()
  if (t.includes('flac')) return 'flac'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('wav')) return 'wav'
  if (t.includes('m4a')) return 'm4a'
  if (t.includes('mp4')) return 'm4a'
  if (t.includes('aac')) return 'aac'
  if (t.includes('mpeg')) return 'mp3'
  return 'mp3'
}
