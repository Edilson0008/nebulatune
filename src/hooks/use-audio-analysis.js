import { useEffect, useRef, useState } from 'react'
import { getAnalyser } from '../audio/graph'

/**
 * Hook para análise de áudio em tempo real usando Web Audio API.
 * Retorna nível de bass (0-1) e detecção de batida.
 */
export function useAudioAnalysis(playing) {
  const [bass, setBass] = useState(0)
  const [beat, setBeat] = useState(false)
  const analyserRef = useRef(null)
  const dataRef = useRef(null)
  const rafRef = useRef(0)
  const lastBeatRef = useRef(0)
  const bassHistoryRef = useRef([])
  const avgBassRef = useRef(0)

  useEffect(() => {
    if (!playing) {
      setBass(0)
      setBeat(false)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      return
    }

    const analyser = getAnalyser()
    if (!analyser) {
      // Tentar novamente em breve
      const t = setTimeout(() => {
        const a = getAnalyser()
        if (a) analyserRef.current = a
      }, 100)
      return () => clearTimeout(t)
    }
    analyserRef.current = analyser

    const bufferLength = analyser.frequencyBinCount
    dataRef.current = new Uint8Array(bufferLength)

    let running = true

    const analyze = () => {
      if (!running || !analyserRef.current) return

      analyserRef.current.getByteFrequencyData(dataRef.current)

      // Calcular bass (frequências baixas: primeiros ~10 bins = ~0-400Hz)
      const bassBins = 10
      let bassSum = 0
      for (let i = 0; i < bassBins; i++) {
        bassSum += dataRef.current[i]
      }
      const bassLevel = bassSum / (bassBins * 255) // 0-1

      // Suavizar bass
      const smoothedBass = bassLevel * 0.3 + (bassHistoryRef.current[0] || 0) * 0.7
      bassHistoryRef.current.unshift(smoothedBass)
      if (bassHistoryRef.current.length > 10) bassHistoryRef.current.pop()

      // Média móvel do bass para detecção de beat
      const avg = bassHistoryRef.current.reduce((a, b) => a + b, 0) / bassHistoryRef.current.length
      avgBassRef.current = avgBassRef.current * 0.95 + avg * 0.05

      // Detecção de beat: pico de bass acima da média
      const now = performance.now()
      const isBeat = smoothedBass > 0.35 && smoothedBass > avgBassRef.current * 1.4 && now - lastBeatRef.current > 200

      if (isBeat) {
        lastBeatRef.current = now
        setBeat(true)
        // Reset beat após um frame
        setTimeout(() => setBeat(false), 50)
      }

      setBass(smoothedBass)

      if (running) rafRef.current = requestAnimationFrame(analyze)
    }

    rafRef.current = requestAnimationFrame(analyze)

    return () => {
      running = false
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [playing])

  return { bass, beat }
}