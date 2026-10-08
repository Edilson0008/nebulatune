import { useEffect, useRef } from 'react'
import * as graph from '../audio/graph'
import { getPlayState } from '../lib/play-state.js'
import { getBass, getKick } from './fx-layer.jsx'
import { VIZ_MODES as MODES, nextVizMode, useVizMode } from '../lib/viz-mode.js'

// Paleta do espectrograma: escuro -> violeta -> ciano -> quase branco.
const SC = [
  [0, 13, 10, 31],
  [0.35, 76, 29, 149],
  [0.6, 139, 92, 246],
  [0.82, 34, 211, 238],
  [1, 244, 242, 255],
]
function specColor(v) {
  let i = 1
  while (i < SC.length - 1 && v > SC[i][0]) i += 1
  const a = SC[i - 1]
  const b = SC[i]
  const k = Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0])))
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]
}

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
    const N = 28
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

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (typeof document !== 'undefined' && document.hidden) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      c2d.clearRect(0, 0, w, h)
      const t = performance.now() / 1000
      const bass = getBass()
      const kick = getKick()
      for (const p of parts) {
        p.y += p.vy * 0.016 * (1 + bass * 6 + kick * 14)
        p.x += p.vx * 0.016
        if (p.y > 1.05) {
          p.y = -0.05
          p.x = Math.random()
          p.vx = rand(-0.04, 0.04)
        }
        const px = ((p.x % 1) + 1) % 1
        const alpha = Math.min(1, 0.08 + 0.3 * Math.abs(Math.sin(t * p.tw + p.phase)) + bass * 0.35)
        const size = p.r * dpr * (1 + 0.4 * Math.sin(t * 1.3 + p.phase) + bass * 1.2 + kick * 0.8)
        c2d.beginPath()
        c2d.arc(px * w, p.y * h, Math.max(0.5, size), 0, Math.PI * 2)
        c2d.fillStyle = p.hue === 150
          ? `rgba(150,255,215,${alpha.toFixed(3)})`
          : `hsla(${p.hue}, 85%, 78%, ${alpha.toFixed(3)})`
        c2d.fill()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="np-particles" aria-hidden="true" />
}

// Visualizador com 7 modos. Toque no quadro para trocar de modo (fica salvo).
export function Visualizer() {
  const ref = useRef(null)
  const mode = useVizMode()
  const modeRef = useRef(mode)
  const labelRef = useRef(0)

  useEffect(() => {
    modeRef.current = mode
    labelRef.current = performance.now() + 1400
  }, [mode])

  useEffect(() => {
    const canvas = ref.current
    graph.getContext()
    const analyser = graph.getAnalyser()
    if (!canvas || !analyser) return undefined
    const c = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    const td = new Uint8Array(analyser.fftSize)
    const bands = new Uint8Array(64)
    const spec = { o: null, x: null, w: 0, h: 0 }
    let A1 = '#8b5cf6'
    let A2 = '#22d3ee'
    let frame = 0
    let raf = 0

    const draw = (t) => {
      raf = requestAnimationFrame(draw)
      if (typeof document !== 'undefined' && document.hidden) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      if (frame % 20 === 0) {
        const cs = getComputedStyle(document.documentElement)
        A1 = cs.getPropertyValue('--accent').trim() || A1
        A2 = cs.getPropertyValue('--accent-2').trim() || A2
      }
      frame += 1
      // Estado REAL de reprodução (arquivo/online/demo), não o da demo sintetizada.
      const playing = getPlayState()
      if (playing) {
        analyser.getByteFrequencyData(data)
        analyser.getByteTimeDomainData(td)
      } else {
        data.fill(0)
        td.fill(128)
      }
      const n = data.length
      for (let i = 0; i < 64; i += 1) {
        let m = 0
        for (let j = Math.floor((i * n) / 64); j < Math.floor(((i + 1) * n) / 64); j += 1) if (data[j] > m) m = data[j]
        bands[i] = m
      }
      const live = playing && data.some((v) => v > 0)
      const mode = modeRef.current
      const u = dpr
      c.clearRect(0, 0, w, h)
      c.lineCap = 'round'
      c.shadowColor = A1
      c.shadowBlur = 14 * u
      const gH = c.createLinearGradient(0, 0, w, 0)
      gH.addColorStop(0, A1)
      gH.addColorStop(1, A2)

      if (mode === 0) {
        // Visual original do NebulaTune.
        c.shadowBlur = 0
        const bars = 44
        const step = Math.max(1, Math.floor(n / bars))
        const bw = w / bars
        for (let i = 0; i < bars; i += 1) {
          let peak = 0
          for (let j = 0; j < step; j += 1) if (data[i * step + j] > peak) peak = data[i * step + j]
          const hh = Math.max(3, (peak / 255) * h * 0.92)
          const grad = c.createLinearGradient(0, h, 0, h - hh)
          grad.addColorStop(0, 'rgba(139, 92, 246, 0.7)')
          grad.addColorStop(1, 'rgba(34, 211, 238, 0.9)')
          c.fillStyle = grad
          c.fillRect(i * bw + bw * 0.18, h - hh, bw * 0.64, hh)
        }
      } else if (mode === 1) {
        const bars = 48
        const bw = w / bars
        const base = h * 0.72
        const gv = c.createLinearGradient(0, base, 0, 0)
        gv.addColorStop(0, A1)
        gv.addColorStop(1, A2)
        const hs = []
        for (let i = 0; i < bars; i += 1) {
          const v = live ? bands[Math.floor(i * 1.2) % 64] / 255 : (Math.sin(t / 500 + i * 0.45) * 0.5 + 0.5) * 0.18 + 0.04
          hs.push(Math.max(4 * u, v * base))
        }
        c.fillStyle = gv
        hs.forEach((bh, i) => {
          const x = i * bw + bw * 0.15
          const ww = bw * 0.7
          c.beginPath()
          if (c.roundRect) c.roundRect(x, base - bh, ww, bh, ww / 2)
          else c.rect(x, base - bh, ww, bh)
          c.fill()
        })
        c.shadowBlur = 0
        c.globalAlpha = 0.2
        hs.forEach((bh, i) => c.fillRect(i * bw + bw * 0.15, base + 3 * u, bw * 0.7, bh * 0.35))
        c.globalAlpha = 1
      } else if (mode === 2) {
        const line = (lw, off, al, st) => {
          c.globalAlpha = al
          c.strokeStyle = st
          c.lineWidth = lw
          c.beginPath()
          for (let i = 0; i < td.length; i += 1) {
            const v = live ? (td[i] - 128) / 128 : Math.sin(t / 400 + i * 0.1) * 0.07
            const x = (i / (td.length - 1)) * w
            const y = h / 2 + v * h * off
            if (i) c.lineTo(x, y)
            else c.moveTo(x, y)
          }
          c.stroke()
        }
        line(Math.max(3 * u, h / 60), 0.45, 1, gH)
        line(1.5 * u, -0.3, 0.4, A2)
        c.globalAlpha = 1
      } else if (mode === 3) {
        const cx = w / 2
        const cy = h / 2
        const m = Math.min(w, h)
        const r0 = m * 0.2
        const cnt = 72
        c.lineWidth = Math.max(2.5 * u, m / 110)
        for (let i = 0; i < cnt; i += 1) {
          const k = i < cnt / 2 ? i : cnt - 1 - i
          const v = live ? bands[k % 64] / 255 : (Math.sin(t / 500 + k * 0.3) * 0.5 + 0.5) * 0.15
          const a = (i / cnt) * Math.PI * 2 - Math.PI / 2
          const l = r0 + 4 * u + v * m * 0.3
          c.strokeStyle = i % 2 ? A1 : A2
          c.beginPath()
          c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
          c.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l)
          c.stroke()
        }
        c.shadowBlur = 0
        c.strokeStyle = gH
        c.lineWidth = 2 * u
        c.beginPath()
        c.arc(cx, cy, r0 - 6 * u, 0, Math.PI * 2)
        c.stroke()
      } else if (mode === 4) {
        const cnt = 40
        const bw = w / 2 / cnt
        for (let i = 0; i < cnt; i += 1) {
          const v = live ? bands[i] / 255 : (Math.sin(t / 500 + i * 0.4) * 0.5 + 0.5) * 0.15
          const bh = Math.max(3 * u, v * h * 0.9)
          c.fillStyle = i % 2 ? A1 : A2
          for (const sx of [-1, 1]) c.fillRect(w / 2 + sx * i * bw - bw * 0.35, h / 2 - bh / 2, bw * 0.7, bh)
        }
      } else if (mode === 5) {
        const cols = 32
        const rows = 9
        const cw = w / cols
        const rh = h / rows
        const r = Math.min(cw, rh) * 0.3
        for (let i = 0; i < cols; i += 1) {
          const v = live ? bands[Math.floor(i * 1.8) % 64] / 255 : (Math.sin(t / 500 + i * 0.5) * 0.5 + 0.5) * 0.25
          const lit = Math.round(v * rows)
          for (let j = 0; j < rows; j += 1) {
            c.globalAlpha = j < lit ? 1 : 0.12
            c.fillStyle = j > rows * 0.7 ? A2 : A1
            c.beginPath()
            c.arc(i * cw + cw / 2, h - (j + 0.5) * rh, r, 0, Math.PI * 2)
            c.fill()
          }
        }
        c.globalAlpha = 1
      } else {
        // Espectrograma: rola para a esquerda, frequência na vertical.
        c.shadowBlur = 0
        if (!spec.o || spec.w !== w || spec.h !== h) {
          spec.o = document.createElement('canvas')
          spec.o.width = w
          spec.o.height = h
          spec.x = spec.o.getContext('2d')
          spec.w = w
          spec.h = h
        }
        if (live) {
          const sw = 2
          const col = spec.x.createImageData(sw, h)
          spec.x.drawImage(spec.o, -sw, 0)
          const top = Math.floor(n * 0.8)
          for (let y = 0; y < h; y += 1) {
            const [r, g, b] = specColor(data[Math.min(top, Math.floor((1 - y / h) * top))] / 255)
            for (let k = 0; k < sw; k += 1) {
              const q = (y * sw + k) * 4
              col.data[q] = r
              col.data[q + 1] = g
              col.data[q + 2] = b
              col.data[q + 3] = 255
            }
          }
          spec.x.putImageData(col, w - sw, 0)
        }
        c.drawImage(spec.o, 0, 0)
      }
      c.shadowBlur = 0

      const left = labelRef.current - performance.now()
      if (left > 0) {
        c.globalAlpha = Math.min(1, left / 500)
        c.fillStyle = '#e7e0f2'
        c.font = `600 ${13 * u}px Outfit, system-ui, sans-serif`
        c.fillText(MODES[mode], 12 * u, 22 * u)
        c.globalAlpha = 1
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={ref}
      className="eq-visualizer"
      aria-hidden="true"
      title={`Visual: ${MODES[mode]} (toque para trocar)`}
      onClick={nextVizMode}
    />
  )
}