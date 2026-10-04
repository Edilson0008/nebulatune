import { useCallback, useEffect, useRef, useState } from 'react'
import { readLocal, writeLocal } from '../localstore'
import { setSfxEnabled, sfxBounce, sfxCoin, sfxHeart, sfxNota, sfxPop, sfxWeak } from '../lib/sfx.js'
import { novoEspinhoId } from '../lib/espinho-id.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

// Recompensa por jogo (definida no MINIGAMES, entre 10 e 50 moedas na vitória).
// A derrota paga uma parte, proporcional ao quanto você avançou.
const PREMIOS = { min: 10, max: 50 }
const premioJogo = (v) => Math.max(PREMIOS.min, Math.min(PREMIOS.max, Number(v) || PREMIOS.min))
// Medalha por jogo com base no recorde: bronze 33%, prata 66%, ouro 100%
const diaKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ontemKey = () => diaKey(new Date(Date.now() - 86400000))
// Bônus do 1o acesso do dia: cresce com a sequência (+2/dia, topo 20)
const bonusDiario = (streak) => Math.min(5 + Math.max(0, streak - 1) * 2, 20)

const medalhaDe = (score, max) => {
  if (!score || !max) return ''
  const p = score / max
  if (p >= 1) return '🥇'
  if (p >= 0.66) return '🥈'
  if (p >= 0.33) return '🥉'
  return ''
}

const rewardFor = (score, def, won) => {
  const cheio = premioJogo(def.recompensa)
  if (won) return cheio
  const prog = clamp01(score / Math.max(1, def.max))
  return Math.max(1, Math.floor(cheio * 0.3 * prog))
}

/* ===================== Feedback visual (anel + emoji) ===================== */
// x/y sao fracao do card (0..1), entao o efeito cai sempre no lugar certo
function useFx() {
  const [fx, setFx] = useState([])
  const idRef = useRef(0)
  const timers = useRef([])
  const pop = useCallback((x, y, emoji) => {
    const id = ++idRef.current
    setFx((l) => [...l.slice(-14), { id, x: clamp01(x), y: clamp01(y), emoji }])
    timers.current.push(setTimeout(() => setFx((l) => l.filter((f) => f.id !== id)), 850))
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return { fx, pop }
}

function Fx({ fx }) {
  return (
    <div className="mg-fx" aria-hidden="true">
      {fx.map((f) => (
        <span
          key={f.id}
          className="mg-fx-item"
          style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}
        >
          <i className="mg-fx-ring" />
          {f.emoji ? <b>{f.emoji}</b> : null}
        </span>
      ))}
    </div>
  )
}

/* ===================== Cronômetro ===================== */
// Cronometro de rodada: `resetKey` mudando (nova rodada) devolve o tempo cheio.
// Com `ativo=false` ele congela na hora em que está (banner de rodada completa).
function useGameTimer(seconds, onTimeUp, resetKey = 0, ativo = true) {
  const [st, setSt] = useState({ key: resetKey, left: seconds, secs: seconds, on: ativo })
  const cb = useRef(onTimeUp)
  useEffect(() => { cb.current = onTimeUp })
  if (st.key !== resetKey || st.secs !== seconds) {
    setSt({ key: resetKey, left: seconds, secs: seconds, on: ativo })
  } else if (st.on !== ativo) {
    setSt((s) => ({ ...s, on: ativo }))
  }
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => {
      setSt((s) => {
        if (s.left <= 0.05) {
          clearInterval(id)
          setTimeout(() => cb.current(), 0)
          return { ...s, left: 0 }
        }
        return { ...s, left: Math.round((s.left - 0.1) * 10) / 10 }
      })
    }, 100)
    return () => clearInterval(id)
  }, [resetKey, seconds, ativo])
  return st.left
}

// Faixa de aviso no meio da tela (rodada concluida, round novo...)
function useFaixa() {
  const [faixa, setFaixa] = useState(null)
  const timers = useRef([])
  const mostrar = useCallback((titulo, sub, tipo = 'ok') => {
    setFaixa({ titulo, sub, tipo, id: Date.now() })
    timers.current.push(setTimeout(() => setFaixa(null), 1500))
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return { faixa, mostrar }
}

function Faixa({ f }) {
  if (!f) return null
  return (
    <div className={`mg-faixa is-${f.tipo}`} key={f.id}>
      <b>{f.titulo}</b>
      {f.sub ? <small>{f.sub}</small> : null}
    </div>
  )
}

// Tempo por rodada: reinicia sozinho quando resetKey muda e so conta quando ativo.
// (usado no jogo das notas, em que cada acerto devolve o tempo inteiro)
function useRoundTimer({ segundos, ativo, onTimeUp, resetKey }) {
  const [st, setSt] = useState({ key: resetKey, left: segundos })
  const cb = useRef(onTimeUp)
  useEffect(() => { cb.current = onTimeUp })
  // reinicia o tempo durante o proprio render quando a rodada muda (evita efeito em cascata)
  if (st.key !== resetKey) setSt({ key: resetKey, left: segundos })
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => {
      setSt((s) => {
        if (s.left <= 0.1) {
          clearInterval(id)
          setTimeout(() => cb.current(), 0)
          return { ...s, left: 0 }
        }
        return { ...s, left: Math.round((s.left - 0.1) * 10) / 10 }
      })
    }, 100)
    return () => clearInterval(id)
  }, [ativo, resetKey])
  return st.left
}

// Guarda a placar num ref para o fim do jogo (tempo esgotado) ler o valor atual
function useScoreRef(score) {
  const ref = useRef(0)
  useEffect(() => { ref.current = score }, [score])
  return ref
}

// Mede o tabuleiro pra poder espalhar os personagens pelo card inteiro
// (em vez de px fixos, que deixavam tudo preso no canto).
// margins = quanto de borda o elemento ocupa, pra nunca sair cortado do card.
const MARGEM_PADRAO = { w: 27, h: 27 }

function useBoardBox({ margins } = {}) {
  const ref = useRef(null)
  const boxRef = useRef({
    w: 320,
    h: 320,
    hw: (margins || MARGEM_PADRAO).w,
    hh: (margins || MARGEM_PADRAO).h,
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        boxRef.current.w = r.width
        boxRef.current.h = r.height
      }
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('orientationchange', medir)
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', medir) }
  }, [])
  return { ref, box: boxRef }
}

// Converte posicao relativa (0..1) em pixel dentro do card, respeitando as bordas
const boardPoint = (box, fx, fy) => ({
  x: box.hw + clamp01(fx) * Math.max(0, box.w - box.hw * 2),
  y: box.hh + clamp01(fy) * Math.max(0, box.h - box.hh * 2),
})
const boardRandom = (box) => boardPoint(box, rnd(0.03, 0.97), rnd(0.12, 0.97))
// Mesma conversao, mas num eixo por vez (usada no Corte as Frutas p/ o dedo e as frutas)
const cortaPxF = (box, f, eixo) =>
  (eixo === 'x' ? box.hw : box.hh) + clamp01(f) * Math.max(0, (eixo === 'x' ? box.w : box.h) - (eixo === 'x' ? box.hw : box.hh) * 2)

/* ===================== 1. Pegue o Ratinho ===================== */
// Rodadas progressivas: cada uma tem mais ratos e ele foge bem mais rápido.
const RODADAS_RATO = [
  { alvo: 3, tempo: 22, vel: 1.0, fuga: 1500 }, // rodada 1: tranquilo
  { alvo: 5, tempo: 21, vel: 1.55, fuga: 1100 }, // rodada 2: ele acelera
  { alvo: 7, tempo: 24, vel: 2.15, fuga: 850 }, // rodada 3: footing da vida
]

function RatoGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const tabuleiro = useBoardBox({ margins: { w: 30, h: 30 } })
  const elRef = useRef(null)
  const posRef = useRef(null)
  const alvoRef = useRef(null)
  const [estado, setEstado] = useState('idle') // idle | hit | away

  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_RATO[Math.min(rodada, RODADAS_RATO.length - 1)]
  const [n, setN] = useState(0) // capturas dentro da rodada
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_RATO.reduce((a, r) => a + r.alvo, 0)

  const desenhar = useCallback((p) => {
    const el = elRef.current
    if (el) {
      el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
    }
  }, [])

  const colocar = useCallback((p) => {
    posRef.current = { ...p }
    alvoRef.current = { ...p }
    desenhar(p)
  }, [desenhar])

  const finish = useCallback(
    (final, won) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won)
    },
    [onDone, sfx],
  )
  const left = useGameTimer(
    cfg.tempo,
    () => finish(pontosRef.current, pontosRef.current >= total),
    rodada,
    !faixa && !pausado,
  )

  // Posição inicial de cada rodada (ratinho recomeça em outro canto)
  useEffect(() => {
    const box = tabuleiro.box.current
    const p = boardPoint(box, rodada % 2 ? 0.75 : 0.25, 0.55)
    posRef.current = p
    alvoRef.current = { ...p }
    desenhar(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada, desenhar])

  // Corrida suave decidida no cfg da rodada
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (pausadoRef.current) { raf = requestAnimationFrame(loop); return }
      const p = posRef.current
      const t = alvoRef.current
      if (p && t) {
        const dx = t.x - p.x
        const dy = t.y - p.y
        const dist = Math.hypot(dx, dy)
        if (dist > 0.3) {
          const passo = Math.min(dist, (1.1 + dist * 0.13) * cfg.vel)
          p.x += (dx / dist) * passo
          p.y += (dy / dist) * passo
          const el = elRef.current
          if (el) {
            const tilt = Math.sin(Date.now() / 95) * 5
            el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${tilt}deg)`
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cfg.vel, cfg])

  // Empurrar pro canto certo faz ele fugir devagar; a cada rodada corre mais
  useEffect(() => {
    const sorteia = () => {
      if (pausadoRef.current) return
      const p = posRef.current
      if (!p) return
      const box = tabuleiro.box.current
      const longe = Math.hypot(alvoRef.current.x - p.x, alvoRef.current.y - p.y) > Math.max(80, Math.min(box.w, box.h) * 0.42)
      const fx = longe ? (p.x > box.w / 2 ? rnd(0.04, 0.3) : rnd(0.7, 0.96)) : rnd(0.04, 0.96)
      alvoRef.current = boardPoint(box, fx, rnd(0.1, 0.96))
    }
    const id = setInterval(sorteia, cfg.fuga)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.fuga, cfg])

  // Recua mais pra longe do que você caiu nele
  const fogeDo = useCallback((de) => {
    if (sfx) sfxWeak()
    const p = posRef.current
    if (!p) return
    const box = tabuleiro.box.current
    const cx = box.w / 2
    const dx = p.x - de.x
    const dy = p.y - de.y
    const d = Math.hypot(dx, dy) || 1
    const dest = boardPoint(
      box,
      (p.x + (dx / d) * 80 - cx) / Math.max(1, box.w - box.hw * 2),
      (p.y + (dy / d) * 80 - box.hh) / Math.max(1, box.h - box.hh * 2),
    )
    alvoRef.current = dest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfx, tabuleiro.box])

  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_RATO.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa! 🐭`, 'próxima: mais rápido... ⚡')
    setN(0)
    setEstado('idle')
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }

  const grab = () => {
    if (estado !== 'idle') return
    const p = posRef.current
    if (p) {
      const box = tabuleiro.box.current
      pop(p.x / Math.max(1, box.w), p.y / Math.max(1, box.h), '✨')
    }
    if (sfx) sfxPop()
    setEstado('hit')
    const totalRodada = n + 1
    setN(totalRodada)
    setPontos((p) => p + 1)
    setTimeout(() => {
      if (totalRodada >= cfg.alvo) {
        setEstado('idle')
        novaRodada()
        return
      }
      setEstado('idle')
      const box = tabuleiro.box.current
      colocar(boardPoint(box, rnd(0.04, 0.96), rnd(0.12, 0.96)))
    }, 280)
  }

  return (
    <div
      className="mg-board"
      ref={tabuleiro.ref}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        fogeDo({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
    >
      <div className={`mg-time${left <= 4 ? ' is-urgent' : ''}`}><i style={{ width: `${(left / cfg.tempo) * 100}%` }} /></div>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_RATO.length}</b> · capture {n}/{cfg.alvo} 🐭 ⏱️ {Math.ceil(left)}s
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_RATO.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      <button
        ref={elRef}
        className={`mg-rat is-${estado}`}
        onPointerDown={(e) => { e.stopPropagation(); grab() }}
        aria-label="Pegar o ratinho"
      >
        🐭
      </button>
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== 2. Nota Certa ===================== */
const NOTES = [
  { color: '#ef4444', emoji: '🔴', nome: 'vermelha', nota: 'lá' },
  { color: '#3b82f6', emoji: '🔵', nome: 'azul', nota: 'si' },
  { color: '#22c55e', emoji: '🟢', nome: 'verde', nota: 'dó' },
  { color: '#eab308', emoji: '🟡', nome: 'amarela', nota: 'ré' },
]

function NotasGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const MAX = 10
  const [nivel, setNivel] = useState(0)
  const nivelRef = useScoreRef(nivel)
  const doneRef = useRef(false)
  const { fx, pop } = useFx()
  const [seq, setSeq] = useState([])
  const [input, setInput] = useState(0)
  const [fase, setFase] = useState('idle') // idle | show | input
  const [acesa, setAcesa] = useState(null)
  const [erro, setErro] = useState(false)
  const timers = useRef([])

  const finish = useCallback(
    (final, won) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won)
    },
    [onDone, sfx],
  )
  const [rodada, setRodada] = useState(0)
  // cada rodada ganha tempo conforme o tamanho da sequencia (sobra sempre justo)
  const tempoRodada = seq.length ? Math.round(7 + seq.length * 1.5) : 12
  const left = useRoundTimer({
    segundos: tempoRodada,
    ativo: fase === 'input',
    onTimeUp: () => finish(nivelRef.current, nivelRef.current >= MAX),
    resetKey: `${rodada}-${tempoRodada}`,
  })

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const limpar = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  //，越往上 a sequência toca mais rápido (dificuldade progressiva)
  const mostrar = (lista, nivelAtual = 0) => {
    limpar()
    setFase('show')
    setInput(0)
    const passo = Math.max(230, 560 - nivelAtual * 30)
    const luz = Math.max(150, 320 - nivelAtual * 16)
    lista.forEach((cor, i) => {
      timers.current.push(
        setTimeout(() => {
          if (sfx) sfxNota(cor)
          setAcesa(cor)
          timers.current.push(setTimeout(() => setAcesa(null), luz))
        }, 300 + i * passo),
      )
    })
    timers.current.push(
      setTimeout(() => {
        setFase('input')
        setInput(0)
      }, 300 + lista.length * passo),
    )
  }

  const start = () => {
    if (sfx) sfxCoin()
    setNivel(0)
    setRodada(0)
    const first = [0, 1, 2].map(() => Math.floor(rnd(0, 4)))
    setSeq(first)
    pop(0.5, 0.46, '🎵')
    setTimeout(() => mostrar(first, 0), 240)
  }

  const tocar = (i) => {
    if (fase !== 'input') return
    if (sfx) sfxNota(i)
    setAcesa(i)
    setTimeout(() => setAcesa(null), 200)
    if (seq[input] !== i) {
      setErro(true)
      setFase('idle')
      if (sfx) sfxWeak()
      pop(0.5, 0.46, '❌')
      setTimeout(() => { setErro(false); finish(nivelRef.current, false) }, 640)
      return
    }
    const next = input + 1
    if (next >= seq.length) {
      const novo = nivel + 1
      setNivel(novo)
      pop(0.5, 0.4, novo >= MAX ? '🏆' : '✨')
      if (novo >= MAX) {
        setFase('idle')
        setTimeout(() => finish(MAX, true), 640)
        return
      }
      const grew = [...seq, Math.floor(rnd(0, 4))]
      setSeq(grew)
      setRodada((r) => r + 1)
      setTimeout(() => mostrar(grew, novo), 520)
      return
    }
    setInput(next)
  }

  return (
    <div className={`mg-board${erro ? ' is-shake' : ''}`}>
      <div className={`mg-time${fase === 'input' && left <= 4 ? ' is-urgent' : ''}`}>
        <i style={{ width: `${(left / tempoRodada) * 100}%` }} />
      </div>
      <span className="mg-hint">
        nível <b>{nivel}/{MAX}</b> ·{' '}
        {fase === 'show' ? 'assista 👀' : fase === 'input' ? 'sua vez! 🎵' : nivel === 0 ? 'toque pra começar' : ''}
        {fase === 'input' && <b className="mg-relogio"> ⏱️ {Math.ceil(left)}s</b>}
      </span>
      {nivel === 0 && fase === 'idle' ? (
        <button className="mg-start" onClick={start}>▶️ começar</button>
      ) : (
        <div className="mg-notes">
          {NOTES.map((n, i) => (
            <button
              key={n.nome}
              className={`mg-note${acesa === i ? ' is-on' : ''}${fase === 'input' && seq[input] === i ? ' is-want' : ''}`}
              style={{ background: n.color }}
              onPointerDown={(e) => { e.stopPropagation(); tocar(i) }}
              aria-label={`nota ${n.nome}`}
            >
              {n.emoji}
            </button>
          ))}
        </div>
      )}
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== 3. Arraste o Novelo ===================== */
// Rodadas: o alvo fica cada vez mais rápido e foge antes.
const RODADAS_NOVELO = [
  { alvo: 3, tempo: 24, vel: 0.02, raio: 44 }, // rodada 1
  { alvo: 5, tempo: 22, vel: 0.034, raio: 38 }, // rodada 2
  { alvo: 7, tempo: 24, vel: 0.05, raio: 32 }, // rodada 3
]

function NoveloGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const tabuleiro = useBoardBox({ margins: { w: 40, h: 40 } })
  const boardRef = useRef(null)
  const alvoElRef = useRef(null)
  const fioRef = useRef(null)
  const fioPosRef = useRef(null)
  const dedaoRef = useRef(null)
  const alvoPosRef = useRef(null)
  const alvoDestRef = useRef(null)
  const proximoEmRef = useRef(0)
  const pegando = useRef(false)

  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_NOVELO[Math.min(rodada, RODADAS_NOVELO.length - 1)]
  const [n, setN] = useState(0)
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_NOVELO.reduce((a, r) => a + r.alvo, 0)

  const finish = useCallback(
    (final, won) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won)
    },
    [onDone, sfx],
  )
  const left = useGameTimer(
    cfg.tempo,
    () => finish(pontosRef.current, pontosRef.current >= total),
    rodada,
    !faixa && !pausado,
  )

  // Posiciona alvo e novelo no inicio de cada rodada
  useEffect(() => {
    const c = boardPoint(tabuleiro.box.current, 0.5, 0.55)
    const a = boardRandom(tabuleiro.box.current)
    fioPosRef.current = { ...c }
    dedaoRef.current = { ...c }
    alvoPosRef.current = { ...a }
    alvoDestRef.current = { ...a }
    setN(0)
    return () => {
      fioPosRef.current = null; dedaoRef.current = null
      alvoPosRef.current = null; alvoDestRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada, tabuleiro.box])

  // Novelo segue o dedo com suavizacao; alvo passeia e acelera conforme o cfg
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (pausadoRef.current) { raf = requestAnimationFrame(loop); return }
      const f = fioPosRef.current
      const d = dedaoRef.current
      const a = alvoPosRef.current
      const ad = alvoDestRef.current
      if (f && d) {
        f.x += (d.x - f.x) * 0.16
        f.y += (d.y - f.y) * 0.16
        if (fioRef.current) {
          fioRef.current.style.transform = `translate(-50%, -50%) translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px)`
        }
      }
      if (a && ad) {
        a.x += (ad.x - a.x) * cfg.vel
        a.y += (ad.y - a.y) * cfg.vel
        if (alvoElRef.current) {
          alvoElRef.current.style.transform = `translate(-50%, -50%) translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`
        }
        if (Date.now() > proximoEmRef.current) {
          proximoEmRef.current = Date.now() + rnd(700, 1250)
          // se o novelo chega perto, o alvo foge pra metade oposta
          const box = tabuleiro.box.current
          const longe = f && Math.hypot(f.x - a.x, f.y - a.y) < cfg.raio + 40
          const destino = longe
            ? boardPoint(box, f.x > box.w / 2 ? rnd(0.05, 0.35) : rnd(0.65, 0.95), rnd(0.12, 0.95))
            : boardRandom(box)
          ad.x = destino.x
          ad.y = destino.y
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cfg.vel, cfg.raio, cfg, tabuleiro])

  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_NOVELO.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa! 🧶`, 'o alvo fica mais rápido ⚡')
    pegando.current = false
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }

  const mira = (e) => {
    if (!pegando.current) return
    const r = boardRef.current?.getBoundingClientRect()
    const a = alvoPosRef.current
    if (!r || !a) return
    dedaoRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    if (Math.hypot(dedaoRef.current.x - a.x, dedaoRef.current.y - a.y) < cfg.raio) {
      const b = tabuleiro.box.current
      pop(a.x / Math.max(1, b.w), a.y / Math.max(1, b.h), '🧶')
      if (sfx) sfxPop()
      const totalRodada = n + 1
      setN(totalRodada)
      setPontos((p) => p + 1)
      if (totalRodada >= cfg.alvo) {
        pegando.current = false
        novaRodada()
        return
      }
      const prox = boardRandom(tabuleiro.box.current)
      alvoDestRef.current = prox
      alvoPosRef.current = { ...prox }
    }
  }

  return (
    <div
      ref={boardRef}
      className="mg-board"
      onPointerDown={(e) => { pegando.current = true; mira(e) }}
      onPointerMove={mira}
      onPointerUp={() => { pegando.current = false }}
      onPointerCancel={() => { pegando.current = false }}
    >
      <div className={`mg-time${left <= 4 ? ' is-urgent' : ''}`}><i style={{ width: `${(left / cfg.tempo) * 100}%` }} /></div>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_NOVELO.length}</b> · {n}/{cfg.alvo} alvos 🧶 ⏱️ {Math.ceil(left)}s
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_NOVELO.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      <span ref={alvoElRef} className="mg-target" />
      <span ref={fioRef} className="mg-yarn">🧶</span>
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== 4. Estoure as Bolhas ===================== */
// Rodadas: mais bolhas, menores e mais rapidas.
const RODADAS_BOLHAS = [
  { alvo: 8, tempo: 22, min: 40, max: 54, ritmo: 2.8 }, // rodada 1
  { alvo: 12, tempo: 20, min: 32, max: 46, ritmo: 2.2 }, // rodada 2
  { alvo: 16, tempo: 19, min: 26, max: 38, ritmo: 1.9 }, // rodada 3
]

function BolhasGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_BOLHAS[Math.min(rodada, RODADAS_BOLHAS.length - 1)]
  const [n, setN] = useState(0)
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_BOLHAS.reduce((a, r) => a + r.alvo, 0)

  const [bolhas, setBolhas] = useState(() => criaBolhas(RODADAS_BOLHAS[0]))

  function criaBolhas(c) {
    const lista = []
    for (let i = 0; i < c.alvo; i++) {
      let x = 0; let y = 0
      for (let tent = 0; tent < 24; tent++) {
        x = rnd(10, 90)
        y = rnd(16, 90)
        if (lista.every((p) => Math.hypot(p.x - x, p.y - y) > 18)) break
      }
      lista.push({ x, y, size: rnd(c.min, c.max), drift: rnd(-12, 12), delay: rnd(0, 1.6) })
    }
    return lista.map((b, i) => ({ id: i, ...b }))
  }

  const finish = useCallback(
    (final, won) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won)
    },
    [onDone, sfx],
  )
  const left = useGameTimer(
    cfg.tempo,
    () => finish(pontosRef.current, pontosRef.current >= total),
    rodada,
    !faixa && !pausado,
  )

  // Nova fornada de bolhas a cada rodada (menores e em maior quantidade)
  useEffect(() => {
    setN(0)
    const lista = criaBolhas(cfg)
    setBolhas(lista)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada])

  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_BOLHAS.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa! 🫧`, 'bolhas menores e mais rápidas 💨')
    setN(0)
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }

  const estourar = (b) => {
    if (sfx) sfxPop()
    pop(b.x / 100, b.y / 100, '💧')
    setN((v) => v + 1)
    setPontos((p) => p + 1)
    setBolhas((lista) => lista.filter((x) => x.id !== b.id))
  }

  // Ao estourar a ultima bolha da rodada, avanca
  useEffect(() => {
    if (rodada >= RODADAS_BOLHAS.length) return
    if (bolhas.length === 0 && n > 0) novaRodada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolhas.length, rodada])

  const boardRef = useRef(null)

  return (
    <div className={`mg-board${pausado ? ' is-pausado' : ''}`} ref={boardRef}>
      <div className={`mg-time${left <= 4 ? ' is-urgent' : ''}`}><i style={{ width: `${(left / cfg.tempo) * 100}%` }} /></div>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_BOLHAS.length}</b> · estourou {n}/{cfg.alvo} 🫧 ⏱️ {Math.ceil(left)}s
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_BOLHAS.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      {bolhas.map((b) => (
        <button
          key={b.id}
          className="mg-bubble"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            '--drift': `${b.drift}px`,
            animationDelay: `${b.delay}s`,
          }}
          onPointerDown={(e) => { e.stopPropagation(); estourar(b) }}
          aria-label="Estourar bolha"
        />
      ))}
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== 5. Chuva de Moedas ===================== */
// Rodadas: mais moedas, queda mais rápida e mais bombas.
const RODADAS_MOEDAS = [
  { alvo: 8, tempo: 22, vel: 95, bomba: 0.08 },
  { alvo: 12, tempo: 21, vel: 135, bomba: 0.2 },
  { alvo: 16, tempo: 21, vel: 175, bomba: 0.32 },
]

function MoedasGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const tabuleiro = useBoardBox({ margins: { w: 26, h: 26 } })
  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_MOEDAS[Math.min(rodada, RODADAS_MOEDAS.length - 1)]
  const [itens, setItens] = useState([])
  const [n, setN] = useState(0)
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_MOEDAS.reduce((a, r) => a + r.alvo, 0)
  const bornId = useRef(0)
  const els = useRef(new Map()) // id -> elemento (movemos via DOM, sem rerender)
  const pos = useRef(new Map()) // id -> {x, y}
  // Ref ESTAVEL: ref inline muda de identidade a cada re-render e resetaria
  // todas as moedas para y:-14 (ficavam presas no topo). Com este useCallback
  // só roda na montagem/desmontagem de cada moeda.
  const setEl = useCallback((el) => {
    if (!el) return
    const id = Number(el.dataset.id)
    els.current.set(id, el)
    if (!pos.current.has(id)) {
      const b = tabuleiro.box.current
      const x = b.hw + ((Number(el.dataset.x) / 100) * Math.max(0, b.w - b.hw * 2))
      pos.current.set(id, { x, y: -14 })
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, -14px)`
    }
  }, [tabuleiro.box])

  const finish = useCallback(
    (final, won) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won)
    },
    [onDone, sfx],
  )
  const left = useGameTimer(
    cfg.tempo,
    () => finish(pontosRef.current, pontosRef.current >= total),
    rodada,
    !faixa && !pausado,
  )

  const remover = useCallback((id) => {
    els.current.delete(id)
    pos.current.delete(id)
    setItens((l) => l.filter((x) => x.id !== id))
  }, [])

  // Reinicia a chuva a cada rodada
  useEffect(() => {
    setN(0)
    setItens([])
    els.current = new Map()
    pos.current = new Map()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada])

  // Chuva: a primeira moeda nasce logo (120ms) e o resto vai caindo de 600 em
  // 600ms. O movimento roda via rAF direto no DOM (compositor, liso).
  useEffect(() => {
    let coinsSpawned = 0
    const nascer = () => {
      if (pausadoRef.current) return
      // A meta vale MOEDAS, nao itens: bomba nao pode "comer" a vaga de uma
      // moeda, senao o ultimo clique nunca chega (ex.: 11/12 sem a 12a).
      if (coinsSpawned >= cfg.alvo) return
      // Nao deixa um item nascer em cima de outro (bomba encobrindo moeda
      // impedia de tocar nela e a meta ficava inalcancavel).
      const b = tabuleiro.box.current
      let x = rnd(8, 92)
      for (let tent = 0; tent < 12; tent++) {
        const pxX = b.hw + ((x / 100) * Math.max(0, b.w - b.hw * 2))
        const colide = [...pos.current.values()].some(
          (p) => Math.abs(p.x - pxX) < 52 && Math.abs(p.y + 14) < 64,
        )
        if (!colide) break
        x = rnd(8, 92)
      }
      const bomba = Math.random() < cfg.bomba
      if (!bomba) coinsSpawned++
      setItens((l) => [...l, { id: bornId.current++, bomba, x }])
    }
    const t1 = setTimeout(nascer, 120)
    const t = setInterval(nascer, 600)
    let raf = 0
    let ultimoT = performance.now()
    const loop = (agora) => {
      if (pausadoRef.current) { raf = requestAnimationFrame(loop); return }
      const dt = Math.min(50, agora - ultimoT)
      ultimoT = agora
      const b = tabuleiro.box.current
      const removidos = []
      pos.current.forEach((p, id) => {
        p.y += (cfg.vel * dt) / 1000
        const el = els.current.get(id)
        if (el) el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
        if (p.y > b.h + 40) removidos.push(id)
      })
      if (removidos.length) {
        removidos.forEach((id) => { els.current.delete(id); pos.current.delete(id) })
        setItens((l) => l.filter((x) => !removidos.includes(x.id)))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { clearTimeout(t1); clearInterval(t); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.vel, rodada])

  // Pegou todas moedas da rodada → avança
  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_MOEDAS.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa! 💰`, 'cai mais rápido ⚡')
    setN(0)
    setItens([])
    els.current = new Map()
    pos.current = new Map()
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }
  useEffect(() => {
    if (n >= cfg.alvo && n > 0) novaRodada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  const tocar = (e, it) => {
    e.stopPropagation()
    const p = pos.current.get(it.id) || { x: it.x, y: 0 }
    const b = tabuleiro.box.current
    if (it.bomba) {
      if (sfx) sfxWeak()
      pop(p.x / Math.max(1, b.w), p.y / Math.max(1, b.h), '💥')
      remover(it.id)
      return
    }
    if (sfx) sfxCoin()
    pop(p.x / Math.max(1, b.w), p.y / Math.max(1, b.h), '✦')
    remover(it.id)
    setN((v) => v + 1)
    setPontos((q) => q + 1)
  }

  return (
    <div className="mg-board" ref={tabuleiro.ref}>
      <div className={`mg-time${left <= 4 ? ' is-urgent' : ''}`}><i style={{ width: `${(left / cfg.tempo) * 100}%` }} /></div>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_MOEDAS.length}</b> · pegue {n}/{cfg.alvo} 💰 ⏱️ {Math.ceil(left)}s
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_MOEDAS.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      {itens.map((it) => (
        <button
          key={it.id}
          className={`mg-moeda${it.bomba ? ' is-bomba' : ''}`}
          data-id={it.id}
          data-x={String(it.x)}
          ref={setEl}
          onPointerDown={(e) => tocar(e, it)}
          aria-label={it.bomba ? 'Bomba' : 'Moeda'}
        />
      ))}
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== 6. Pule os Espinhos ===================== */
// Rodadas: espinhos mais largos, mais rápidos e chegando com mais frequência.
// pula: tempo total do pulo (maior = mais tempo no ar, queda suave).
// gap: distância média em px entre um espinho e outro (os espaços são sorteados).
const RODADAS_ESPINHOS = [
  { alvo: 5, tempo: 24, vel: 150, largura: 34, pula: 720 },
  { alvo: 8, tempo: 24, vel: 185, largura: 40, pula: 660 },
  { alvo: 11, tempo: 24, vel: 225, largura: 46, pula: 600 },
]

// Espaço até o próximo espinho. O mínimo já garante DE SOBRA que dá
// pra pular, pousar e ainda sobra um respiro antes do próximo chegarem.
// Aí o ritmo varia: às vezes vem rápido, às vezes bem folgado.
function sorteiaEspaco(c) {
  const minS = c.pula * c.vel // distância coberta enquanto o gato está no ar
  const r = Math.random()
  if (r < 0.18) return rnd(minS * 0.95, minS * 1.25) // picado, mas sempre dá
  if (r < 0.75) return rnd(minS * 1.5, minS * 2.3) // normal
  return rnd(minS * 2.5, minS * 4.0) // descanso pro dedo 😌
}

// Modulo sempre positivo, pra envolver tira de padrao sem "salto" visual
const modP = (v, p) => ((v % p) + p) % p

function EspinhosGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const tabuleiro = useBoardBox({ margins: { w: 26, h: 30 } })
  const gatoRef = useRef(null)
  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_ESPINHOS[Math.min(rodada, RODADAS_ESPINHOS.length - 1)]
  const [obs, setObs] = useState([])
  const obsRef = useRef(obs)
  const obsPos = useRef(new Map()) // id -> x em px
  const obsEls = useRef(new Map()) // id -> elemento
  const setObEl = useCallback((el) => {
    if (!el) return
    // O id do espinho é uma STRING (Math.random().toString(36)); os outros
    // minijogos usam número, por isso o `Number()` aqui fazia o mapa de
    // elementos virar NaN e o espinho nunca era posicionado nem movido
    // (ficava invisível, mas a colisão continuava ativa).
    const id = el.dataset.id
    obsEls.current.set(id, el)
    const pr = obsPos.current.get(id)
    if (pr) el.style.transform = `translate(-50%, -50%) translate(${pr.x.toFixed(1)}px, ${soloY.current.toFixed(1)}px)`
  }, [])
  const [n, setN] = useState(0)
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_ESPINHOS.reduce((a, r) => a + r.alvo, 0)
  const pulo = useRef(null) // { t0 }
  const proxSpawnX = useRef(0) // x onde o próximo espinho pode nascer
  const catX = useRef(0)
  const soloY = useRef(0)
  const gatoH = useRef(34)
  const morreu = useRef(false)
  const soloRef = useRef(null)
  const dunasRef = useRef(null)
  const soloSX = useRef(0) // rolagem do chão
  const dunaSX = useRef(0) // parallax das dunas

  useEffect(() => { obsRef.current = obs }, [obs])

  // Desenha o gato virado de frente pros espinhos (que vêm da direita)
  const pintarGato = (px, py, giro = 0, squash = 1) => {
    const el = gatoRef.current
    if (el) {
      el.style.transform = `translate(-50%, -50%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scaleX(-1) rotate(${giro}deg) scale(${squash.toFixed(3)})`
    }
  }

  const finish = useCallback(
    (final, won, motivo) => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won, motivo)
    },
    [onDone, sfx],
  )
  // Sem cronômetro aqui: o jogo (estilo dinossauro) acaba quando o espinho
  // te pega, não quando o relógio zera. A derrota tem motivo próprio.

  // O gato posica no chao de cada rodada e tudo recomeça limpo
  useEffect(() => {
    const b = tabuleiro.box.current
    soloY.current = b.h - b.hh + 8
    gatoH.current = Math.max(26, Math.min(44, Math.round(b.h * 0.16)))
    const larg = Math.max(0, b.w - b.hw * 2)
    const right = b.hw + larg
    catX.current = b.hw + larg * 0.16
    setN(0)
    setObs([])
    obsPos.current = new Map()
    obsEls.current = new Map()
    pulo.current = null
    morreu.current = false
    soloSX.current = 0
    dunaSX.current = 0
    proxSpawnX.current = right + 20
    pintarGato(catX.current, soloY.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada])

  // Física contínua: espinhos correm pra esquerda, gato pula e colisão decide
  useEffect(() => {
    let raf = 0
    let ultimoT = performance.now()
    const loop = (agora) => {
      if (pausadoRef.current) { raf = requestAnimationFrame(loop); return }
      const dt = Math.min(50, agora - ultimoT)
      ultimoT = agora
      const b = tabuleiro.box.current
      const right = b.hw + Math.max(0, b.w - b.hw * 2)
      const remov = []

      // espinhos se movem
      obsPos.current.forEach((p, id) => {
        p.x -= (cfg.vel * dt) / 1000
        const el = obsEls.current.get(id)
        if (el) el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${soloY.current.toFixed(1)}px)`
        if (p.x < -60) remov.push(id)
      })

      // cenário corre junto: chão (padrão de 30px) e dunas (de 540px) viram
      // "tiras" deslizando via transform — roda no compositor, sem repintar a tela
      soloSX.current -= (cfg.vel * dt) / 1000
      if (soloRef.current) soloRef.current.style.transform = `translate3d(${(-(30 + modP(soloSX.current, 30))).toFixed(2)}px, 0, 0)`
      dunaSX.current -= (cfg.vel * 0.42 * dt) / 1000
      if (dunasRef.current) dunasRef.current.style.transform = `translate3d(${(-(540 + modP(dunaSX.current, 540))).toFixed(2)}px, 0, 0)`

      // nasce espinho novo quando o último já andou o espaço sorteado
      if (obsRef.current.length < 4) {
        let maisD = -1e9
        obsPos.current.forEach((po) => { if (po.x > maisD) maisD = po.x })
        if (maisD <= proxSpawnX.current) {
          const id = novoEspinhoId()
          obsPos.current.set(id, { x: right + 40 })
          setObs((l) => [...l, { id, largura: cfg.largura }])
          proxSpawnX.current = right + 40 - sorteiaEspaco(cfg)
        }
      }

      // pulo do gato: sobe rápido (30%), flutua no alto e desce beeeem devagar (70%)
      if (pulo.current && gatoRef.current) {
        const t = agora - pulo.current.t0
        const pr = Math.min(1, t / cfg.pula)
        const sub = clamp01(t / (cfg.pula * 0.3))
        const desc = clamp01((t - cfg.pula * 0.3) / (cfg.pula * 0.7))
        const arc = sub < 1 ? Math.sin(sub * Math.PI * 0.5) : Math.cos(desc * Math.PI * 0.5)
        const salto = arc * soloY.current * 0.52
        // inclina pra frente na subida (impulso), dino-style
        const giro = arc < 1 ? -8 * Math.sin(sub * Math.PI) : 0
        pintarGato(catX.current, soloY.current - salto, giro, 1 - arc * 0.1 + Math.sin(sub * Math.PI) * 0.02)
        if (pr >= 1) pulo.current = null
      } else if (gatoRef.current && !morreu.current) {
        // paradinho no chão dá uma respiradinha sutil
        const bob = Math.sin(agora / 240) * 1.4
        pintarGato(catX.current, soloY.current + bob, 0, 1 + Math.sin(agora / 240) * 0.02)
      }

      // colisão e passagem
      for (const ob of obsRef.current) {
        const p = obsPos.current.get(ob.id)
        if (!p) continue
        const meio = p.x
        if (meio + ob.largura / 2 < catX.current - 10) {
          // passou vivo!
          pop(catX.current / b.w, soloY.current / b.h, '✨')
          if (sfx) sfxPop()
          obsPos.current.delete(ob.id)
          obsEls.current.delete(ob.id)
          remov.push(ob.id)
          setN((v) => v + 1)
          setPontos((q) => q + 1)
          continue
        }
        const pulando = pulo.current
        const t = pulando ? agora - pulando.t0 : 0
        const ar = pulando && t / cfg.pula > 0.06 && t / cfg.pula < 0.97
        if (Math.abs(meio - catX.current) < ob.largura / 2 + gatoH.current * 0.34 && !ar && !morreu.current) {
          morreu.current = true
          pintarGato(catX.current, soloY.current, 18, 0.92)
          setTimeout(() => { if (!doneRef.current) finish(pontosRef.current, pontosRef.current >= total, 'espinho') }, 180)
          break
        }
      }

      if (remov.length) setObs((l) => l.filter((x) => !remov.includes(x.id)))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada, cfg.vel, cfg.largura, cfg.pula])

  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_ESPINHOS.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa!`, 'espinhos mais rápidos ⚡')
    const b = tabuleiro.box.current
    proxSpawnX.current = b.hw + Math.max(0, b.w - b.hw * 2) + 20
    setN(0)
    setObs([])
    obsPos.current = new Map()
    obsEls.current = new Map()
    pulo.current = null
    soloSX.current = 0
    dunaSX.current = 0
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }
  useEffect(() => {
    if (n >= cfg.alvo && n > 0) novaRodada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  const pular = (e) => {
    e?.stopPropagation()
    if (morreu.current) return
    if (pulo.current) {
      // já dá pra encadear a subidinha final do pulo → pulos seguidos fluido
      const t = performance.now() - pulo.current.t0
      if (t / cfg.pula < 0.84) return
    }
    pulo.current = { t0: performance.now() }
    if (sfx) sfxBounce()
  }

  return (
    <div className="mg-board" ref={tabuleiro.ref} onPointerDown={pular}>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_ESPINHOS.length}</b> · desviou {n}/{cfg.alvo} cactos
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_ESPINHOS.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      <span className="mg-ceu" aria-hidden="true" />
      <span className="mg-nuvem n1" aria-hidden="true" />
      <span className="mg-nuvem n2" aria-hidden="true" />
      <span className="mg-nuvem n3" aria-hidden="true" />
      <span className="mg-dunas" aria-hidden="true"><i className="mg-dunas-strip" ref={dunasRef} /></span>
      <span className="mg-solo" aria-hidden="true"><i className="mg-solo-strip" ref={soloRef} /></span>
      <span className="mg-gato" ref={gatoRef}>🐈</span>
      {obs.map((ob) => (
        <span
          key={ob.id}
          className="mg-espinho"
          style={{ width: ob.largura, left: 0, top: 0 }}
          data-id={ob.id}
          ref={setObEl}
        >
          <svg viewBox="0 0 56 78" aria-hidden="true">
            <g stroke="#14532d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="34" width="12" height="24" rx="6" fill="#16a34a" />
              <rect x="40" y="26" width="12" height="20" rx="6" fill="#16a34a" />
              <rect x="13" y="6" width="30" height="60" rx="15" fill="#22c55e" />
            </g>
            <circle cx="24" cy="32" r="2.2" fill="#14532d" />
            <circle cx="32" cy="32" r="2.2" fill="#14532d" />
            <path d="M20 5v5M28 3v6M36 5v5" stroke="#14532d" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
        </span>
      ))}
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}


/* ===================== 7. Corte as Frutas ===================== */
// Frutas e bombas voam do chao pra cima; deslize o dedo pra fatiar.
// Corte numa bomba = derrota (motivo 'bomba').
const FRUTAS = ['🍎', '🍌', '🍉', '🍓', '🍇', '🍊', '🍍']
const RODADAS_CORTES = [
  { alvo: 6, tempo: 18, cooldown: 950, bomba: 0.13, raio: 40 },
  { alvo: 8, tempo: 20, cooldown: 720, bomba: 0.2, raio: 40 },
  { alvo: 10, tempo: 22, cooldown: 520, bomba: 0.28, raio: 40 },
]

function CortarGame({ onDone, sfx, pausado = false }) {
  const pausadoRef = useRef(pausado)
  useEffect(() => { pausadoRef.current = pausado }, [pausado])
  const { fx, pop } = useFx()
  const { faixa, mostrar } = useFaixa()
  const tabuleiro = useBoardBox({ margins: { w: 26, h: 30 } })
  const [rodada, setRodada] = useState(0)
  const cfg = RODADAS_CORTES[Math.min(rodada, RODADAS_CORTES.length - 1)]
  const [itens, setItens] = useState([])
  const [n, setN] = useState(0)
  const [pontos, setPontos] = useState(0)
  const pontosRef = useScoreRef(pontos)
  const doneRef = useRef(false)
  const total = RODADAS_CORTES.reduce((a, r) => a + r.alvo, 0)
  const bornId = useRef(0)
  const els = useRef(new Map()) // id -> elemento (movemos via DOM, sem rerender)
  const pos = useRef(new Map()) // id -> {x,y,vx,vy,ang,va,bomba}
  const traco = useRef([]) // trail do dedo: {x,y,t} em fracao
  const tracando = useRef(false) // precursor - usado para evitar cortes fantasma no toque parado
  const slashRef = useRef(null) // linha do deslize

  const finish = useCallback(
    (final, won, motivo = 'tempo') => {
      if (doneRef.current) return
      doneRef.current = true
      if (sfx) { if (won) sfxHeart(); else sfxWeak() }
      onDone(final, won, motivo)
    },
    [onDone, sfx],
  )
  const left = useGameTimer(
    cfg.tempo,
    () => finish(pontosRef.current, pontosRef.current >= total),
    rodada,
    !faixa && !pausado,
  )

  const remover = useCallback((id) => {
    els.current.delete(id)
    pos.current.delete(id)
    setItens((l) => l.filter((x) => x.id !== id))
  }, [])

  // Ref ESTAVEL: registra o elemento na montagem (ref inline resetaria tudo).
  const setEl = useCallback((el) => {
    if (!el) return
    const id = Number(el.dataset.id)
    els.current.set(id, el)
  }, [])

  // Reinicia a rodada
  useEffect(() => {
    setN(0)
    setItens([])
    pos.current = new Map()
    els.current = new Map()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodada])

    // Fisica das frutas + deteccao de corte via rAF
  useEffect(() => {
    const b = tabuleiro.box.current
    const G = 2.2 * b.h // gravidade px/s^2 (arremesso alto o suficiente p/ fatiar)
    const lancar = () => {
      if (pausadoRef.current) return
      const bomba = Math.random() < cfg.bomba
      const id = bornId.current++
      const xf = rnd(0.12, 0.88)
      const px = cortaPxF(b, xf, 'x')
      const vy0 = -rnd(1.55, 1.95) * b.h // velocidade inicial pra cima (arco mais alto)
      pos.current.set(id, {
        x: px,
        y: b.h + 50,
        vx: rnd(-0.12, 0.12) * b.w,
        vy: vy0,
        ang: rnd(0, 60),
        va: rnd(-240, 240),
        bomba,
      })
      setItens((l) => [...l, { id, bomba, emoji: bomba ? '💣' : FRUTAS[Math.floor(Math.random() * FRUTAS.length)] }])
    }
    // nada voa enquanto nao tiver medida (1o frame com o tamanho certo)
    const t1 = setTimeout(lancar, 260)
    const t = setInterval(lancar, cfg.cooldown)
    let raf = 0
    let ultimoT = performance.now()

    const corta = (p, sg, raio) => {
      const dx = sg.x2 - sg.x1
      const dy = sg.y2 - sg.y1
      const len2 = dx * dx + dy * dy
      let k = len2 ? ((p.x - sg.x1) * dx + (p.y - sg.y1) * dy) / len2 : 0
      k = Math.max(0, Math.min(1, k))
      const qx = sg.x1 + k * dx - p.x
      const qy = sg.y1 + k * dy - p.y
      return qx * qx + qy * qy < raio * raio
    }
    const cortarItem = (id, p) => {
      const xf = clamp01(p.x / Math.max(1, b.w))
      const yf = clamp01(p.y / Math.max(1, b.h))
      if (p.bomba) {
        remover(id)
        pop(xf, yf, '💥')
        if (sfx) sfxWeak()
        finish(pontosRef.current, false, 'bomba')
        return
      }
      remover(id)
      pop(xf, yf, '✨')
      if (sfx) sfxPop()
      setN((v) => v + 1)
      setPontos((q) => q + 1)
    }
    const desenharSlash = (now) => {
      const line = slashRef.current
      if (!line) return
      const t2 = traco.current
      if (t2.length < 2) { line.style.opacity = '0'; return }
      const a2 = t2[t2.length - 1]
      const a1 = t2[t2.length - 2]
      const age = now - a1.t
      if (age > 160 || now - a2.t > 220) { line.style.opacity = '0'; return }
      const dx = a2.x - a1.x
      const dy = a2.y - a1.y
      const len = Math.hypot(dx, dy)
      if (len < 0.02) { line.style.opacity = '0'; return }
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI
      line.style.left = `${(((a1.x + a2.x) / 2) * 100).toFixed(2)}%`
      line.style.top = `${(((a1.y + a2.y) / 2) * 100).toFixed(2)}%`
      line.style.width = `${(len * 100).toFixed(2)}%`
      line.style.transform = `translate(-50%, -50%) rotate(${ang.toFixed(1)}deg)`
      line.style.opacity = String(Math.max(0, 1 - age / 160))
    }

    const loop = (agora) => {
      if (pausadoRef.current) { raf = requestAnimationFrame(loop); return }
      const dt = Math.min(50, agora - ultimoT)
      ultimoT = agora
      // segmento do dedo (px) usando os 2 ultimos pontos do trail
      const t2 = traco.current
      const now = performance.now()
      while (t2.length > 1 && now - t2[0].t > 200) t2.shift()
      let seg = null
      if (t2.length >= 2) {
        const a2 = t2[t2.length - 1]
        const a1 = t2[t2.length - 2]
        seg = { x1: cortaPxF(b, a1.x, 'x'), y1: cortaPxF(b, a1.y, 'y'), x2: cortaPxF(b, a2.x, 'x'), y2: cortaPxF(b, a2.y, 'y') }
      }
      const removidos = []
      pos.current.forEach((p, id) => {
        p.vy += (G * dt) / 1000
        p.x += (p.vx * dt) / 1000
        p.y += (p.vy * dt) / 1000
        p.ang += (p.va * dt) / 1000
        const el = els.current.get(id)
        if (el) {
          el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${((p.ang % 360) + 360) % 360}deg)`
        }
        if (tracando.current && seg && corta(p, seg, cfg.raio)) cortarItem(id, p)
        else if (p.y > b.h + 80 || p.y < -280) removidos.push(id)
      })
      if (removidos.length) {
        removidos.forEach((id) => { els.current.delete(id); pos.current.delete(id) })
        setItens((l) => l.filter((x) => !removidos.includes(x.id)))
      }
      desenharSlash(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { clearTimeout(t1); clearInterval(t); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.cooldown, cfg.bomba, cfg.raio, rodada])

  const novaRodada = () => {
    if (rodada + 1 >= RODADAS_CORTES.length) {
      setTimeout(() => finish(total, true), 420)
      return
    }
    mostrar(`rodada ${rodada + 1} completa! 🎉`, 'frutas voando ⚡')
    setN(0)
    setItens([])
    pos.current = new Map()
    els.current = new Map()
    setTimeout(() => setRodada((r) => r + 1), 1450)
  }
  useEffect(() => {
    if (n >= cfg.alvo && n > 0) novaRodada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  // --- dedo: deslizar = cortar ---
  const fracDedo = (e) => {
    const rect = tabuleiro.ref.current.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((e.clientY - rect.top) / Math.max(1, rect.height)),
    }
  }
  const iniciarDeslize = (e) => {
    if (doneRef.current) return
    tracando.current = true
    traco.current = [{ ...fracDedo(e), t: performance.now() }]
    if (sfx) sfxThrow()
    e.preventDefault()
  }
  const moverDeslize = (e) => {
    if (!tracando.current) return
    traco.current.push({ ...fracDedo(e), t: performance.now() })
    if (traco.current.length > 26) traco.current.shift()
  }
  const pararDeslize = () => { tracando.current = false }

  return (
    <div
      className="mg-board mg-corte"
      ref={tabuleiro.ref}
      onPointerDown={iniciarDeslize}
      onPointerMove={moverDeslize}
      onPointerUp={pararDeslize}
      onPointerCancel={pararDeslize}
    >
      <div className={`mg-time${left <= 4 ? ' is-urgent' : ''}`}><i style={{ width: `${(left / cfg.tempo) * 100}%` }} /></div>
      <span className="mg-hint">
        rodada <b>{rodada + 1}/{RODADAS_CORTES.length}</b> · corte {n}/{cfg.alvo} 🍎 ⏱️ {Math.ceil(left)}s
      </span>
      <span className="mg-dots mg-dots-round">
        {RODADAS_CORTES.map((r, i) => (
          <i key={i} className={`${i < rodada ? 'is-full' : ''}${i === rodada && n >= r.alvo ? ' is-now' : ''}`}>
            {i < rodada ? '✓' : i + 1}
          </i>
        ))}
      </span>
      <span className="mg-slash" ref={slashRef} aria-hidden="true" />
      {itens.map((it) => (
        <span
          key={it.id}
          className={`mg-fruta${it.bomba ? ' is-bomba' : ''}`}
          data-id={it.id}
          ref={setEl}
        >{it.emoji}</span>
      ))}
      <Faixa f={faixa} />
      <Fx fx={fx} />
    </div>
  )
}

/* ===================== Registro ===================== */
// Pra adicionar um jogo novo: crie o componente e ponha aqui no MINIGAMES.
// max = soma dos alvos; tempo = tempo da rodada 1; rodadas = n° de rounds.
const MINIGAMES = [
  {
    id: 'ratinho', name: 'Pegue o Ratinho', icon: '🐭', tone: '#fbbf24',
    desc: '3 rodadas, ele corre mais rápido a cada round',
    objetivo: 'Pegar os ratinhos', rodadas: 3, tempo: 22, max: 15, recompensa: 20, Play: RatoGame,
    como: [
      '3 rodadas: 3, depois 5 e por fim 7 ratinhos',
      'Toque nele pra pegar — tapa no chão o assusta e ele foge',
      'A cada rodada ele corre mais rápido ⚡',
    ],
  },
  {
    id: 'notas', name: 'Nota Certa', icon: '🎵', tone: '#a78bfa',
    desc: 'repita a sequência de sons e cores, cada vez maior',
    objetivo: 'Chegar ao nível 10', tempo: 32, max: 10, recompensa: 50, Play: NotasGame,
    como: [
      'O gato toca as notas uma por uma 🎵',
      'Toque nas cores na mesma ordem',
      'A sequência cresce e acelera a cada nível',
    ],
  },
  {
    id: 'novelo', name: 'Arraste o Novelo', icon: '🧶', tone: '#f472b6',
    desc: '3 rodadas, o alvo foge cada vez mais',
    objetivo: 'Acertar os alvos', rodadas: 3, tempo: 24, max: 15, recompensa: 30, Play: NoveloGame,
    como: [
      '3 rodadas: 3, depois 5 e por fim 7 alvos',
      'Arraste o novelo 🧶 com o dedo até o círculo verde',
      'Ele foge quando você chega perto e acelera no fim',
    ],
  },
  {
    id: 'bolhas', name: 'Estoure as Bolhas', icon: '🫧', tone: '#38bdf8',
    desc: '3 rodadas com bolhas menores e mais rápidas',
    objetivo: 'Estourar as bolhas', rodadas: 3, tempo: 22, max: 36, recompensa: 10, Play: BolhasGame,
    como: [
      '3 rodadas: 8, depois 12 e por fim 16 bolhas',
      'Toque nas bolhas para estourar 💥',
      'Cada rodada tem bolhas menores e mais rápidas',
    ],
  },
  {
    id: 'chuva', name: 'Chuva de Moedas', icon: '💰', tone: '#fde047',
    desc: '3 rodadas, caem moedas e bombas',
    objetivo: 'Pegar as moedas', rodadas: 3, tempo: 22, max: 36, recompensa: 35, Play: MoedasGame,
    como: [
      '3 rodadas: 8, depois 12 e por fim 16 moedas',
      'Toque nas moedas 💰 antes de caírem',
      'Cuidado com as bombas 💥 e com a chuva ficando mais rápida',
    ],
  },
  {
    id: 'espinhos', name: 'Pule os Espinhos', icon: '▲', tone: '#4ade80',
    desc: '3 rodadas, espinhos mais velozes e mais largos',
    semTempo: true,
    objetivo: 'Desviar dos espinhos', rodadas: 3, tempo: 24, max: 24, recompensa: 40, Play: EspinhosGame,
    como: [
      '3 rodadas: 5, depois 8 e por fim 11 espinhos',
      'Toque na tela para o gato pular 🐈',
      'Sem relógio: só não deixe os 🌵 te pegarem',
    ],
  },
  {
    id: 'cortes', name: 'Corte as Frutas', icon: '🍉', tone: '#fb923c',
    desc: '3 rodadas, deslize pra fatiar frutas e desviar das bombas',
    objetivo: 'Cortar as frutas', rodadas: 3, tempo: 18, max: 24, recompensa: 45, Play: CortarGame,
    como: [
      '3 rodadas: 6, depois 8 e por fim 10 frutas',
      'Deslize o dedo pela tela pra fatiar as frutas 🍎',
      'Cortar uma bomba 💥 explode e o jogo acaba na hora',
    ],
  },
]

// Conquistas: progresso calculado na hora (recorde/vitorias/streak) e cada
// uma pode ser resgatada UMA vez, pagando moedas extras.
const TROFEUS = [
  { id: 'estreia', nome: 'Primeiro passo', desc: 'jogue 1 minigame', meta: 1, premio: 5 },
  { id: 'jogador', nome: 'Veterano', desc: 'jogue 20 minigames', meta: 20, premio: 10 },
  { id: 'maratonista', nome: 'Maratonista', desc: 'jogue 50 minigames', meta: 50, premio: 20 },
  { id: 'campeao', nome: 'Campeão', desc: 'vença 5 minigames', meta: 5, premio: 10 },
  { id: 'mestre', nome: 'Mestre dos jogos', desc: 'vença todos os 7 minigames', meta: 7, premio: 25 },
  { id: 'medalhista', nome: 'Medalhista', desc: 'conquiste uma medalha de ouro (recorde 100%)', meta: 1, premio: 10 },
  { id: 'fiel', nome: 'Seguidor', desc: 'streak diário de 3 dias', meta: 3, premio: 10 },
  { id: 'devoto', nome: 'Devoto', desc: 'streak diário de 7 dias', meta: 7, premio: 20 },
]

/* ===================== Capa / menu de cada jogo ===================== */
function CapaJogo({ def, best, onStart, onTrocar, sfx }) {
  return (
    <div className="mg-capa" style={{ '--gc': def.tone }}>
      <div className="mg-capa-top">
        <button className="mg-voltar" onClick={onTrocar} aria-label="Escolher outro jogo">←</button>
        <span className="mg-capa-best">🏆 recorde: {best[def.id] ?? 0}/{def.max}{medalhaDe(best[def.id], def.max) ? ' ' + medalhaDe(best[def.id], def.max) : ''} · faça {def.max} pra medalha 🥇</span>
      </div>

      <div className="mg-capa-arte" aria-hidden="true">
        <i className="mg-orb o1" /><i className="mg-orb o2" /><i className="mg-orb o3" />
        <span className="mg-capa-emoji">{def.icon}</span>
      </div>

      <h3 className="mg-capa-titulo">{def.name}</h3>
      <p className="mg-capa-desc">{def.desc}</p>

      <div className="mg-capa-tags">
        <span><b>🎯</b>{def.objetivo}{def.rodadas ? ` (${def.rodadas} rodadas)` : ''}</span>
        {def.semTempo
          ? <span><b>🌵</b>sem relógio, só agilidade</span>
          : <span><b>⏱️</b>{def.tempo}s por rodada</span>}
        <span><b>🏆</b>+{premioJogo(def.recompensa)} na vitória</span>
        <span><b>🪙</b>até +{Math.max(1, Math.floor(premioJogo(def.recompensa) * 0.3))} sem vencer</span>
      </div>

      <div className="mg-capa-como">
        <b>Como jogar</b>
        <ol>
          {def.como.map((c, i) => (
            <li key={i}><span>{i + 1}</span>{c}</li>
          ))}
        </ol>
      </div>

      <div className="mg-capa-botoes">
        <button
          className="mg-btn primary"
          onPointerDown={() => { if (sfx) sfxCoin() }}
          onClick={onStart}
        >
          ▶️ Começar
        </button>
        <button className="mg-btn ghost" onClick={onTrocar}>Escolher outro</button>
      </div>
    </div>
  )
}

export function Minigames({ stats, soundOn = true, onFinish, onBack }) {
  const sfx = soundOn !== false
  const [jogo, setJogo] = useState(null)
  const [fase, setFase] = useState('lista') // lista | capa | conta | joga
  const [conta, setConta] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [best, setBest] = useState(() => readLocal('nt.mgBest') || {})
  const [diario, setDiario] = useState(() => readLocal('nt.daily') || {})
  const [mgStats, setMgStats] = useState(() => readLocal('nt.mgStats') || { plays: 0, wins: 0 })
  const [mgWins, setMgWins] = useState(() => readLocal('nt.mgWins') || {})
  const [claims, setClaims] = useState(() => readLocal('nt.mgClaims') || [])
  const [mostrandoTrof, setMostrandoTrof] = useState(false)
  const [pausado, setPausado] = useState(false)
  const [somOn, setSomOn] = useState(() => readLocal('nt.som'))
  useEffect(() => { setSfxEnabled(somOn !== false) }, [somOn])

  const progT = (t) => {
    switch (t.id) {
      case 'estreia': case 'jogador': case 'maratonista': return mgStats.plays || 0
      case 'campeao': return mgStats.wins || 0
      case 'mestre': return Object.keys(mgWins).length
      case 'medalhista': return MINIGAMES.some((g) => (best[g.id] || 0) >= g.max) ? 1 : 0
      case 'fiel': case 'devoto': return diario.n || 0
      default: return 0
    }
  }
  const resgatarTrof = (t) => {
    if (claims.includes(t.id)) return
    const prox = [...claims, t.id]
    setClaims(prox)
    writeLocal('nt.mgClaims', prox)
    if (sfx) sfxCoin()
    onFinish?.({ coins: t.premio, plays: 0 })
  }

  // --- Bônus diário + streak de dias seguidos ---
  const hoje = diaKey(new Date())
  const diarioDisponivel = diario.last !== hoje
  const proximoStreak = diario.last === ontemKey() ? (diario.n || 0) + 1 : 1
  const bonusDisponivel = diarioDisponivel ? bonusDiario(proximoStreak) : 0
  const receberDiario = () => {
    const next = { last: hoje, n: proximoStreak, pb: bonusDisponivel }
    writeLocal('nt.daily', next)
    setDiario(next)
    if (sfx) sfxCoin()
    onFinish?.({ coins: bonusDisponivel, plays: 0 })
  }

  // Escolhe um jogo e mostra a capa (menu com instruções)
  const abrir = (def) => {
    pararContagem()
    setResultado(null)
    setJogo({ def, round: (jogo?.def?.id === def?.id ? jogo.round : 0) + 1 })
    setFase('capa')
  }

  // Contagem regressiva 3-2-1 (parte do clique, não de effect: sem render em cascata)
  const timers = useRef([])
  const pararContagem = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => pararContagem, [])

  const comecar = (def, round) => {
    setPausado(false)
    pararContagem()
    setResultado(null)
    if (def) setJogo((j) => ({ ...j, def, round: round ?? (j?.def?.id === def.id ? j.round : 0) + 1 }))
    setFase('conta')
    setConta(3)
    ;[3, 2, 1].forEach((n, i) => {
      timers.current.push(
        setTimeout(() => {
          if (sfx) sfxBounce()
          if (n > 1) setConta(n - 1)
          else {
            setConta(0)
            setFase('joga')
          }
        }, 620 * (i + 1)),
      )
    })
  }

  const sair = () => {
    setPausado(false)
    pararContagem()
    setJogo(null)
    setResultado(null)
    setFase('lista')
  }

  const terminou = (score, won, motivo = 'tempo') => {
    const def = jogo.def
    const wins = won ? { ...mgWins, [def.id]: (Number(mgWins[def.id]) || 0) + 1 } : mgWins
    if (won) writeLocal('nt.mgWins', wins)
    const proxStats = { plays: (mgStats.plays || 0) + 1, wins: (mgStats.wins || 0) + (won ? 1 : 0) }
    writeLocal('nt.mgStats', proxStats)
    setMgStats(proxStats)
    if (won) setMgWins(wins)
    const moedas = rewardFor(score, def, won)
    const anterior = Number(best[def.id]) || 0
    const novoRecorde = score > anterior
    if (novoRecorde) {
      const next = { ...best, [def.id]: score }
      setBest(next)
      writeLocal('nt.mgBest', next)
    }
    setResultado({
      score,
      max: def.max,
      moedas,
      won,
      novoRecorde,
      recorde: Math.max(score, anterior),
      premio: premioJogo(def.recompensa),
      motivo,
    })
    onFinish?.({ coins: moedas, plays: 1 })
    if (sfx) { setTimeout(won ? sfxHeart : sfxCoin, 140) }
  }

  // Botao "jogar/tentar novamente": pula a capa e vai direto pra contagem
  const reiniciar = () => comecar()

  const Atual = jogo?.def.Play

  return (
    <div className="mg-tela" role="dialog" aria-label="Minigames">
      <header className="mg-top">
        <button className="mg-back" onClick={onBack} aria-label="Voltar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2>🎮 Minigames</h2>
        <div className="mg-top-right">
          <span className="mg-coins">🪙 {Number(stats?.coins) || 0}</span>
        </div>
      </header>

      {/* Conquistas no meio da tela, nao no canto do cabecalho: o trofeu ficava
          grudado na moeda, no alto, longe do olho, e era facil passar por ele. */}
      <div className="mg-trof-centro">
        <button
          className={`mg-trof-pill${mostrandoTrof ? ' is-on' : ''}`}
          onClick={() => setMostrandoTrof((v) => !v)}
          aria-label="Conquistas"
        >
          🏆 Conquistas
        </button>
      </div>

      {fase === 'lista' && (
        <div className="mg-lista">
          <div className={`mg-daily${diarioDisponivel ? ' is-new' : ' is-done'}`}>
            {diarioDisponivel ? (
              <>
                <span className="mg-daily-txt">
                  <b>📅 Bônus do dia</b>
                  <small>streak {proximoStreak} 🔥 · receba <b>+{bonusDisponivel}</b> 🪙</small>
                </span>
                <button className="mg-btn primary mg-daily-btn" onClick={receberDiario}>Receber</button>
              </>
            ) : (
              <span className="mg-daily-txt">
                <b>📅 Bônus do dia recebido</b>
                <small>streak de {diario.n || 0} dias 🔥{diario.pb ? ` · +${diario.pb} hoje` : ''} · volte amanhã!</small>
              </span>
            )}
          </div>
          <p className="mg-sub">Jogue quantas vezes quiser 🐾</p>
          {MINIGAMES.map((g) => (
            <button key={g.id} className="mg-card" style={{ '--gc': g.tone }} onClick={() => abrir(g)}>
              <span className="mg-card-icon">{g.icon}</span>
              <span className="mg-card-info">
                <b>{g.name}</b>
                <small>{g.desc}</small>
                <span className="mg-card-best">
                  🏆 recorde: {best[g.id] ?? 0}/{g.max}{' '}{medalhaDe(best[g.id], g.max)} · {g.rodadas ? `${g.rodadas} rodadas · ` : ''}{g.id === 'notas' ? '10 níveis' : `até ${g.max} acertos`}
                </span>
              </span>
              <span className="mg-card-premio">
                <b>+{premioJogo(g.recompensa)}</b>
                <small>vitória</small>
              </span>
              <span className="mg-card-go">jogar ▶</span>
            </button>
          ))}
        </div>
      )}

      {mostrandoTrof && (
        <div className="mg-trofeus">
          <header className="mg-trof-top">
            <b>🏆 Conquistas</b>
            <button className="mg-trof-x" onClick={() => setMostrandoTrof(false)} aria-label="Fechar">×</button>
          </header>
          <p className="mg-trof-sub">Cada troféu dá moedas na primeira vez que você resgata 🪙</p>
          <div className="mg-trof-grid">
            {TROFEUS.map((t) => {
              const prog = progT(t)
              const pronto = prog >= t.meta
              const got = claims.includes(t.id)
              return (
                <div className={`mg-trofeu${pronto ? ' is-pronto' : ''}${got ? ' is-got' : ''}`} key={t.id}>
                  <span className="mg-trof-ico">{got ? '🏅' : pronto ? '🎁' : '🔒'}</span>
                  <div className="mg-trof-info">
                    <b>{t.nome}</b>
                    <small>{t.desc}</small>
                    <div className="mg-trof-bar"><i style={{ width: `${Math.min(100, (prog / t.meta) * 100)}%` }} /></div>
                    <span className="mg-trof-prog">{Math.min(prog, t.meta)}/{t.meta}</span>
                  </div>
                  {pronto && !got ? (
                    <button className="mg-btn primary mg-trof-btn2" onClick={() => resgatarTrof(t)}>+{t.premio}</button>
                  ) : got ? (
                    <span className="mg-trof-ok">✓</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {jogo && fase === 'capa' && (
        <CapaJogo def={jogo.def} best={best} onStart={() => comecar()} onTrocar={sair} sfx={sfx} />
      )}

      {pausado && fase === 'joga' && !resultado && jogo && (
        <div className="mg-pausa">
          <span className="mg-pausa-emoji">⏸</span>
          <h3>Lá vem o pause!</h3>
          <p>o gatinho tá dormindo um pouquinho… 😴</p>
          <div className="mg-pausa-botoes">
            <button className="mg-btn primary" onClick={() => setPausado(false)}>▶️ Continuar</button>
            <button className="mg-btn ghost" onClick={() => setSomOn((v) => !v)}>
              {somOn !== false ? '🔊 Som ligado' : '🔇 Som desligado'}
            </button>
            <button className="mg-btn ghost" onClick={sair}>Sair do jogo</button>
          </div>
        </div>
      )}

      {jogo && fase === 'conta' && (
        <div className="mg-conta" style={{ '--gc': jogo.def.tone }} key={`conta-${jogo.round}`}>
          <span className="mg-conta-n" key={conta}>{conta > 0 ? conta : 'valendo!'}</span>
          <p className="mg-conta-t">{conta > 0 ? 'prepara o dedo…' : `${jogo.def.objetivo}!`}</p>
        </div>
      )}

      {jogo && fase === 'joga' && !resultado && Atual && (
        <div className="mg-jogo" key={`${jogo.def.id}-${jogo.round}`}>
          <h3 className="mg-jogo-titulo">{jogo.def.icon} {jogo.def.name}</h3>
          <button className="mg-pausar" onClick={() => setPausado(true)} aria-label="Pausar">⏸</button>
          <Atual key={jogo.round} onDone={terminou} sfx={sfx} pausado={pausado} />
        </div>
      )}

      {jogo && resultado && (
        <div className={`mg-resultado ${resultado.won ? 'is-win' : 'is-lose'}`}>
          <span className="mg-res-emoji">{resultado.won ? '🏆' : resultado.score > 0 ? '😿' : '💤'}</span>
          <h3>{resultado.won ? 'Você venceu!' : resultado.motivo === 'espinho' ? 'O espinho te pegou!' : resultado.motivo === 'bomba' ? 'A bomba explodiu!' : 'O tempo acabou!'}</h3>
          <p className="mg-res-msg">
            {resultado.won
              ? 'o gatinho tá orgulhoso de você! 🐾'
              : resultado.motivo === 'espinho'
                ? 'pula mais cedo na próxima! 💪'
                : resultado.motivo === 'bomba'
                  ? 'foge da bomba na próxima! 💪'
                  : 'dá pra melhorar a pontuação, tenta outra vez 💪'}
          </p>
          <p className="mg-res-placar">
            Pontuação: <b>{resultado.score}/{resultado.max}</b>
            {resultado.novoRecorde && <em> · novo recorde! 🏆</em>}
          </p>
          <p className="mg-res-moedas">🪙 +{resultado.moedas} moedas</p>
          {!resultado.won && (
            <p className="mg-res-falta">
              faltou {resultado.max - resultado.score} · vença pra ganhar +{resultado.premio}
            </p>
          )}
          <div className="mg-res-botoes">
            <button className="mg-btn primary" onClick={reiniciar}>
              {resultado.won ? '↻ Jogar novamente' : '↻ Tentar novamente'}
            </button>
            <button className="mg-btn ghost" onClick={sair}>Sair</button>
          </div>
        </div>
      )}
    </div>
  )
}
