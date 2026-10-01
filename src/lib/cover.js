import { cleanArtist, cleanTitle } from './filename.js'

// ~6 KB de binário. Acima disso a miniatura não sobe: a capa some no perfil do
// amigo, o que é melhor do que inchar a linha da biblioteca a cada música.
export const MAX_CAPA_COMPARTILHADA = 6 * 1024

export function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null)
    fr.onerror = () => resolve(null)
    fr.readAsDataURL(blob)
  })
}

export function coverPalette(track) {
  const c = Array.isArray(track?.cover) && track.cover.length ? track.cover : null
  return {
    c1: (c && c[0]) || '#8b5cf6',
    c2: (c && c[1]) || '#2a2450',
    c3: (c && c[2]) || '#c084fc',
  }
}

export async function fetchItunesCover(title, artist) {
  const t = cleanTitle(title)
  const a = cleanArtist(artist)
  const queries = []
  if (a && a.toLowerCase() !== 'desconhecido') queries.push(`${a} ${t}`)
  queries.push(t)

  for (const q of queries) {
    if (!q) continue
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`,
      )
      if (!res.ok) continue
      const data = await res.json()
      const art = data.results?.[0]?.artworkUrl100
      if (art) return art.replace(/\/\d+x\d+bb\./, '/600x600bb.')
    } catch {
      /* sem internet / bloqueado */
    }
  }
  return null
}

// Miniatura que dá para mostrar no perfil de outra pessoa. A capa do arquivo é
// um blob do aparelho: para chegar na nuvem ela vira um data URL bem pequeno
// (64px). O áudio continua local — só a imagem sobe, e só quando alguém já
// tocou a música. Devolve null se não couber, para não estufar o sync.
export async function compartilharCapa(blob, { max = 64, quality = 0.6 } = {}) {
  try {
    if (!blob || !/^image\//.test(blob.type || '')) return null
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    if (!out || out.size > MAX_CAPA_COMPARTILHADA) return null
    const data = await blobToDataUrl(out)
    return data && data.length > 'data:image/webp;base64,'.length + 200 ? data : null
  } catch {
    return null
  }
}

export async function makeThumb(blob, max = 320) {
  try {
    if (!blob || !/^image\//.test(blob.type || '')) return blob
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!out) return blob
    return out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}
