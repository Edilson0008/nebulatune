
export function formatTime(sec) {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function fmtSleep(sec) {
  return formatTime(sec)
}

export function nf(n) {
  return new Intl.NumberFormat('pt-BR').format(n || 0)
}

// CHANGELOG: manter no MÁXIMO 4 versões (a mais recente no topo).
// Ao adicionar a próxima versão, REMOVER a mais antiga para entrar a nova.

export function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0
  }
  return h
}

export function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
