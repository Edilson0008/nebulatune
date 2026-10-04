import { useEffect, useRef } from 'react'
import * as graph from '../audio/graph'

export function NowParticles() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    let c2d
    try {
      c2d = canvas.getContext('2d')
    } catch {
      return undefined
    }
    if (!c2d) return undefined
    const rand = (a, b) => a + Math.random() * (b - a)
    const N = 20
    const parts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: 0.35 + Math.random() * 0.5,
      r: rand(0.7, 2.4),
      vy: rand(0.012, 0.045),
      vx: rand(-0.04, 0.04),
      tw: rand(1.4, 4),
      hue: Math.random() < 0.55 ? 150 : Math.random() < 0.5 ? 190 : 260,
      phase: Math.random() * Math.PI * 2,
    }))
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1

    const medir = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const nw = Math.max(1, Math.round(rect.width * dpr))
      const nh = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw
        canvas.height = nh
      }
      w = nw
      h = nh
    }
    medir()
    const aoResize = () => medir()
    window.addEventListener('resize', aoResize)

    // 30 fps: partículas decorativas não precisam de 60 fps.
    const MIN_MS = 1000 / 30
    let ultimo = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (typeof document !== 'undefined' && document.hidden) return
      const agora = performance.now()
      if (agora - ultimo < MIN_MS) return
      ultimo = agora
      if (!w || !h) return
      c2d.clearRect(0, 0, w, h)
      const t = performance.now() / 1000
      for (const p of parts) {
        p.y += p.vy * 0.016
        p.x += p.vx * 0.016
        if (p.y > 1.05) {
          p.y = -0.05
          p.x = Math.random()
          p.vx = rand(-0.04, 0.04)
        }
        const px = ((p.x % 1) + 1) % 1
        const alpha = 0.08 + 0.3 * Math.abs(Math.sin(t * p.tw + p.phase))
        const size = p.r * dpr * (1 + 0.4 * Math.sin(t * 1.3 + p.phase))
        c2d.beginPath()
        c2d.arc(px * w, p.y * h, Math.max(0.5, size), 0, Math.PI * 2)
        c2d.fillStyle = p.hue === 150
          ? `rgba(150,255,215,${alpha.toFixed(3)})`
          : `hsla(${p.hue}, 85%, 78%, ${alpha.toFixed(3)})`
        c2d.fill()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', aoResize)
    }
  }, [])

  return <canvas ref={ref} className="np-particles" aria-hidden="true" />
}

export function Visualizer() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    graph.getContext()
    const analyser = graph.getAnalyser()
    if (!canvas || !analyser) return undefined
    const c2d = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1

    const medir = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const nw = Math.max(1, Math.round(rect.width * dpr))
      const nh = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw
        canvas.height = nh
      }
      w = nw
      h = nh
    }
    medir()
    // Só re-mede se a janela girar — não no scroll ou layout interno.
    const aoResize = () => medir()
    window.addEventListener('resize', aoResize)

    // Gradientes em cache: 24 níveis de altura, criados uma vez por tamanho.
    const NIVEIS = 24
    let cacheH = 0
    let cache = []
    const gradientes = () => {
      if (h === cacheH && cache.length) return cache
      cacheH = h
      cache = []
      for (let k = 1; k <= NIVEIS; k += 1) {
        const alt = (h * k) / NIVEIS
        const g = c2d.createLinearGradient(0, h, 0, h - alt)
        g.addColorStop(0, 'rgba(139, 92, 246, 0.7)')
        g.addColorStop(1, 'rgba(34, 211, 238, 0.9)')
        cache.push(g)
      }
      return cache
    }

    // 30 fps em vez de 60: olho não nota num visualizador de áudio.
    const MIN_MS = 1000 / 30
    let ultimo = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (typeof document !== 'undefined' && document.hidden) return
      const agora = performance.now()
      if (agora - ultimo < MIN_MS) return
      ultimo = agora
      if (!w || !h) return
      const grads = gradientes()
      analyser.getByteFrequencyData(data)
      c2d.clearRect(0, 0, w, h)
      const bars = 44
      const step = Math.max(1, Math.floor(data.length / bars))
      const bw = w / bars
      for (let i = 0; i < bars; i += 1) {
        let peak = 0
        for (let j = 0; j < step; j += 1) {
          if (data[i * step + j] > peak) peak = data[i * step + j]
        }
        const hh = Math.max(3, (peak / 255) * h * 0.92)
        const x = i * bw + bw * 0.18
        const nivel = Math.max(0, Math.min(NIVEIS - 1, Math.round((hh / h) * NIVEIS) - 1))
        c2d.fillStyle = grads[nivel]
        c2d.fillRect(x, h - hh, bw * 0.64, hh)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', aoResize)
    }
  }, [])

  return <canvas ref={ref} className="eq-visualizer" aria-hidden="true" />
}