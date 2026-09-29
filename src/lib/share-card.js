const TAM = 1080
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function loadCover(src) {
  const tryLoad = (withCross) =>
    new Promise((res, rej) => {
      const img = new Image()
      if (withCross) img.crossOrigin = 'anonymous'
      img.onload = () => res(img)
      img.onerror = rej
      img.src = src
    })
  return tryLoad(true).catch(() => tryLoad(false).catch(() => null))
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, TAM)
  g.addColorStop(0, '#170f33')
  g.addColorStop(0.55, '#100a24')
  g.addColorStop(1, '#0b0817')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TAM, TAM)
  // brilho suave atrás do cartão da música
  const glow = ctx.createRadialGradient(540, 380, 40, 540, 380, 560)
  glow.addColorStop(0, 'rgba(139,92,246,0.22)')
  glow.addColorStop(1, 'rgba(139,92,246,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, TAM, TAM)
}

function drawCover(ctx, img) {
  const w = 620
  const h = 620
  const x = (TAM - w) / 2
  const y = 70
  // sombra
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 60
  roundRect(ctx, x + 10, y + 16, w, h, 36)
  ctx.fill()
  ctx.restore()
  // recorta a capa (fundo transparente nos cantos) num canvas auxiliar
  const s = document.createElement('canvas')
  s.width = w
  s.height = h
  const sc = s.getContext('2d')
  roundRect(sc, 0, 0, w, h, 36)
  sc.save()
  sc.clip()
  const iw = img.naturalWidth || img.width || 1
  const ih = img.naturalHeight || img.height || 1
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  sc.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  sc.restore()
  try {
    sc.getImageData(0, 0, 1, 1)
  } catch {
    return false // capa "envenenada" (imagem da internet que bloqueia) — não usa
  }
  ctx.drawImage(s, x, y, w, h)
  return true
}

function wrapTitle(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (ctx.measureText(cand).width <= maxWidth || !cur) {
      cur = cand
    } else {
      lines.push(cur)
      cur = w
    }
    if (lines.length === 2) break
  }
  if (lines.length === 2) return lines
  // palavra única longa demais: corta no meio
  if (ctx.measureText(cur).width > maxWidth && cur.length > 2) {
    const half = Math.floor(cur.length / 2)
    return [cur.slice(0, half), cur.slice(half)]
  }
  return [cur]
}

function drawTexts(ctx, title, artist, album) {
  const cx = TAM / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 62px ${FONT}`
  const lines = wrapTitle(ctx, title, 900)
  let y = 780
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], cx, y, 900)
    y += 76
  }
  if (artist) {
    ctx.fillStyle = '#c4b5fd'
    ctx.font = `54px ${FONT}`
    ctx.fillText(artist, cx, y + 10, 900)
    y += 78
  }
  if (album) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `42px ${FONT}`
    ctx.fillText(album, cx, y + 8, 900)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `30px ${FONT}`
  ctx.fillText('Ouça no NebulaTune ✦', cx, 1030)
}

export async function makeShareCard(t) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = TAM
  canvas.height = TAM
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const title = String(t?.title || 'Música')
  const artist = String(t?.artist || '')
  const album = String(t?.album || '')

  drawBackground(ctx)

  let coverImg = null
  if (t?.coverBlob) {
    coverImg = await loadCover(URL.createObjectURL(t.coverBlob))
  } else if (t?.coverUrl && /^https?:/.test(t.coverUrl)) {
    coverImg = await loadCover(t.coverUrl)
  }
  if (coverImg) drawCover(ctx, coverImg)
  drawTexts(ctx, title, artist, album)

  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b ? { blob: b, name: `${title} - ${artist || 'musica'}.png` } : null), 'image/png')
    } catch {
      resolve(null)
    }
  })
}