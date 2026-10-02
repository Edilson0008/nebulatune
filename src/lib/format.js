
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

// Tempo em palavras, para o Perfil: `52s` · `38min` · `14h 20min` · `1h 05min`.
// Arredonda ANTES de escolher a unidade, senão 3599s viraria "60min" — que
// ninguém entende. Por isso o minuto redondo vira hora.
export function fmtTempo(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0s'
  const total = Math.round(sec)
  if (total < 60) return `${total}s`
  const min = Math.round(total / 60)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m.toString().padStart(2, '0')}min` : `${h}h`
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
