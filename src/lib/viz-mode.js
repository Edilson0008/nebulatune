import { useSyncExternalStore } from 'react'

export const VIZ_MODES = ['Nebulosa', 'Barras', 'Onda', 'Círculo', 'Espelho', 'Pontos', 'Espectrograma']
const KEY = 'nebulatune-viz-mode'
const listeners = new Set()

function read() {
  try {
    const v = parseInt(localStorage.getItem(KEY) || '0', 10)
    return Number.isInteger(v) && v >= 0 && v < VIZ_MODES.length ? v : 0
  } catch {
    return 0
  }
}

let current = read()

export const getVizMode = () => current

export function setVizMode(n) {
  if (!Number.isInteger(n) || n < 0 || n >= VIZ_MODES.length || n === current) return
  current = n
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    /* sem storage */
  }
  listeners.forEach((fn) => fn())
}

export const nextVizMode = () => setVizMode((current + 1) % VIZ_MODES.length)

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useVizMode = () => useSyncExternalStore(subscribe, getVizMode, getVizMode)