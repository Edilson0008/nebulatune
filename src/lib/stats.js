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

export function getAchievements(library, touches, extra) {
  const { buys = 0, toys = 0, baths = 0 } = extra || {}
  const list = Array.isArray(library) ? library : []
  const totalPlaysAll = list.reduce((acc, t) => acc + (t.plays || 0), 0)
  const favCount = list.filter((t) => t.fav).length
  const daySet = new Set()
  list.forEach((t) => Object.keys(t.playDays || {}).forEach((d) => daySet.add(d)))
  const defs = [
    { id: 'first', icon: '🎵', name: 'Primeira música', color: '#4ade80', need: 1, have: list.length },
    { id: 'ten', icon: '💿', name: 'Coleção com 10', color: '#22d3ee', need: 10, have: list.length },
    { id: 'fifty', icon: '📀', name: 'Coleção com 50', color: '#a78bfa', need: 50, have: list.length },
    { id: 'plays100', icon: '🔥', name: '100 plays', color: '#fb923c', need: 100, have: totalPlaysAll },
    { id: 'plays500', icon: '🚀', name: '500 plays', color: '#f472b6', need: 500, have: totalPlaysAll },
    { id: 'fav10', icon: '❤️', name: '10 favoritas', color: '#f87171', need: 10, have: favCount },
    { id: 'days7', icon: '📅', name: '7 dias com música', color: '#facc15', need: 7, have: daySet.size },
    { id: 'pet50', icon: '🐾', name: '50 toques no gatinho', color: '#34d399', need: 50, have: touches || 0 },
    { id: 'loja1', icon: '🛍️', name: 'Primeira compra', color: '#fbbf24', need: 1, have: buys },
    { id: 'loja10', icon: '🏦', name: 'Freguês da lojinha', color: '#fde047', need: 10, have: buys },
    { id: 'toy1', icon: '🎈', name: 'Primeiro brinquedo', color: '#c084fc', need: 1, have: toys },
    { id: 'toy3', icon: '🎠', name: 'Sala de brincadeiras', color: '#f472b6', need: 3, have: toys },
    { id: 'bath1', icon: '🧼', name: 'Primeira loção', color: '#38bdf8', need: 1, have: baths },
    { id: 'bath3', icon: '🛁', name: 'Spa do gatinho', color: '#22d3ee', need: 3, have: baths },
  ]
  return defs.map((a) => ({
    ...a,
    done: a.have >= a.need,
    shown: Math.min(a.have, a.need),
    pct: Math.min(100, Math.round((a.have / a.need) * 100)),
  }))
}
