import { useEffect, useMemo, useRef, useState } from 'react'
import { IS_NATIVE } from '../lib/env.js'

// Estrelas de fundo (posições pseudo-aleatórias fixas)
const BG_STARS = Array.from({ length: 80 }, (_, i) => {
  const x = (i * 137.508 + 17) % 100
  const y = (i * 97.31 + 21) % 100
  const size = 1 + (i % 5) * 0.6
  return { x, y, size, delay: (i * 0.19) % 5.5, dur: 2.2 + (i % 4) * 1.4 }
})

const STARS = IS_NATIVE ? BG_STARS.slice(0, 24) : BG_STARS

// Cores do tema usadas quando as variáveis CSS ainda não existem.
const FALLBACK_1 = '#8b5cf6'
const FALLBACK_2 = '#c084fc'

// Lê --electro-1/--electro-2 do elemento (herdadas da raiz). Apontam para
// var(--accent)/var(--accent-2): quando o tema muda, o canvas acompanha.
function readElectroColors(el) {
  if (!el || typeof window === 'undefined') return [FALLBACK_1, FALLBACK_2]
  const cs = getComputedStyle(el)
  const c1 = (cs.getPropertyValue('--electro-1') || '').trim() || FALLBACK_1
  const c2 = (cs.getPropertyValue('--electro-2') || '').trim() || FALLBACK_2
  return [c1, c2]
}

// Partículas subindo com brilho na cor do tema (estilo Onda)
function SpaceParticles({ count = 46, bass = 0, beat = false, bgAnimated = true }) {
  const ref = useRef(null)
  const bassRef = useRef(bass)
  const beatRef = useRef(0)
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  useEffect(() => {
    bassRef.current = bass
  }, [bass])
  useEffect(() => {
    if (beat) beatRef.current = 1
  }, [beat])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    if (!ctx) return undefined
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const parts = Array.from({ length: count }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.9 + 0.7,
      v: Math.random() * 0.00055 + 0.00018,
      p: Math.random() * Math.PI * 2,
      c: i % 2,
    }))
    let raf = 0
    let frame = 0
    let c1 = FALLBACK_1
    let c2 = FALLBACK_2

    const resize = () => {
      cv.width = Math.max(1, Math.round(cv.clientWidth * dpr))
      cv.height = Math.max(1, Math.round(cv.clientHeight * dpr))
    }

    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = cv.clientWidth
      const h = cv.clientHeight
      ctx.clearRect(0, 0, w, h)
      if (frame % 20 === 0) {
        const [a, b] = readElectroColors(cv)
        c1 = a
        c2 = b
      }
      frame += 1

      const lvl = bassRef.current
      let kick = beatRef.current
      if (kick > 0.01) {
        kick *= 0.88
        beatRef.current = kick
      } else if (kick) {
        beatRef.current = 0
        kick = 0
      }

      for (const p of parts) {
        p.y -= p.v * (1 + lvl * 6 + kick * 14)
        if (p.y < -0.05) {
          p.y = 1.05
          p.x = Math.random()
        }
        const x = p.x * w + Math.sin(t / 1500 + p.p) * 14
        const y = p.y * h
        ctx.globalAlpha = Math.min(1, 0.25 + lvl * 0.5)
        ctx.fillStyle = p.c ? c1 : c2
        ctx.shadowColor = p.c ? c1 : c2
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(x, y, p.r * (1 + lvl * 1.8 + kick), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    if (reduce || !bgAnimated) {
      draw(0)
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      raf = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [count, bgAnimated, reduce])

  return <canvas ref={ref} className="bg-canvas electro-particles" aria-hidden="true" />
}

function Nebulas({ bass = 0, cosmosAnimated = true }) {
  const style1 = {
    '--nebula-opacity': 0.26 + bass * 0.3,
    animationPlayState: cosmosAnimated ? 'running' : 'paused',
  }
  const style2 = {
    '--nebula-opacity': 0.22 + bass * 0.26,
    animationPlayState: cosmosAnimated ? 'running' : 'paused',
  }
  const style3 = {
    '--nebula-opacity': 0.14 + bass * 0.18,
    animationPlayState: cosmosAnimated ? 'running' : 'paused',
  }

  return (
    <>
      <div className="electro-nebula electro-nebula-1" style={style1} />
      <div className="electro-nebula electro-nebula-2" style={style2} />
      <div className="electro-nebula electro-nebula-3" style={style3} />
    </>
  )
}

function BeatFlash({ active }) {
  return <div className={`electro-flash ${active ? 'active' : ''}`} aria-hidden="true" />
}

function BeatRing({ active }) {
  return <div className={`electro-ring ${active ? 'active' : ''}`} aria-hidden="true" />
}

export function ElectrogramBackground({
  bgAnimated = true,
  cosmosAnimated = true,
  bass = 0,
  beat = false,
}) {
  const [flashActive, setFlashActive] = useState(false)
  const [ringActive, setRingActive] = useState(false)
  const rootRef = useRef(null)
  const flashRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    if (beat) {
      setFlashActive(true)
      setRingActive(true)
      if (flashRef.current) clearTimeout(flashRef.current)
      if (ringRef.current) clearTimeout(ringRef.current)
      flashRef.current = setTimeout(() => setFlashActive(false), 150)
      ringRef.current = setTimeout(() => setRingActive(false), 900)
    }
  }, [beat])

  const starEls = useMemo(
    () =>
      STARS.map((s, i) => (
        <div
          key={i}
          className="electro-star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
            animationPlayState: cosmosAnimated ? 'running' : 'paused',
          }}
        />
      )),
    [cosmosAnimated],
  )

  return (
    <div
      className="electro-bg-fx"
      ref={rootRef}
      style={{
        '--electro-1': 'var(--accent, #8b5cf6)',
        '--electro-2': 'var(--accent-2, #c084fc)',
      }}
    >
      <div className="electro-glow" />
      <div
        className="electro-orb electro-orb-1"
        style={{
          opacity: 0.3 + Math.min(1, bass) * 0.5,
          animationPlayState: bgAnimated ? 'running' : 'paused',
        }}
      />
      <div
        className="electro-orb electro-orb-2"
        style={{
          opacity: 0.3 + Math.min(1, bass) * 0.5,
          animationPlayState: bgAnimated ? 'running' : 'paused',
        }}
      />
      <Nebulas bass={bass} cosmosAnimated={cosmosAnimated} />
      <SpaceParticles
        count={IS_NATIVE ? 20 : 46}
        bass={bass}
        beat={beat}
        bgAnimated={bgAnimated}
      />
      <div className="electro-stars">{starEls}</div>
      <BeatFlash active={flashActive} />
      <BeatRing active={ringActive} />
    </div>
  )
}