// Utilidades de cor puras (sem React). Usadas pelo fundo (espectrograma e
// ciclo de cor "vivas") para converter entre hex e matiz (hue).

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex(r, g, b) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${((1 << 24) + (cl(r) << 16) + (cl(g) << 8) + cl(b)).toString(16).slice(1)}`
}

// Converte HSL para hex. Precisão de 8 bits por canal é mais que suficiente
// para as cores do fundo e mantém tudo o que sai em `#rrggbb`, que é o
// formato que o resto do app já espera ler das variáveis CSS.
export function hslToHex(h, s, l) {
  const H = ((h % 360) + 360) % 360
  const S = Math.max(0, Math.min(100, s)) / 100
  const L = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1))
  const m = L - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (H < 60) [r, g, b] = [c, x, 0]
  else if (H < 120) [r, g, b] = [x, c, 0]
  else if (H < 180) [r, g, b] = [0, c, x]
  else if (H < 240) [r, g, b] = [0, x, c]
  else if (H < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

// Matiz (0-360) de uma cor. Aceita #rrggbb, rgb()/rgba() e hsl()/hsla() —
// o "cores vivas" gira o --accent com `hsl(...)`, então o fundo recebe as
// duas formas. Se não for uma cor válida, devolve o `fallback` (assim uma
// variável CSS vazia não quebra o desenho).
export function hueOf(color, fallback = 0) {
  const s = String(color || '').trim()
  const hsl = /^hsla?\(\s*([\d.]+)(deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i.exec(s)
  if (hsl) {
    return (((parseFloat(hsl[1]) % 360) + 360) % 360)
  }
  const rgb = hexToRgb(s) || /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(s)
  if (!rgb) return fallback
  const r = Array.isArray(rgb) ? parseFloat(rgb[1]) : rgb.r
  const g = Array.isArray(rgb) ? parseFloat(rgb[2]) : rgb.g
  const b = Array.isArray(rgb) ? parseFloat(rgb[3]) : rgb.b
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return fallback
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

// Menor distância entre dois matizes (sentido horário ou anti, o mais curto).
export function hueGap(from, to) {
  return ((to - from + 540) % 360) - 180
}
