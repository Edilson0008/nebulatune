import { useEffect, useRef } from 'react'
import { IS_NATIVE } from '../lib/env.js'

const BG_STARS = Array.from({ length: 80 }, (_, i) => {
  const x = (i * 137.508 + 17) % 100
  const y = (i * 97.31 + 21) % 100
  const size = 1 + (i % 5) * 0.6
  return { x, y, size, delay: (i * 0.19) % 5.5, dur: 2.2 + (i % 4) * 1.4 }
})

export function SpaceParticles({ count = 16 }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    if (!ctx) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    // dpr 1 em vez de 2: sao pontinhos suaves de poucos pixels. A resolucao
    // dobrada dobrava os pixels apagados por quadro (em tela 1080p sao ~4,6
    // milhoes por quadro, 60x por segundo) sem diferenca visivel.
    const dpr = 1
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
    // O tamanho e lido so quando pode mudar. Antes `cv.clientWidth` era lido a
    // cada quadro, e ler o tamanho de um elemento obriga o navegador a refazer
    // o layout inteiro 60 vezes por segundo.
    let w = 1
    let h = 1

    const resize = () => {
      w = Math.max(1, cv.clientWidth)
      h = Math.max(1, cv.clientHeight)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }

    // 30 quadros por segundo: sao pontos macios e lentos, a diferenca nao se ve,
    // e o trabalho cai pela metade.
    let ultimo = -1e9
    const draw = (t) => {
      const agora = typeof t === 'number' ? t : performance.now()
      if (running && !reduce && agora - ultimo >= 1000 / 30) {
        ultimo = agora
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
      if (running && !reduce) raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    if (reduce) {
      draw(0)
    } else {
      raf = requestAnimationFrame(draw)
    }
    const onVis = () => {
      running = !document.hidden
      if (running && !reduce && !raf) raf = requestAnimationFrame(draw)
      else if (!running && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [count])

  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />
}

export function BackgroundFX({ bgAnimated, cosmosAnimated }) {
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
}
