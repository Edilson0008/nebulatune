import { useEffect, useMemo, useState } from 'react'
import { readLocal, writeLocal } from './localstore'

const PSTAT_DEFAULTS = { touches: 0, hearts: 0, sleeps: 0, scares: 0, meows: 0, coins: 0 }

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
  bio: '',
  speed: 1,
  fetchCovers: true,
  avatar: '',
  bgAnimated: true,
  cosmosAnimated: true,
  petSound: true,
}

function merge(raw) {
  return { ...DEFAULTS, ...raw }
}

export function useSettings() {
  const [settings, setSettings] = useState(() => merge(readLocal('nt.settings')))

  useEffect(() => {
    const a = ACCENTS[settings.accent] || ACCENTS.violet
    document.documentElement.style.setProperty('--accent', a.accent)
    document.documentElement.style.setProperty('--accent-2', a.accent2)
  }, [settings.accent])

  useEffect(() => {
    writeLocal('nt.settings', settings)
  }, [settings])

  const api = useMemo(
    () => ({
      set: (key, value) => setSettings((s) => ({ ...s, [key]: value })),
      setAccent: (value) => setSettings((s) => ({ ...s, accent: value })),
      setUserName: (value) => setSettings((s) => ({ ...s, userName: value })),
      setBio: (value) => setSettings((s) => ({ ...s, bio: value })),
      setSpeed: (value) => setSettings((s) => ({ ...s, speed: value })),
      setFetchCovers: (value) => setSettings((s) => ({ ...s, fetchCovers: value })),
      setAvatar: (value) => setSettings((s) => ({ ...s, avatar: value })),
      setBgAnimated: (value) => setSettings((s) => ({ ...s, bgAnimated: value })),
      setCosmosAnimated: (value) => setSettings((s) => ({ ...s, cosmosAnimated: value })),
      setPetSound: (value) => setSettings((s) => ({ ...s, petSound: value })),
      setAll: (value) => setSettings((s) => ({ ...s, ...(value || {}) })),
    }),
    [],
  )

  return { settings, api }
}

export function usePetStats() {
  const [petStats, setPetStats] = useState(() => ({
    ...PSTAT_DEFAULTS,
    ...(readLocal('nt.petstats') || {}),
  }))

  useEffect(() => {
    writeLocal('nt.petstats', petStats)
  }, [petStats])

  const bumpPet = useMemo(
    () => (key, amount = 1) => setPetStats((s) => ({ ...s, [key]: (s[key] || 0) + amount })),
    [],
  )

  // Aplica pontuações vindas da nuvem sem nunca diminuir os contadores:
  // cada aparelho contribui com os seus toques/corações e o total só cresce.
  const applyPetStats = useMemo(
    () => (value) => {
      if (!value || typeof value !== 'object') return
      setPetStats((s) => {
        const keys = ['touches', 'hearts', 'sleeps', 'scares', 'meows', 'coins']
        const merged = { ...s }
        for (const k of keys) {
          const v = Number(value[k]) || 0
          if (v > (Number(s[k]) || 0)) merged[k] = v
        }
        return { ...PSTAT_DEFAULTS, ...merged }
      })
    },
    [],
  )

  return { petStats, bumpPet, applyPetStats }
}