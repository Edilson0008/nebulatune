import { useEffect, useRef, useState } from 'react'
import * as graph from '../audio/graph'

export const MOOD_WINDOW_MS = 3600

export const MOOD_MIN_AUDIBLE_RATIO = 0.2

export const MOOD_UPBEAT = new Set(['alegre', 'dancante', 'hype'])

export const moodClamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function moodFromFeatures({ loud, onsetRate, bassRatio, treble }) {
  const B = moodClamp01(treble / 1.5)
  if (onsetRate < 0.7) return loud < 0.16 ? 'triste' : 'calmo'
  if (onsetRate < 1.0) {
    if (B >= 0.5 && loud >= 0.12) return 'alegre'
    if (bassRatio >= 1.5 && loud >= 0.16) return 'dancante'
    if (loud < 0.15) return 'triste'
    return 'calmo'
  }
  if (onsetRate >= 1.5) {
    if (B >= 0.55 && loud >= 0.14) return 'hype'
    return 'dancante'
  }
  if (bassRatio >= 1.5 && B < 0.5) return 'dancante'
  if (B >= 0.5 && loud >= 0.11) return 'alegre'
  if (loud >= 0.14) return 'dancante'
  return 'calmo'
}

export function useMoodDetector({ playing, sig }) {
  const [mood, setMood] = useState('neutral')
  const moodRef = useRef('neutral')
  const lockRef = useRef(null)
  const [ultimaMusica, setUltimaMusica] = useState(sig)

  // Ao trocar de música o humor volta para "neutro". Feito aqui, no render, em
  // vez de dentro do efeito: o efeito dispara depois da tela pintar, o que
  // mostrava o humor da música anterior por um instante.
  if (sig !== ultimaMusica) {
    setUltimaMusica(sig)
    setMood('neutral')
  }

  useEffect(() => {
    moodRef.current = 'neutral'
    lockRef.current = null
    if (!playing) return undefined

    let cancelled = false
    let win = {
      t0: performance.now(),
      frames: 0,
      amp: 0,
      low: 0,
      high: 0,
      audible: 0,
      prev: 0,
      onsets: 0,
      lastOnset: 0,
    }
    graph.getContext()
    const analyser = graph.getAnalyser()
    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 64)

    const analyze = (w) => {
      const secs = w.frames / 60
      if (secs <= 0 || w.frames < 30 || w.audible / w.frames < MOOD_MIN_AUDIBLE_RATIO) return null
      const loud = w.amp / w.frames / 255
      const low = w.low / w.frames / 255
      const high = w.high / w.frames / 255
      if (loud < 0.045) return null
      const treble = low > 0 ? high / low : high > 0 ? 2 : 0
      const bassRatio = high > 0 ? low / high : low > 0 ? 2 : 0
      const onsetRate = w.onsets / secs
      return { loud, onsetRate, bassRatio, treble }
    }

    const step = (t) => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) {
        requestAnimationFrame(step)
        return
      }
      if (analyser) analyser.getByteFrequencyData(data)
      const n = data.length
      const loN = Math.max(1, Math.floor(n * 0.18))
      const hiN = Math.max(1, n - Math.floor(n * 0.5))
      let sum = 0
      let lowSum = 0
      let highSum = 0
      for (let i = 0; i < n; i += 1) {
        const v = data[i]
        sum += v
        if (i < loN) lowSum += v
        if (i >= n * 0.5) highSum += v
      }
      const amp = sum / n
      win.frames += 1
      win.amp += amp
      win.low += lowSum / loN
      win.high += highSum / hiN
      if (amp > 5) win.audible += 1
      if (amp > win.prev + 5 && amp > 14 && t - win.lastOnset > 190) {
        win.onsets += 1
        win.lastOnset = t
      }
      win.prev = amp
      if (t - win.t0 >= MOOD_WINDOW_MS) {
        const a = analyze(win)
        if (a) {
          const c = moodFromFeatures(a)
          const prev = moodRef.current
          const lock = lockRef.current
          if (lock && lock.c === c) {
            const movingToUpbeat = MOOD_UPBEAT.has(c)
            const fromDownbeat = prev !== 'neutral' && !MOOD_UPBEAT.has(prev)
            const req = movingToUpbeat && fromDownbeat ? 3 : 2
            if (lock.n + 1 >= req) {
              moodRef.current = c
              lockRef.current = null
              setMood(c)
            } else {
              lockRef.current = { c, n: lock.n + 1 }
            }
          } else if (prev !== c) {
            lockRef.current = { c, n: 1 }
          }
        }
        win = {
          t0: t,
          frames: 0,
          amp: 0,
          low: 0,
          high: 0,
          audible: 0,
          prev: amp,
          onsets: 0,
          lastOnset: t,
        }
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return () => {
      cancelled = true
    }
  }, [playing, sig])

  return mood
}
