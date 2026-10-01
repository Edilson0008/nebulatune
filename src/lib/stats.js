export function sumPlayDays(track, fromMs, toMs) {
  const days = track?.playDays || {}
  let sum = 0
  for (const [key, n] of Object.entries(days)) {
    const ts = Date.parse(key)
    if (!Number.isNaN(ts) && ts >= fromMs && ts <= toMs) sum += n
  }
  return sum
}

export function playsInPeriod(track, period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (period === 'week') return sumPlayDays(track, today - 6 * 86400000, now.getTime())
  if (period === 'month')
    return sumPlayDays(track, new Date(now.getFullYear(), now.getMonth(), 1).getTime(), now.getTime())
  if (period === 'year')
    return sumPlayDays(track, new Date(now.getFullYear(), 0, 1).getTime(), now.getTime())
  return track?.plays || 0
}

export const PERIOD_LABELS = [
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['year', 'Ano'],
  ['all', 'Tudo'],
]

// Os limites das conquistas moram AQUI, em um lugar só. O seu Perfil calcula a
// partir da biblioteca inteira; o perfil de um amigo calcula a partir do
// resumo que o banco devolveu. Se a lista mudasse num lugar e não no outro, os
// dois marcadores iam discordar.
const DEFS = [
  { id: 'first', icon: '🎵', name: 'Primeira música', color: '#4ade80', need: 1, valor: (r) => r.musicas },
  { id: 'ten', icon: '💿', name: 'Coleção com 10', color: '#22d3ee', need: 10, valor: (r) => r.musicas },
  { id: 'fifty', icon: '📀', name: 'Coleção com 50', color: '#a78bfa', need: 50, valor: (r) => r.musicas },
  { id: 'plays100', icon: '🔥', name: '100 plays', color: '#fb923c', need: 100, valor: (r) => r.plays },
  { id: 'plays500', icon: '🚀', name: '500 plays', color: '#f472b6', need: 500, valor: (r) => r.plays },
  { id: 'fav10', icon: '❤️', name: '10 favoritas', color: '#f87171', need: 10, valor: (r) => r.favs },
  { id: 'days7', icon: '📅', name: '7 dias com música', color: '#facc15', need: 7, valor: (r) => r.dias },
  { id: 'pet50', icon: '🐾', name: '50 toques no gatinho', color: '#34d399', need: 50, valor: (r) => r.touches },
  { id: 'loja1', icon: '🛍️', name: 'Primeira compra', color: '#fbbf24', need: 1, valor: (r) => r.buys },
  { id: 'loja10', icon: '🏦', name: 'Freguês da lojinha', color: '#fde047', need: 10, valor: (r) => r.buys },
  { id: 'toy1', icon: '🎈', name: 'Primeiro brinquedo', color: '#c084fc', need: 1, valor: (r) => r.toys },
  { id: 'toy3', icon: '🎠', name: 'Sala de brincadeiras', color: '#f472b6', need: 3, valor: (r) => r.toys },
  { id: 'bath1', icon: '🧼', name: 'Primeira loção', color: '#38bdf8', need: 1, valor: (r) => r.baths },
  { id: 'bath3', icon: '🛁', name: 'Spa do gatinho', color: '#22d3ee', need: 3, valor: (r) => r.baths },
]

// Números que alimentam as conquistas, seja da biblioteca local, seja do resumo
// que veio do banco.
export function resumoDeJogo(resumo) {
  const r = resumo || {}
  return {
    plays: Number(r.plays) || 0,
    musicas: Number(r.musicas) || 0,
    favs: Number(r.favs) || 0,
    dias: Number(r.dias) || 0,
    touches: Number(r.touches) || 0,
    buys: Number(r.buys) || 0,
    toys: Number(r.toys) || 0,
    baths: Number(r.baths) || 0,
  }
}

export function conquistasDoResumo(resumo) {
  const r = resumoDeJogo(resumo)
  return DEFS.map((d) => {
    const have = Number(d.valor(r)) || 0
    return {
      id: d.id,
      icon: d.icon,
      name: d.name,
      color: d.color,
      need: d.need,
      done: have >= d.need,
      shown: Math.min(have, d.need),
      pct: Math.min(100, Math.round((have / d.need) * 100)),
    }
  })
}

export function getAchievements(library, touches, extra) {
  const { buys = 0, toys = 0, baths = 0 } = extra || {}
  const list = Array.isArray(library) ? library : []
  const totalPlaysAll = list.reduce((acc, t) => acc + (t.plays || 0), 0)
  const daySet = new Set()
  list.forEach((t) => Object.keys(t.playDays || {}).forEach((d) => daySet.add(d)))
  return conquistasDoResumo({
    plays: totalPlaysAll,
    musicas: list.length,
    favs: list.filter((t) => t.fav).length,
    dias: daySet.size,
    touches,
    buys,
    toys,
    baths,
  })
}
