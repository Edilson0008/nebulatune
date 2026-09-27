import { useCallback, useEffect, useRef, useState } from 'react'
import { playFanfare } from '../lib/fanfare.js'
import { random } from '../lib/pet.js'

export function PetFriend({
  size = 46,
  playing = false,
  eqEnabled = false,
  eqPreset = 'flat',
  favPing = 0,
  shuffle = false,
  trackId = null,
  sleepMode = null,
  sleepRemaining = null,
  soundOn = true,
  cheer = null,
  onPetAction = null,
  idleSinceRef = null,
  mood = 'neutral',
  greetOnMount = null,
  greetOnMountMs = 4800,
  userName = '',
}) {
  const [anim, setAnim] = useState(null)
  const [burst, setBurst] = useState('')
  const [drag, setDrag] = useState(null)
  const [speech, setSpeech] = useState(null)
const [bubblePlace, setBubblePlace] = useState({ dir: 'below', dx: 0 })
  const lastAnimRef = useRef([])
  const lastCuriousRef = useRef('')
  const rootRef = useRef(null)
  const burstT = useRef(null)
  const sayT = useRef(null)
  const phraseT = useRef(null)
  const speechSeq = useRef(0)
  const touchRef = useRef(null)
  const tapRef = useRef(0)
  const tapCountRef = useRef(0)
  const tapWindowT = useRef(null)
  const lastHiddenRef = useRef(0)
  const meowRef = useRef(null)
  const lastTrackRef = useRef(null)
  const favPrevRef = useRef(0)
  const cheerSeenRef = useRef(null)
  const onActionRef = useRef(onPetAction)
  const boredTellRef = useRef(0)
  const moodSeenRef = useRef('neutral')
  onActionRef.current = onPetAction

  const greetedRef = useRef(null)
  useEffect(() => {
    if (greetOnMount && greetedRef.current !== greetOnMount) {
      greetedRef.current = greetOnMount
      say(greetOnMount, greetOnMountMs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetOnMount, greetOnMountMs])

  const heavy =
    eqEnabled && ['bass', 'hiphop', 'funk', 'eletro', 'dance', 'rock', 'loudness'].includes(eqPreset)
  const hour = new Date().getHours()
  const drowsy =
    sleepMode != null && (sleepMode === 'end' || (sleepRemaining != null && sleepRemaining <= 30))

  const say = useCallback((text, ms = 2600) => {
    speechSeq.current += 1
    setSpeech({ text, id: speechSeq.current })
    clearTimeout(sayT.current)
    if (ms) sayT.current = setTimeout(() => setSpeech(null), ms)
  }, [])

  // Tira uma frase de um conjunto já pronto para chamar o usuário pelo nome.
  // Frases com {n} só são usadas quando o usuário salvou um nome.
  const pickNamePool = useCallback(
    (pool) => {
      const nm = (userName || '').trim()
      const usable = nm ? pool : pool.filter((t) => !t.includes('{n}'))
      const src = usable.length ? usable : pool
      let t = src[Math.floor(Math.random() * src.length)]
      if (nm && t.includes('{n}')) t = t.split('{n}').join(nm.split(/\s+/)[0])
      return t
    },
    [userName],
  )

  const layoutBubble = useCallback(() => {
    const el = rootRef.current
    if (!el || !el.querySelector('.pet-bubble')) return
    const pr = el.getBoundingClientRect()
    const br = el.querySelector('.pet-bubble').getBoundingClientRect()
    const vw = window.innerWidth || document.documentElement.clientWidth || 400
    const vh = window.innerHeight || document.documentElement.clientHeight || 800
    const m = 8
    const need = br.height + 6

    let topReserve = m
    const tb = document.querySelector('.topbar')
    if (tb && tb.getBoundingClientRect().bottom > 0) topReserve = tb.getBoundingClientRect().bottom
    let bottomReserve = m
    const pl = document.querySelector('.player')
    if (pl) {
      const pb = pl.getBoundingClientRect()
      if (pb.top > 0 && pb.top < vh) bottomReserve = vh - pb.top
    }

    const roomBelow = vh - bottomReserve - pr.bottom - need
    const roomAbove = pr.top - topReserve - need
    const dir = roomAbove >= 0 ? 'above' : roomBelow >= 0 ? 'below' : roomAbove > roomBelow ? 'above' : 'below'

    const half = br.width / 2
    let cx = pr.left + pr.width / 2
    const minCx = m + half
    const maxCx = vw - m - half
    cx = maxCx < minCx ? vw / 2 : Math.max(minCx, Math.min(maxCx, cx))
    const dx = Math.round(cx - (pr.left + pr.width / 2))
    setBubblePlace((p) => (p.dir === dir && p.dx === dx ? p : { dir, dx }))
  }, [])

  useEffect(() => {
    if (!speech) return undefined
    const onResize = () => layoutBubble()
    window.addEventListener('resize', onResize)
    const id = requestAnimationFrame(layoutBubble)
    const t1 = setTimeout(layoutBubble, 320)
    const t2 = setTimeout(layoutBubble, 750)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(id)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [speech, layoutBubble])

  const triggerBurst = useCallback(
    (b, ms = 1300, phrasePool = null) => {
      clearTimeout(burstT.current)
      setBurst(b)
      if (phrasePool) {
        const P = {
          heart: ['adoro!', '{n}, amei isso!', 'coraçãozinho pra ela!', 'essa entra na lista!', 'que fofo!'],
          scared: ['ih!', 'que susto!', '{n}! que susto!'],
          angry: ['grr...', 'não gostei!', 'fica quieto!'],
          roulette: ['sorte!', 'rumo ao aleatório!', '{n}, a sorte!'],
          cuddle: ['{n}! hehe...', 'que bom!', 'mais!', 'adoro você!'],
          return: ['oi de novo!', 'senti tua falta!', '{n}! senti tua falta!', 'cadê você?'],
        }
        say(pickNamePool(P[phrasePool]), Math.min(3000, ms + 1200))
      }
      if (ms) burstT.current = setTimeout(() => setBurst(''), ms)
    },
    [say, pickNamePool],
  )

  const playMeow = useCallback(() => {
    if (!soundOn) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = meowRef.current || new AC()
      if (!meowRef.current) meowRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      onActionRef.current?.('meow')
      const t0 = ctx.currentTime
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(620, t0)
      osc.frequency.exponentialRampToValueAtTime(980, t0 + 0.28)
      osc.frequency.exponentialRampToValueAtTime(640, t0 + 0.55)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
      osc.connect(g).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.62)
    } catch {
      /* áudio indisponível */
    }
  }, [soundOn])

  useEffect(() => {
    if (cheer && cheer.id !== cheerSeenRef.current) {
      cheerSeenRef.current = cheer.id
      triggerBurst('heart', 1700, 'heart')
      say(cheer.text, 3200)
    }
  }, [cheer, say, triggerBurst])

  useEffect(() => {
    if (trackId !== lastTrackRef.current) {
      const changed = lastTrackRef.current != null
      lastTrackRef.current = trackId
      if (changed && shuffle && playing) triggerBurst('roulette', 1500, 'roulette')
    }
  }, [trackId, shuffle, playing, triggerBurst])

  useEffect(() => {
    if (favPing && favPing !== favPrevRef.current) {
      favPrevRef.current = favPing
      onActionRef.current?.('heart')
      triggerBurst('heart', 1800, 'heart')
      playMeow()
    }
  }, [favPing, triggerBurst, playMeow])

  useEffect(() => {
    if (mood === moodSeenRef.current) return
    moodSeenRef.current = mood
    if (!playing || mood === 'neutral') return
    const phrases = {
      triste: ['que triste...', 'essa música é melancólica...', 'sinto muito...', 'hmm...'],
      calmo: ['que calmaria...', 'relaxando...', 'suave...'],
      alegre: ['que alegria!', '{n}, que alegria!', 'essa música é linda!', 'tô feliz!'],
      dancante: ['no ritmo!', '{n}, no ritmo!', 'bom de dançar!', 'que muda!'],
      hype: ['agito total!', 'isso!', '{n}! isso!', 'uauuu!', 'energia!'],
    }
    const pool = phrases[mood] || ['que música!']
    say(pickNamePool(pool), 2600)
  }, [mood, playing, say, pickNamePool])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const away = Date.now() - lastHiddenRef.current
        if (lastHiddenRef.current && away > 40000) {
          onActionRef.current?.('heart')
          triggerBurst('heart', 1800, 'return')
          playMeow()
        }
      } else {
        lastHiddenRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('pageshow', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('pageshow', onVis)
    }
  }, [triggerBurst, playMeow])

  useEffect(() => {
    let t
    const loop = () => {
      t = setTimeout(() => {
        const idleFor = idleSinceRef ? Date.now() - (idleSinceRef.current || Date.now()) : 0
        const bored = idleFor > 90000
        if (bored && Date.now() - boredTellRef.current > 60000) {
          boredTellRef.current = Date.now()
          const boredPhrases = [
            'que tédio...',
            'vem brincar...',
            'alguém aí?',
            'tão quieto...',
            '{n}, vem brincar comigo!',
            '{n}? tô esperando você...',
          ]
          say(pickNamePool(boredPhrases), 2400)
        }
        const playOpts = ['sing', 'dance', 'hype', 'sing', 'dance', 'hop', 'sing', 'hype', 'jump', 'boing', 'spin']
        if (heavy) playOpts.push('headbang', 'headbang')
        if (mood === 'hype') playOpts.splice(0, playOpts.length, 'hype', 'headbang', 'hype', 'sing', 'dance', 'hype', 'spin', 'jump')
        else if (mood === 'dancante') playOpts.push('dance', 'dance', 'twirl', 'sing', 'spin')
        else if (mood === 'alegre') playOpts.push('sing', 'hop', 'twirl', 'dance', 'jump')
        else if (mood === 'calmo') playOpts.push('glint', 'look', 'sing', 'sing')
        else if (mood === 'triste') playOpts.splice(0, playOpts.length, 'sing', 'look', 'walk', 'glint', 'sing')
        const idleOpts = ['walk', 'twirl', 'glint', 'hop', 'look', 'wiggle', 'stretch', 'sleep', 'sleep', 'glint', 'curious', 'jump', 'boing', 'spin']
        if (bored) idleOpts.push('curious', 'curious', 'curious', 'walk', 'walk')
        if (sleepMode) idleOpts.push('sleep', 'yawn')
        if (hour >= 22 || hour < 6) idleOpts.push('sleep', 'sleep', 'yawn')
        if (hour >= 6 && hour < 12) idleOpts.push('stretch', 'glint')
        if (hour >= 12 && hour < 19) idleOpts.push('twirl', 'glint', 'glint')
        if (hour >= 19 && hour < 23) idleOpts.push('yawn', 'sleep')
        const moodPools = {
          triste: ['que triste...', 'essa música é melancólica...', 'sinto muito...', 'hmm...'],
          calmo: ['que calmaria...', 'relaxando...', 'suave...', '{n}, relaxa aí...'],
          alegre: ['que alegria!', '{n}, que alegria!', 'essa música é linda!', 'tô feliz!'],
          dancante: ['no ritmo!', '{n}, no ritmo!', 'bom de dançar!', 'que muda!'],
          hype: ['agito total!', 'isso!', '{n}! isso!', 'uauuu!', 'energia!'],
        }
        const opts = playing ? playOpts : idleOpts
        const avoid = lastAnimRef.current
        const options = opts.filter((x) => !avoid.includes(x))
        const pick = (options.length ? options : opts)[Math.floor(Math.random() * (options.length ? options : opts).length)]
        lastAnimRef.current = avoid.concat(pick).slice(-2)
        const el = rootRef.current
        if (pick === 'walk' && el) {
          const left = el.getBoundingClientRect().left
          el.style.setProperty('--walk-x', `${Math.max(8, Math.round(left - 16))}px`)
        }
        if (pick === 'curious' && el) {
          const selectors = [
            '.lib-head-right .btn-primary',
            '.quick-tile',
            '.app-version-chip',
            '.search-wrap .search',
            '.mobile-tabs',
            '.player .player-controls',
          ]
          const valid = selectors.map((s) => [s, document.querySelector(s)]).filter(([, n]) => n)
          const avail = valid.filter(([s]) => s !== lastCuriousRef.current)
          const list = avail.length ? avail : valid
          if (list.length) {
            const [sel, node] = list[Math.floor(Math.random() * list.length)]
            lastCuriousRef.current = sel
            const tr = node.getBoundingClientRect()
            const pr = el.getBoundingClientRect()
            let dx = tr.left - pr.left - 14
            let dy = tr.top + tr.height / 2 - (pr.top + pr.height / 2)
            dy = Math.max(-150, Math.min(150, dy))
            el.style.setProperty('--qx', `${Math.round(dx)}px`)
            el.style.setProperty('--qy', `${Math.round(dy)}px`)
          }
        }
        setAnim(pick)
        if (pick === 'sleep' || pick === 'yawn') onActionRef.current?.('sleep')
        const dur =
          { sing: 4600, dance: 3200, hype: 3200, sleep: 3000, walk: 5600, twirl: 1500, glint: 2200, curious: 4600, yawn: 2600, headbang: 2400, jump: 2400, spin: 3000, boing: 1600 }[pick] ??
          1700
        if (phraseT.current) clearTimeout(phraseT.current)
        phraseT.current = setTimeout(
          () => {
            if (Math.random() < 0.5) {
              const pools = {
                sleep: ['zZz...', 'tô com sono...', 'hrmmm...'],
                yawn: ['haaah...', 'soninho chegando...'],
                headbang: ['que grave!', 'queeee!', 'pesado!'],
                curious: ['o que é isso?', 'qué-é isso?'],
                spin: ['uhuuul!', 'que giro!', '{n}, olha o giro!'],
                jump: ['woba!', 'pula pula!', 'voei!'],
                boing: ['boing!', 'quicando!'],
              }
              const pool = pools[pick]
                ? pools[pick]
                : playing
                  ? moodPools[mood] ||
                    ['que música boa!', '{n}, essa é top!', 'meu som!', 'curtindo!', 'no beat!', 'uuuu!']
                  : ['oi!', 'e aí?!', 'tô de boa...', 'que legal!', 'ué?', 'nossa, quanta música!', 'óia eu!', 'hehe', 'eu sou a Nebula! 🐱', 'o bixo sou eu, a Nebula 🐾']
              say(pickNamePool(pool), 2600)
            }
          },
          dur * 0.4 + random(300, 800),
        )
        t = setTimeout(() => {
          setAnim(null)
          loop()
        }, dur + random(900, 2400))
      }, random(1400, 4200))
    }
    loop()
    return () => {
      clearTimeout(t)
      if (phraseT.current) clearTimeout(phraseT.current)
      if (sayT.current) clearTimeout(sayT.current)
      if (tapWindowT.current) clearTimeout(tapWindowT.current)
    }
  }, [playing, heavy, sleepMode, hour, say, mood, pickNamePool, idleSinceRef])

  const onPointerDown = (e) => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    touchRef.current = { t0: Date.now(), x0: e.clientX, y0: e.clientY, homeLeft: r.left, homeTop: r.top, active: false }
    el.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const t = touchRef.current
    if (!t) return
    if (!t.active && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 9) {
      t.active = true
      setAnim(null)
    }
    if (t.active) {
      const el = rootRef.current
      const x = Math.round(e.clientX - t.homeLeft)
      const y = Math.round(e.clientY - t.homeTop)
      if (el) {
        el.style.setProperty('--dx', `${x}px`)
        el.style.setProperty('--dy', `${y}px`)
      }
      setDrag({ x, y })
    }
  }

  const onPointerUp = (e) => {
    const t = touchRef.current
    touchRef.current = null
    if (!t) return
    const el = rootRef.current
    try {
      el?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    if (t.active) {
      setDrag(null)
      setBurst('slide')
      burstT.current = setTimeout(() => setBurst(''), 900)
      return
    }
    const dt = Date.now() - t.t0
    if (dt < 300) {
      const now = Date.now()
      if (tapWindowT.current) {
        clearTimeout(tapWindowT.current)
        tapWindowT.current = null
      }
      if (now - tapRef.current < 340) {
        tapCountRef.current += 1
      } else {
        tapCountRef.current = 1
      }
      tapRef.current = now
      if (tapCountRef.current >= 3) {
        tapRef.current = 0
        tapCountRef.current = 0
        onActionRef.current?.('scared')
        triggerBurst('scared', 1500, 'scared')
        playMeow()
        return
      }
      tapWindowT.current = setTimeout(
        () => {
          tapWindowT.current = null
          const n = tapCountRef.current
          tapRef.current = 0
          tapCountRef.current = 0
          if (n >= 2) {
            onActionRef.current?.('touch')
            triggerBurst('roulette', 1500, 'roulette')
            playMeow()
            return
          }
          onActionRef.current?.('touch')
          const moods = ['cuddle', 'heart', 'cuddle', 'cuddle', 'meow']
          const pick = moods[Math.floor(Math.random() * moods.length)]
          if (pick === 'meow') {
            playMeow()
            triggerBurst('heart', 1200, 'heart')
          } else {
            if (pick === 'heart') onActionRef.current?.('heart')
            triggerBurst(pick, pick === 'cuddle' ? 1700 : 1400, pick)
            playMeow()
          }
        },
        320,
      )
      return
    }
    if (dt >= 500) {
      onActionRef.current?.('touch')
      triggerBurst('angry', 1500, 'angry')
    }
  }

  const classes = [
    'pet',
    `pet-${anim || ''}`,
    `pet-${burst || ''}`,
    burst ? '' : `pet-mood-${mood}`,
    drag ? 'pet-held' : '',
    drowsy ? 'pet-drowsy' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const style = drag
    ? { width: size, height: size, transform: `translate(${drag.x}px, ${drag.y}px)` }
    : { width: size, height: size }

  return (
    <span
      ref={rootRef}
      className={classes}
      style={style}
      aria-hidden="true"
      role="img"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <g className="pet-body">
          <path
            className="pet-tail"
            d="M42 48 Q62 52 58 40 Q55 28 60 26"
            fill="none"
            stroke="#f5a9c8"
            strokeWidth="8"
            strokeLinecap="round"
            style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}
          />
          <path
            className="pet-tail"
            d="M42 48 Q62 52 58 40 Q55 28 60 26"
            fill="none"
            stroke="#ffc2d9"
            strokeWidth="5.4"
            strokeLinecap="round"
            style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}
          />
          <circle cx="32" cy="38" r="21" fill="#ffe3ef" stroke="#f5a9c8" strokeWidth="2" />
          <path
            d="M16 21 L17 7 L26 20 Z"
            fill="#ffe3ef"
            stroke="#f5a9c8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M48 21 L47 7 L38 20 Z"
            fill="#ffe3ef"
            stroke="#f5a9c8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M18.2 19.2 L17.9 10.8 L24.6 16.8 Z" fill="#ff9fc4" />
          <path d="M45.8 19.2 L46.1 10.8 L39.4 16.8 Z" fill="#ff9fc4" />
          <path
            d="M30.5 19 q1 1.3 1.5 0 q0.5 1.3 1.5 0"
            fill="none"
            stroke="#f5a9c8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g className="pet-eye" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx="25.5" cy="35" r="3.4" fill="#7a3b52" />
            <circle cx="38.5" cy="35" r="3.4" fill="#7a3b52" />
            <circle cx="26.6" cy="33.8" r="1.2" fill="#fff" opacity="0.95" />
            <circle cx="39.6" cy="33.8" r="1.2" fill="#fff" opacity="0.95" />
          </g>
          <g className="pet-eyes-happy" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <path d="M23.2 33.5 q2.4 -2.4 4.8 0" fill="none" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
            <path d="M36 33.5 q2.4 -2.4 4.8 0" fill="none" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="pet-eyes-angry" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <path d="M22.4 32.4 l6 3.4 M22.4 35.8 l6 -3.4" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
            <path d="M35.6 32.4 l6 3.4 M35.6 35.8 l6 -3.4" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
            <path d="M28 46 q4 -3.2 8 0" fill="none" stroke="#7a3b52" strokeWidth="1.8" strokeLinecap="round" />
          </g>
          <g className="pet-eyes-scared">
            <circle cx="25.5" cy="35" r="4.4" fill="#fff" stroke="#7a3b52" strokeWidth="1.5" />
            <circle cx="38.5" cy="35" r="4.4" fill="#fff" stroke="#7a3b52" strokeWidth="1.5" />
            <circle cx="25.5" cy="35.6" r="1.6" fill="#7a3b52" />
            <circle cx="38.5" cy="35.6" r="1.6" fill="#7a3b52" />
          </g>
          <g className="pet-eyes-sad">
            <path d="M21.8 33.4 q3.7 -3 7.4 0" fill="none" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
            <path d="M34.8 33.4 q3.7 -3 7.4 0" fill="none" stroke="#7a3b52" strokeWidth="2" strokeLinecap="round" />
            <circle cx="25.5" cy="35.8" r="2.4" fill="#7a3b52" />
            <circle cx="38.5" cy="35.8" r="2.4" fill="#7a3b52" />
          </g>
          <ellipse cx="20" cy="43" rx="4.2" ry="2.6" fill="#ff9fc4" opacity="0.5" />
          <ellipse cx="44" cy="43" rx="4.2" ry="2.6" fill="#ff9fc4" opacity="0.5" />
          <path d="M10 34.5 L16.5 36 M9 39 L16.5 40" stroke="#f5a9c8" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
          <path d="M54 34.5 L47.5 36 M55 39 L47.5 40" stroke="#f5a9c8" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
          <path
            className="pet-mouth-w"
            d="M28 43 q2.1 1.9 4 0 q1.9 1.9 4 0"
            fill="none"
            stroke="#7a3b52"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            className="pet-mouth-open"
            d="M29.5 43.2 a2.5 2.2 0 0 0 5 0 a2.5 2.2 0 0 0 -5 0"
            fill="#7a3b52"
          />
          <path
            className="pet-mouth-sad"
            d="M29.5 45 q2.2 -2.2 5 0"
            fill="none"
            stroke="#7a3b52"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <ellipse cx="26.5" cy="56" rx="4" ry="2.7" fill="#ffe3ef" stroke="#f5a9c8" strokeWidth="2" />
          <ellipse cx="37.5" cy="56" rx="4" ry="2.7" fill="#ffe3ef" stroke="#f5a9c8" strokeWidth="2" />
        </g>
      </svg>
      <span className="pet-note pet-note-1">♪</span>
      <span className="pet-note pet-note-2">♫</span>
      <span className="pet-note pet-note-3">♪</span>
      <span className="pet-star pet-star-1">✦</span>
      <span className="pet-star pet-star-2">✦</span>
      <span className="pet-hrt pet-hrt-1">♥</span>
      <span className="pet-hrt pet-hrt-2">♥</span>
      <span className="pet-hrt pet-hrt-3">♥</span>
      <span className="pet-bang">!</span>
      <span className="pet-sweat pet-sweat-1" />
      <span className="pet-sweat pet-sweat-2" />
      <span className="pet-steam pet-steam-1" />
      <span className="pet-steam pet-steam-2" />
      <span className="pet-zzz pet-zzz-1">z</span>
      <span className="pet-zzz pet-zzz-2">Z</span>
      <span className="pet-zzz pet-zzz-3">z</span>
      <span className="pet-tear" />
      <span className="pet-ground" />
      <span className="pet-thought">?</span>
      <span className="pet-trail pet-trail-1" />
      <span className="pet-trail pet-trail-2" />
      <span className="pet-trail pet-trail-3" />
      {speech && (
        <span
          key={speech.id}
          className={`pet-bubble${bubblePlace.dir === 'above' ? '' : ' pet-bubble-below'}`}
          style={{ '--bdx': `${bubblePlace.dx}px`, transform: `translateX(calc(-50% + ${bubblePlace.dx}px))` }}
        >
          {speech.text}
        </span>
      )}
    </span>
  )
}

export function PetHabitatCard({ greeting, greetMs = 4800, stats, onShowProfile = null, userName = '', ...pet }) {
  const fmtNum = (n) => {
    const v = n || 0
    if (v >= 100000) return `${(v / 1000).toFixed(0)}k`
    if (v >= 10000) return `${(v / 1000).toFixed(1).replace('.0', '')}k`
    return String(v)
  }

  const MOOD_TAGS = {
    neutral: '😺 Calmo',
    sing: '🎵 Cantando',
    hype: '🤩 Empolgado',
    dancante: '💃 Dançando',
    alegre: '😻 Alegre',
    calmo: '😌 Tranquilo',
    triste: '😿 Triste',
  }
  const moodTag = MOOD_TAGS[pet.mood] || '😺 Calmo'

  const bar = [
    { emoji: '🔔', label: 'Toques', value: stats.touches || 0 },
    { emoji: '🪙', label: 'Moedas', value: stats.coins || 0 },
    { emoji: '👻', label: 'Sustos', value: stats.scares || 0 },
  ]

  return (
    <div className="pet-habitat">
      <div className="pet-habitat-glow" />
      <div className="pet-habitat-head">
        <span className="pet-habitat-title">✦ PET HABITAT</span>
        <div className="pet-habitat-pills">
          <span className="pet-pill">
            <span className="pill-glyph">⸗</span>
            {fmtNum(stats.touches || 0)} Toques
          </span>
          <button className="pet-pill pet-pill-mood" onClick={onShowProfile} title="Abrir o perfil do gatinho">
            {moodTag}
          </button>
        </div>
      </div>
      <div className="pet-habitat-stage">
        <span className="pet-habitat-orb pet-habitat-orb-1" />
        <span className="pet-habitat-orb pet-habitat-orb-2" />
        <PetFriend {...pet} size={148} greetOnMount={greeting} greetOnMountMs={greetMs} userName={userName} />
      </div>
      <div className="pet-stats-bar">
        {bar.map((c) => (
          <span className="pet-stat-pill" key={c.label} title={`${c.label}: ${c.value}`}>
            <span className="pet-stat-emoji">{c.emoji}</span>
            <span className="pet-stat-label">{c.label}</span>
            <b>{fmtNum(c.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export function AchToast({ item, soundOn, onDone }) {
  useEffect(() => {
    if (!item) return undefined
    if (soundOn) playFanfare()
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [item, soundOn, onDone])
  if (!item) return null
  return (
    <button
      className="ach-toast"
      style={{ '--achc': item.color }}
      onClick={onDone}
      aria-label={`Conquista desbloqueada: ${item.name}`}
    >
      <span className="ach-toast-icon">{item.icon}</span>
      <span className="ach-toast-main">
        <span className="ach-toast-title">Conquista desbloqueada</span>
        <span className="ach-toast-name">{item.name}</span>
      </span>
    </button>
  )
}
