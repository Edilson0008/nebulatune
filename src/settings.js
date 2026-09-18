import { useEffect, useMemo, useState } from 'react'

const KEY = 'nt.settings'

export const ACCENTS = {
  violet: { name: 'Violeta', accent: '#8b5cf6', accent2: '#c084fc' },
  pink: { name: 'Rosa', accent: '#ec4899', accent2: '#f472b6' },
  green: { name: 'Verde', accent: '#10b981', accent2: '#34d399' },
  blue: { name: 'Azul', accent: '#3b82f6', accent2: '#60a5fa' },
  orange: { name: 'Laranja', accent: '#f97316', accent2: '#fb923c' },
  cyan: { name: 'Ciano', accent: '#06b6d4', accent2: '#22d3ee' },
}

export const SPEEDS = [1, 1.25, 1.5, 2]

const DEFAULTS = {
  accent: 'violet',
  userName: '',
  speed: 1,
  fetchCovers: true,
  avatar: '',
  bgAnimated: true,
  cosmosAnimated: true,
}

function merge(raw) {
  return { ...DEFAULTS, ...raw }
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      return merge(JSON.parse(localStorage.getItem(KEY) || '{}'))
    } catch {
      return { ...DEFAULTS }
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* armazenamento indisponível */
    }
  }, [settings])

  useEffect(() => {
    const a = ACCENTS[settings.accent] || ACCENTS.violet
    document.documentElement.style.setProperty('--accent', a.accent)
    document.documentElement.style.setProperty('--accent-2', a.accent2)
  }, [settings.accent])

  const api = useMemo(
    () => ({
      set: (key, value) => setSettings((s) => ({ ...s, [key]: value })),
      setAccent: (value) => setSettings((s) => ({ ...s, accent: value })),
      setUserName: (value) => setSettings((s) => ({ ...s, userName: value })),
      setSpeed: (value) => setSettings((s) => ({ ...s, speed: value })),
      setFetchCovers: (value) => setSettings((s) => ({ ...s, fetchCovers: value })),
      setAvatar: (value) => setSettings((s) => ({ ...s, avatar: value })),
      setBgAnimated: (value) => setSettings((s) => ({ ...s, bgAnimated: value })),
      setCosmosAnimated: (value) => setSettings((s) => ({ ...s, cosmosAnimated: value })),
      setAll: (value) => setSettings((s) => ({ ...s, ...(value || {}) })),
    }),
    [],
  )

  return { settings, api }
}