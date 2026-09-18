import { useEffect, useState } from 'react'
import { applySettings, BAND_COUNT } from './graph'

const STORAGE_KEY = 'nt.equalizer'

export const PRESETS = {
  flat: { label: 'Plano', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  rock: { label: 'Rock', bands: [5, 5, 4, 3, 1, 0, 1, 4, 4, 5] },
  pop: { label: 'Pop', bands: [-1, 1, 3, 5, 4, 2, 0, -1, 0, 1] },
  jazz: { label: 'Jazz', bands: [4, 2, 1, 3, 2, 0, -1, 1, 3, 4] },
  classic: { label: 'Clássico', bands: [5, 4, 3, 1, -1, -1, 1, 3, 4, 4] },
  eletro: { label: 'Eletrônica', bands: [5, 4, 3, 0, 0, 1, 3, 4, 5, 5] },
  hiphop: { label: 'Hip-Hop / R&B', bands: [5, 4, 2, 1, 0, 0, 1, 2, 3, 4] },
  funk: { label: 'Funk', bands: [5, 4, 2, 0, 0, 2, 3, 4, 5, 5] },
  vocal: { label: 'Vocal', bands: [-1, 0, 1, 3, 4, 4, 3, 1, 0, -1] },
  bass: { label: 'Graves', bands: [7, 6, 5, 4, 2, 1, 0, 0, 0, 0] },
  treble: { label: 'Agudos', bands: [0, 0, 0, 0, 1, 1, 3, 5, 6, 7] },
  loudness: { label: 'Loudness', bands: [5, 4, 3, 2, 1, 0, 1, 3, 4, 5] },
  acustico: { label: 'Acústico', bands: [6, 4, 2, 0, 1, 2, 1, 2, 3, 4] },
  dance: { label: 'Dance', bands: [6, 5, 4, 2, 0, 1, 3, 5, 4, 3] },
  reggae: { label: 'Reggae', bands: [4, 3, 1, 0, 0, 1, 2, 3, 3, 2] },
  sertanejo: { label: 'Sertanejo', bands: [2, 2, 3, 5, 5, 4, 2, 1, 1, 2] },
  radio: { label: 'Rádio / Voz', bands: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
  vintage: { label: 'Vintage', bands: [4, 3, 2, 1, 0, -1, -1, 1, 2, 3] },
  personalizado: { label: 'Personalizado', bands: null },
}

export function defaultSettings() {
  return {
    enabled: true,
    preset: 'flat',
    volume: 1,
    bands: PRESETS.flat.bands.slice(),
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const clean = { ...parsed }
      delete clean.preamp
      return {
        ...defaultSettings(),
        ...clean,
        bands:
          Array.isArray(parsed.bands) && parsed.bands.length === BAND_COUNT
            ? parsed.bands
            : defaultSettings().bands,
      }
    }
  } catch {
    /* dados inválidos: usa padrão */
  }
  return defaultSettings()
}

export function useEqualizer() {
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    applySettings(settings)
  }, [settings])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* sem espaço */
    }
  }, [settings])

  return {
    settings,
    setBand: (i, v) =>
      setSettings((s) => {
        const bands = [...s.bands]
        bands[i] = v
        return { ...s, bands, preset: 'personalizado' }
      }),
    setVolume: (v) => setSettings((s) => ({ ...s, volume: v })),
    applyPreset: (name) =>
      setSettings((s) => ({
        ...s,
        preset: name,
        bands: (PRESETS[name] && PRESETS[name].bands
          ? PRESETS[name].bands
          : defaultSettings().bands
        ).slice(),
      })),
    toggle: () => setSettings((s) => ({ ...s, enabled: !s.enabled })),
    reset: () => setSettings(() => defaultSettings()),
  }
}