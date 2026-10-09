import { useEffect, useRef } from 'react'
import * as graph from '../audio/graph'
import { getPlayState } from '../lib/play-state.js'

// Estado compartilhado dos graves (lido pelas partículas e pelo visualizador).
let bass = 0
let kick = 0
export const getBass = () => bass
export const getKick = () => kick

const RIPPLE_SELECTOR = '.np-play, .play-btn, .btn-primary'

// Efeitos de áudio-reativos do player Onda: batida (flash + anel), inclinação
// 3D da capa (mouse) e onda de luz nos botões. Só visual — não mexe no layout.
// Obs.: o pulso da capa com os graves (--b) e o anel em volta dela (.fx-ring)
// foram REMOVIDOS — a capa não fica mais "respirando"/pulsando.
export function FxLayer() {
  const flashRef = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const root = document.documentElement
    let raf = 0
    let data = null
    let avg = 0
    let last = 0
    let wasPlaying = null

    const beat = () => {
      if (reduce) return
      kick = 1
      const fl = flashRef.current
      if (fl) {
        fl.classList.add('on')
        setTimeout(() => fl.classList.remove('on'), 130)
      }
    }

    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const playing = getPlayState()
      if (playing !== wasPlaying) {
        wasPlaying = playing
        root.classList.toggle('is-playing', !!playing)
      }
      const analyser = graph.getAnalyser()
      let b = 0
      if (playing && analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        b = (data[0] + data[1] + data[2]) / (3 * 255)
      }
      // Segue o grave mais devagar (0.12 em vez de 0.25): a batida fica mais
      // suave e demora mais para acender/apagar.
      bass += (b - bass) * 0.09
      avg += (bass - avg) * 0.02
      kick *= 0.85
      if (playing && bass > 0.38 && bass > avg * 1.35 && t - last > 360) {
        last = t
        beat()
      }
    }
    raf = requestAnimationFrame(loop)

    const onMove = (e) => {
      if (reduce || e.pointerType !== 'mouse') return
      const np = e.target.closest?.('.now-playing')
      const cv = document.querySelector('.np-cover')
      if (!np || !cv) return
      const r = np.getBoundingClientRect()
      cv.style.setProperty('--rx', `${(-((e.clientY - r.top) / r.height - 0.5) * 12).toFixed(1)}deg`)
      cv.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(1)}deg`)
    }
    const onOut = (e) => {
      if (e.relatedTarget) return
      const cv = document.querySelector('.np-cover')
      if (cv) {
        cv.style.setProperty('--rx', '0deg')
        cv.style.setProperty('--ry', '0deg')
      }
    }
    const onDown = (e) => {
      if (reduce) return
      const btn = e.target.closest?.(RIPPLE_SELECTOR)
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const rip = document.createElement('i')
      rip.className = 'fx-rip'
      rip.style.left = `${e.clientX - r.left}px`
      rip.style.top = `${e.clientY - r.top}px`
      btn.appendChild(rip)
      setTimeout(() => rip.remove(), 600)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', onDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown)
      root.classList.remove('is-playing')
      const cv = document.querySelector('.np-cover')
      if (cv) ['--rx', '--ry'].forEach((k) => cv.style.removeProperty(k))
      bass = 0
      kick = 0
    }
  }, [])

  return <div className="fx-flash" ref={flashRef} aria-hidden="true" />
}