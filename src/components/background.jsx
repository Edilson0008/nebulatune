import { memo, useEffect, useRef } from 'react'
import { IS_NATIVE } from '../lib/env.js'

const BG_STARS = Array.from({ length: 80 }, (_, i) => {
  const x = (i * 137.508 + 17) % 100
  const y = (i * 97.31 + 21) % 100
  const size = 1 + (i % 5) * 0.6
  return { x, y, size, delay: (i * 0.19) % 5.5, dur: 2.2 + (i % 4) * 1.4 }
})

export const SpaceParticles = memo(function SpaceParticles({ count = 16 }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    if (!ctx) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: 0.5 + Math.random() * 1.1,
      vy: -(0.03 + Math.random() * 0.12),
      ph: Math.random() * Math.PI * 2,
      sp: 0.4 + Math.random() * 0.9,
    }))
    let raf = 0
    let running = true
    let w = 0
    let h = 0

    const medir = () => {
      w = cv.clientWidth
      h = cv.clientHeight
      cv.width = Math.max(1, Math.round(w * dpr))
      cv.height = Math.max(1, Math.round(h * dpr))
    }
    medir()
    const aoResize = () => medir()
    window.addEventListener('resize', aoResize)

    // 30 fps: partículas de fundo não precisam de 60 fps.
    const MIN_MS = 1000 / 30
    let ultimo = 0

    // Desenho e agendamento sao separados de proposito: `pintar` so desenha,
    // `loop` e o UNICO lugar que pede o proximo quadro. Agendar dentro do
    // desenho (no comeco e no fim) fazia cada callback gerar dois callbacks,
    // o que dobrava a fila a cada quadro e deixava callbacks orfaos apos o
    // unmount, porque o id era sobrescrito antes de ser cancelado.
    const pintar = (t) => {
      const agora = performance.now()
      if (agora - ultimo < MIN_MS) return
      ultimo = agora
      if (!w || !h) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.y += p.vy
        if (p.y < -2) {
          p.y = 102
          p.x = Math.random() * 100
        }
        ctx.globalAlpha = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.001 * p.sp + p.ph))
        ctx.fillStyle = '#bcd8f2'
        ctx.beginPath()
        ctx.arc((p.x / 100) * w, (p.y / 100) * h, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const loop = (t) => {
      raf = 0
      if (!running || reduce) return
      pintar(t)
      raf = requestAnimationFrame(loop)
    }

    if (reduce) {
      // Sem animacao: um quadro so, e nenhum rAF pendurado.
      ultimo = 0
      pintar(0)
    } else {
      ultimo = 0
      raf = requestAnimationFrame(loop)
    }
    const onVis = () => {
      running = !document.hidden
      if (!running) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf && !reduce) {
        ultimo = 0
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', aoResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [count])

  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />
})

export const BackgroundFX = memo(function BackgroundFX({ bgAnimated, cosmosAnimated }) {
  if (!bgAnimated) return null
  const stars = IS_NATIVE ? BG_STARS.slice(0, 24) : BG_STARS
  return (
    <div className="bg-fx">
      {cosmosAnimated && (
        <>
          <div className="bg-nebula bg-nebula-1" />
          <div className="bg-nebula bg-nebula-2" />
          <div className="bg-nebula bg-nebula-3" />
          <div className="bg-galaxy" />
        </>
      )}
      <SpaceParticles count={IS_NATIVE ? 8 : 16} />
      <div className="bg-stars">
        {stars.map((s, i) => (
          <div
            key={i}
            className="bg-star"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
})