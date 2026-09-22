import { memo as reactMemo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { COVERS, featuredCovers } from './data/tracks'
import * as engine from './audio/engine'
import * as graph from './audio/graph'
import { EQ_FREQS } from './audio/graph'
import { ACCENTS, SPEEDS, useSettings, usePetStats } from './settings'
import { PRESETS, useEqualizer } from './audio/equalizer'
import { APP_VERSION, SITE_URL } from './app-config'
import { Share as CapShare } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { resolveAudiusStream, searchAudiusTracks, topTracks } from './online'
import { blobToDataUrl, dataUrlToBlob } from './backup'
import {
  APK_URL,
  fetchLatestVersion,
  installUpdate,
  isNewer,
  markUpdatePrompted,
  notifyUpdateAvailable,
  requestNotificationsPermission,
  wasUpdatePrompted,
} from './updater'
import { readLocal, writeLocal, saveMediaBlobs, loadMediaBlobs, deleteMediaBlobs } from './localstore'
import { ProgressProvider, useProgress } from './progress'
import { importDeviceTrack, scanDeviceTracks } from './mediaImport'
import { updateNowPlaying, hideNowPlaying, onMediaAction } from './mediaNotification'


const IS_NATIVE = !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.())

const LYRICS_CACHE_MAX = 30

function formatTime(sec) {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtSleep(sec) {
  return formatTime(sec)
}

function coverPalette(track) {
  const c = Array.isArray(track?.cover) && track.cover.length ? track.cover : null
  return {
    c1: (c && c[0]) || '#8b5cf6',
    c2: (c && c[1]) || '#2a2450',
    c3: (c && c[2]) || '#c084fc',
  }
}

function sumPlayDays(track, fromMs, toMs) {
  const days = track?.playDays || {}
  let sum = 0
  for (const [key, n] of Object.entries(days)) {
    const ts = Date.parse(key)
    if (!Number.isNaN(ts) && ts >= fromMs && ts <= toMs) sum += n
  }
  return sum
}

function playsInPeriod(track, period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (period === 'week') return sumPlayDays(track, today - 6 * 86400000, now.getTime())
  if (period === 'month')
    return sumPlayDays(track, new Date(now.getFullYear(), now.getMonth(), 1).getTime(), now.getTime())
  if (period === 'year')
    return sumPlayDays(track, new Date(now.getFullYear(), 0, 1).getTime(), now.getTime())
  return track?.plays || 0
}

const PERIOD_LABELS = [
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['year', 'Ano'],
  ['all', 'Tudo'],
]

function nf(n) {
  return new Intl.NumberFormat('pt-BR').format(n || 0)
}

// CHANGELOG: manter no MÁXIMO 4 versões (a mais recente no topo).
// Ao adicionar a próxima versão, REMOVER a mais antiga para entrar a nova.
const CHANGELOG = [
  {
    version: '1.9.18',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'Visual "Design 2.0" cósmico: tema em roxo, rosa, verde e ciano, com o gatinho num habitat novo (pílulas de humor, ilha brilhante e moedas).' },
      { type: 'novo', text: 'Moedas! Você ganha 🪙 ao tocar no seu gatinho e ao ouvir músicas.' },
      { type: 'novo', text: '"Destaques recentes" e o player flutuante com botões de repetir e embaralhar; tocar numa música agora carimba play verde nas capas.' },
      { type: 'melhoria', text: 'Letras com muito mais cobertura: a busca agora consulta dois serviços diferentes e indica quando a letra simples não é sincronizada.' },
      { type: 'melhoria', text: 'App muito mais leve: o relógio da música não obriga mais a tela inteira a se redesenhar a cada segundo, e o fundo cósmico ficou mais barato para o processador.' },
    ],
  },
  {
    version: '1.9.17',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'NebulaTune voltou a ser 100% local: sem login, sem conta e sem nuvem. O app abre direto na música e tudo (músicas, favoritos, playlists, estatísticas, ajustes e seu gatinho) fica guardado SÓ no seu aparelho.' },
      { type: 'melhoria', text: 'Tudo fica salvo de verdade entre uma abertura e outra: agora o aplicativo lembra sua biblioteca, o equalizador, o gatinho e os ajustes mesmo depois de fechar.' },
      { type: 'melhoria', text: 'Sumiu o card de boas-vindas e a área de "Conta e sincronização" das configurações — nada mais de "Sincronizar agora" nem mensagens de nuvem.' },
    ],
  },
  {
    version: '1.9.16',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'Aparelhos sincronizam na hora: o app agora escuta a nuvem em tempo real (Realtime). O que um aparelho grava aparece no outro em segundos, sem aperta-desaperta nada.' },
      { type: 'novo', text: '"Tocando agora" mostra a origem da faixa: ☁️ Nuvem (enviada pelo site/conta) ou 📁 Meus Arquivos (só deste aparelho).' },
      { type: 'novo', text: 'Letra escolhida manualmente é salva na sua conta: os outros aparelhos recebem a letra sem precisar procurar de novo.' },
      { type: 'melhoria', text: 'Card de conta: sumiu a mensagem "ainda não batem". Agora mostra "✅ Dados 100% sincronizados" quando tudo bate, ou "Salvando automaticamente…" nos segundos em que os últimos ajustes sobem sozinhos.' },
      { type: 'correcao', text: 'Realtime usa o mesmo SQL de sempre: rodar o supabase/setup.sql de novo habilita o canal e cria a tabela de letras (é seguro repetir).' },
    ],
  },
  {
    version: '1.9.15',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Áudio AGORA sobe de verdade para a conta: as músicas entram no banco com o arquivo de som (antes só a linha ia — a música chegava sem som em outro aparelho).' },
      { type: 'correcao', text: 'Exclusão também apaga o arquivo de som da nuvem (antes só a linha sumia, o arquivo sobrava ocupando espaço).' },
      { type: 'novo', text: 'Tabela de dados do usuário + gatilho automático no cadastro por e-mail/senha (SQL novo em supabase/setup.sql).' },
    ],
  },
]

function Cover({ colors, image, size = 40, radius = 8 }) {
  const [c1, c2, c3] =
    Array.isArray(colors) && colors.length ? colors : ['#6b5bd6', '#2a2450', '#b9a7ff']
  if (image) {
    return (
      <span
        className="cover cover-img"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
        }}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }}
        />
      </span>
    )
  }
  return (
    <span
      className="cover"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `radial-gradient(circle at 30% 25%, ${c3}33 0%, transparent 42%), radial-gradient(circle at 70% 75%, ${c1} 0%, ${c2} 120%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), 0 4px 12px ${c2}55`,
      }}
    >
      <span className="cover-star" style={{ left: '30%', top: '25%', background: c3 }} />
      <span className="cover-star" style={{ left: '72%', top: '62%', background: c3 }} />
    </span>
  )
}

const random = (a, b) => a + Math.random() * (b - a)

const PET_GREETINGS = [
  () => 'Sua biblioteca está vazia! Adicione algumas músicas para começarmos. ✨',
  (n) => (n ? `Olá, ${n}! ✨` : 'Olá! ✨'),
  (n) => (n ? `Oi, ${n}! Tudo bem? 🐾` : 'Oi! Tudo bem? 🐾'),
  (n) => (n ? `Opa, ${n}! Que bom te ver! 💜` : 'Opa! Que bom te ver! 💜'),
  (n) => (n ? `${n}, bora ouvir um som? 🎶` : 'Bora ouvir um som? 🎶'),
  (n) => (n ? `E aí, ${n}! Pronto pra curtir? ✨` : 'E aí! Pronto pra curtir? ✨'),
  (n) => (n ? `${n}, você chegou! 🥰` : 'Você chegou! 🥰'),
  () => 'Tava te esperando! 😻',
  () => 'Me dá um toque pra eu ronronar. 🐱',
  () => 'Bora cantar junto? 🎤',
  () => 'Hoje o clima tá perfeito pra uma música boa! 🌙',
  () => 'Que tal explorar aquele equalizador? 🎛️',
]

function PetFriend({
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
          heart: ['adoro!', 'coraçãozinho pra ela!', 'essa entra na lista!', 'que fofo!'],
          scared: ['ih!', 'que susto!'],
          angry: ['grr...', 'não gostei!', 'fica quieto!'],
          roulette: ['sorte!', 'rumo ao aleatório!'],
          cuddle: ['hehe...', 'que bom!', 'mais!'],
          return: ['oi de novo!', 'senti tua falta!', 'cadê você?'],
        }
        say(P[phrasePool][Math.floor(Math.random() * P[phrasePool].length)], Math.min(3000, ms + 1200))
      }
      if (ms) burstT.current = setTimeout(() => setBurst(''), ms)
    },
    [say],
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
      alegre: ['que alegria!', 'essa música é linda!', 'tô feliz!'],
      dancante: ['no ritmo!', 'bom de dançar!', 'que muda!'],
      hype: ['agito total!', 'isso!', 'uauuu!', 'energia!'],
    }
    const pool = phrases[mood] || ['que música!']
    say(pool[Math.floor(Math.random() * pool.length)], 2600)
  }, [mood, playing, say])

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
          const boredPhrases = ['que tédio...', 'vem brincar...', 'alguém aí?', 'tão quieto...']
          say(boredPhrases[Math.floor(Math.random() * boredPhrases.length)], 2400)
        }
        const playOpts = ['sing', 'dance', 'hype', 'sing', 'dance', 'hop', 'sing', 'hype']
        if (heavy) playOpts.push('headbang', 'headbang')
        if (mood === 'hype') playOpts.splice(0, playOpts.length, 'hype', 'headbang', 'hype', 'sing', 'dance', 'hype')
        else if (mood === 'dancante') playOpts.push('dance', 'dance', 'twirl', 'sing')
        else if (mood === 'alegre') playOpts.push('sing', 'hop', 'twirl', 'dance')
        else if (mood === 'calmo') playOpts.push('glint', 'look', 'sing', 'sing')
        else if (mood === 'triste') playOpts.splice(0, playOpts.length, 'sing', 'look', 'walk', 'glint', 'sing')
        const idleOpts = ['walk', 'twirl', 'glint', 'hop', 'look', 'wiggle', 'stretch', 'sleep', 'sleep', 'glint', 'curious']
        if (bored) idleOpts.push('curious', 'curious', 'curious', 'walk', 'walk')
        if (sleepMode) idleOpts.push('sleep', 'yawn')
        if (hour >= 22 || hour < 6) idleOpts.push('sleep', 'sleep', 'yawn')
        if (hour >= 6 && hour < 12) idleOpts.push('stretch', 'glint')
        if (hour >= 12 && hour < 19) idleOpts.push('twirl', 'glint', 'glint')
        if (hour >= 19 && hour < 23) idleOpts.push('yawn', 'sleep')
        const moodPools = {
          triste: ['que triste...', 'essa música é melancólica...', 'sinto muito...', 'hmm...'],
          calmo: ['que calmaria...', 'relaxando...', 'suave...'],
          alegre: ['que alegria!', 'essa música é linda!', 'tô feliz!'],
          dancante: ['no ritmo!', 'bom de dançar!', 'que muda!'],
          hype: ['agito total!', 'isso!', 'uauuu!', 'energia!'],
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
          { sing: 4600, dance: 3200, hype: 3200, sleep: 3000, walk: 5600, twirl: 1500, glint: 2200, curious: 4600, yawn: 2600, headbang: 2400 }[pick] ??
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
              }
              const pool = pools[pick]
                ? pools[pick]
                : playing
                  ? moodPools[mood] ||
                    ['que música boa!', 'essa é top!', 'meu som!', 'curtindo!', 'no beat!', 'uuuu!']
                  : ['oi!', 'e aí?!', 'tô de boa...', 'que legal!', 'ué?', 'nossa, quanta música!', 'óia eu!', 'hehe']
              say(pool[Math.floor(Math.random() * pool.length)], 2600)
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
  }, [playing, heavy, sleepMode, hour, say, mood])

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

function PetHabitatCard({ greeting, greetMs = 4800, stats, onShowProfile = null, ...pet }) {
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
        <span className="pet-habitat-title">✦ Pet Habitat</span>
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
        <PetFriend {...pet} size={148} greetOnMount={greeting} greetOnMountMs={greetMs} />
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

function MusicRow({ title, tracks, onPlay }) {
  if (!tracks || tracks.length === 0) return null
  return (
    <div className="music-row">
      <h2 className="section-title">{title}</h2>
      <div className="music-row-track">
        {tracks.map((t) => (
          <button className="music-card" key={t.id} onClick={() => onPlay(t.id)} tabIndex={0}>
            <span className="music-card-cover">
              <Cover colors={t.cover} image={t.coverUrl} size={112} radius={16} />
              <span className="music-card-play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            <span className="music-card-title">{t.title}</span>
            <span className="music-card-artist">{t.artist || '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
MusicRow = reactMemo(MusicRow)

function QuickTrackGrid({ tracks, onPlay }) {
  if (!tracks || tracks.length === 0) return null
  return (
    <div className="quick-section">
      <h2 className="section-title">Destaques recentes</h2>
      <div className="quick-grid">
        {tracks.map((t) => (
          <button className="quick-card" key={t.id} onClick={() => onPlay(t.id)} tabIndex={0}>
            <span className="quick-cover">
              <Cover colors={t.cover} image={t.coverUrl} size={48} radius={12} />
            </span>
            <span className="quick-meta">
              <span className="quick-title">{t.title}</span>
              <span className="quick-artist">{t.artist || '—'}</span>
            </span>
            <span className="quick-play">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
QuickTrackGrid = reactMemo(QuickTrackGrid)

function Sidebar({ view, setView, onPickFiles }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Cover colors={featuredCovers[0]} size={36} radius={10} />
        <span className="brand-name">Nebula<span>Tune</span></span>
      </div>

      <nav className="nav">
        <button className={`nav-item ${view === 'inicio' ? 'active' : ''}`} onClick={() => setView('inicio')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" />
          </svg>
          Início
        </button>
        <button className={`nav-item ${view === 'buscar' ? 'active' : ''}`} onClick={() => setView('buscar')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          Buscar
        </button>
        <button className={`nav-item ${view === 'perfil' ? 'active' : ''}`} onClick={() => setView('perfil')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Perfil
        </button>
        <button className={`nav-item ${view === 'biblioteca' ? 'active' : ''}`} onClick={() => setView('biblioteca')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Sua Biblioteca
        </button>
        <button className={`nav-item ${view === 'favoritas' ? 'active' : ''}`} onClick={() => setView('favoritas')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Favoritas
        </button>
        <button className={`nav-item ${view === 'online' ? 'active' : ''}`} onClick={() => setView('online')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
          </svg>
          Online
        </button>
        <button className={`nav-item ${view === 'equalizador' ? 'active' : ''}`} onClick={() => setView('equalizador')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
            <path d="M1 14h6M9 8h6M17 16h6" />
          </svg>
          Equalizador
        </button>
        <button className={`nav-item ${view === 'configuracoes' ? 'active' : ''}`} onClick={() => setView('configuracoes')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Configurações
        </button>
      </nav>

      <button className="add-files" onClick={onPickFiles}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Adicionar músicas
      </button>

      <div className="playlists">
        <p className="section-label">DICA</p>
        <p className="sidebar-hint">
          Arraste arquivos de música para qualquer lugar da tela ou use o botão acima.
        </p>
      </div>

      <div className="sidebar-footer">
        <span>♫ Sua música, no cosmos</span>
        <span className="sidebar-version">NebulaTune v{APP_VERSION}</span>
        <a className="sidebar-download" href="./apk/nebulatune.apk" download="NebulaTune.apk">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Baixar o aplicativo
        </a>
      </div>
    </aside>
  )
}

const BG_STARS = Array.from({ length: 130 }, (_, i) => {
  const x = (i * 137.508 + 17) % 100
  const y = (i * 97.31 + 21) % 100
  const size = 1 + (i % 5) * 0.6
  return { x, y, size, delay: (i * 0.19) % 5.5, dur: 2.2 + (i % 4) * 1.4 }
})

function SpaceParticles({ count = 26 }) {
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

    const resize = () => {
      cv.width = Math.max(1, Math.round(cv.clientWidth * dpr))
      cv.height = Math.max(1, Math.round(cv.clientHeight * dpr))
    }

    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight)
      const w = cv.clientWidth
      const h = cv.clientHeight
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

function BackgroundFX({ bgAnimated, cosmosAnimated }) {
  if (!bgAnimated) return null
  const stars = IS_NATIVE ? BG_STARS.slice(0, 42) : BG_STARS
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
      <SpaceParticles count={IS_NATIVE ? 14 : 26} />
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

function Profile({ settings, api, library, onPlay, petStats }) {
  const avatarInputRef = useRef(null)
  const [statsPeriod, setStatsPeriod] = useState('week')

  const displayName = settings.userName.trim() || 'Seu nome'

  const initials = settings.userName
    ? settings.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'NT'
    : 'NT'

  const handleAvatar = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => api.setAvatar(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const mostPlayed = library
    .filter((t) => playsInPeriod(t, statsPeriod) > 0)
    .sort((a, b) => playsInPeriod(b, statsPeriod) - playsInPeriod(a, statsPeriod))

  const totalPlaysPeriod = mostPlayed.reduce((acc, t) => acc + playsInPeriod(t, statsPeriod), 0)

  return (
    <section className="view">
      <h1 className="greeting">Perfil</h1>

      <div className="settings-card profile-avatar-card">
        <div className="profile-photo-block">
          <div className="profile-avatar-wrap">
            {settings.avatar ? (
              <img className="profile-avatar" src={settings.avatar} alt="Foto de perfil" />
            ) : (
              <div className="profile-avatar profile-avatar-placeholder">{initials}</div>
            )}
          </div>
          <div className="profile-avatar-actions">
            <button className="btn-primary" onClick={() => avatarInputRef.current?.click()}>
              {settings.avatar ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {settings.avatar && (
              <button className="btn-ghost" onClick={() => api.setAvatar('')}>
                Remover foto
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleAvatar}
          />
        </div>
        <div className="profile-identity">
          <span className="profile-identity-name">{displayName}</span>
          <span className="profile-identity-sub">
            {settings.avatar ? 'Seu perfil no NebulaTune' : 'Adicione uma foto e um nome para completar seu perfil'}
          </span>
          <textarea
            className="profile-bio"
            value={settings.bio || ''}
            onChange={(e) => api.setBio(e.target.value)}
            placeholder="Escreva uma descrição sobre você…"
            maxLength={160}
            rows={2}
            aria-label="Descrição do perfil"
          />
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Nome</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Seu nome</span>
            <span className="settings-desc">Aparece no botão, na saudação e no perfil.</span>
          </div>
          <input
            className="settings-input"
            value={settings.userName}
            onChange={(e) => api.setUserName(e.target.value)}
            placeholder="Seu nome"
            maxLength={24}
          />
        </div>
      </div>

      {petStats && (
        <div className="settings-card">
          <h2 className="section-title">Seu gatinho 🐾</h2>
          <div className="pet-mood-line">
            {petStats.touches > 15 && petStats.hearts > 4
              ? 'Muito mimado — vive no carinho!'
              : petStats.sleeps > 10
                ? 'Dorminhoco profissional!'
                : petStats.scares > 3
                  ? 'Leva susto, mas continua sorrindo!'
                  : 'Feliz no seu cantinho. 🐱'}
          </div>
          {library.some((t) => t.fav) && (
            <div className="pet-fav-row">
              <span className="pet-fav-label">Favoritas dele:</span>
              <div className="pet-cover-row">
                {library
                  .filter((t) => t.fav)
                  .slice(0, 8)
                  .map((t) => (
                    <Cover key={t.id} colors={t.cover} image={t.coverUrl} size={34} radius={9} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="settings-card">
        <h2 className="section-title">Cor de destaque</h2>
        <div className="settings-row">
          <div className="swatch-grid">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <button
                key={key}
                className={`swatch ${settings.accent === key ? 'active' : ''}`}
                style={{ '--sw': a.accent }}
                onClick={() => api.setAccent(key)}
                title={a.name}
                aria-label={a.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Estatísticas de reprodução</h2>
        <div className="settings-row">
          <div className="stats-tabs" role="tablist" aria-label="Período das estatísticas">
            {PERIOD_LABELS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={statsPeriod === key}
                className={`stats-tab ${statsPeriod === key ? 'active' : ''}`}
                onClick={() => setStatsPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="stats-summary">
          <span>
            <strong>{nf(totalPlaysPeriod)}</strong> reproduções {statsPeriod === 'all' ? 'no total' : `neste ${statsPeriod === 'week' ? 'período' : statsPeriod}`}
          </span>
        </div>
        <div className="settings-row">
          <h3 className="stats-list-title">
            Mais tocadas{statsPeriod === 'all' ? '' : ` na ${PERIOD_LABELS.find(([k]) => k === statsPeriod)?.[1]?.toLowerCase()}`}
          </h3>
          {mostPlayed.length ? (
            <div className="most-played">
              {mostPlayed.map((t, i) => {
                const n = playsInPeriod(t, statsPeriod)
                return (
                  <button key={t.id} className="most-played-row" onClick={() => onPlay?.(t.id)}>
                    <span className="most-played-num">{i + 1}</span>
                    <Cover colors={t.cover} image={t.coverUrl} size={38} />
                    <span className="most-played-main">
                      <span className="track-title">{t.title}</span>
                      <span className="track-artist">{t.artist}</span>
                    </span>
                    <span className="most-played-count">
                      {n} {n === 1 ? 'vez' : 'vezes'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="settings-desc">As músicas que você mais tocar vão aparecendo aqui.</p>
          )}
        </div>
      </div>
    </section>
  )
}

const TrackList = reactMemo(function TrackList({
  tracks,
  currentId,
  onSelect,
  onRemove,
  onToggleFavorite,
  onQueueNext,
  onQueueAdd,
  onSearchOnline,
  onEdit,
  onShare,
  onOpenSource,
  onAddToPlaylist,
}) {
  const [openMenu, setOpenMenu] = useState(null)
  const [menuPos, setMenuPos] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!openMenu) return undefined
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [openMenu])

  const closeMenu = () => setOpenMenu(null)
  const toggleMenu = (t, e) => {
    if (openMenu === t) {
      setOpenMenu(null)
      return
    }
    const r = e?.currentTarget?.getBoundingClientRect()
    if (r) {
      const vw = window.innerWidth || 0
      const vh = window.innerHeight || 0
      const up = r.bottom + 4 + 300 > vh
      setMenuPos({
        left: Math.max(8, Math.min(r.right - 4, vw - 230)),
        top: up ? Math.max(8, r.top - 4) : r.bottom + 4,
        up,
      })
    } else {
      setMenuPos(null)
    }
    setOpenMenu(t)
  }

  return (
    <div className="track-list">
      {tracks.map((t, i) => (
        <div
          key={t.id}
          className={`track-row ${t.id === currentId ? 'active' : ''}`}
          onDoubleClick={() => onSelect(t.id)}
        >
          <span className="track-num">
              {t.id === currentId ? (
                <span className="track-eq" aria-label="Tocando agora">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                i + 1
              )}
            </span>
          <Cover colors={t.cover} image={t.coverUrl} size={40} />
          <div className="track-main">
            <span className="track-title">{t.title}</span>
            <span className="track-artist">{t.artist}</span>
          </div>
          <span className="track-album">{t.album}</span>
          {t.audioMissing && (
            <span
              className="track-noaudio"
              title="Esta música está na sua conta, mas o arquivo de som ainda não desceu para este aparelho"
            >
              sem áudio
            </span>
          )}
          <span className="track-duration">{t.duration ? formatTime(t.duration) : '--:--'}</span>
          {onToggleFavorite && (
            <button
              className={`row-fav ${t.fav ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(t.id)
              }}
              aria-label={t.fav ? 'Desfavoritar' : 'Favoritar'}
              aria-pressed={t.fav}
            >
              {t.fav ? (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
            </button>
          )}
          {onRemove && (
            <button
              className="row-remove"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(t.id)
              }}
              aria-label="Remover"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
          <button
            className={`row-more ${openMenu === t.id ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleMenu(t.id, e)
            }}
            aria-label="Mais opções"
            aria-expanded={openMenu === t.id}
            title="Mais opções"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            </svg>
          </button>
          <button
            className="row-play"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(t.id)
            }}
            aria-label="Tocar"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          {openMenu === t.id &&
            menuPos &&
            createPortal(
              <div
                className={`row-menu ${menuPos.up ? 'up' : ''}`}
                style={{ left: menuPos.left, top: menuPos.top }}
                ref={menuRef}
              >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onShare?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                  <path d="m16 6-4-4-4 4" />
                  <path d="M12 2v13" />
                </svg>
                Compartilhar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onQueueNext?.(t.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 5v14l11-7z" />
                  <path d="M13 2v5" />
                </svg>
                Tocar a seguir
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onQueueAdd?.(t.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 6h13M8 12h13M8 18h13" />
                  <path d="M3 6h.01M3 12h.01M3 18h.01" />
                  <path d="M18 9v6M15 12h6" />
                </svg>
                Adicionar à fila
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onAddToPlaylist?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h7M13.5 6h7.5" />
                  <path d="M3 12h7M13.5 12h7.5" />
                  <path d="M3 18h7M10 18h4" />
                  <path d="M18 15v6M15 18h6" />
                </svg>
                Adicionar à playlist
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onSearchOnline?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Buscar no Online
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                  onEdit?.(t)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Editar informações
              </button>
              {onOpenSource && t.externalUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeMenu()
                    onOpenSource(t.externalUrl)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                  </svg>
                  Abrir página original
                </button>
              )}
              {onRemove && (
                <button
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeMenu()
                    onRemove(t.id)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Remover da biblioteca
                </button>
              )}
              </div>,
              document.body,
            )}
        </div>
      ))}
    </div>
  )
})

function TrackEdit({ track, onSave, onClose }) {
  const [title, setTitle] = useState(track.title || '')
  const [artist, setArtist] = useState(track.artist || '')
  const [album, setAlbum] = useState(track.album || '')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    onSave({
      title: title.trim() || track.title || 'Desconhecida',
      artist: artist.trim() || track.artist || 'Desconhecido',
      album: album.trim() || track.album || '',
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Editar informações</h3>
        <form onSubmit={submit}>
          <label className="modal-field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="modal-field">
            <span>Artista</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} />
          </label>
          <label className="modal-field">
            <span>Álbum</span>
            <input value={album} onChange={(e) => setAlbum(e.target.value)} maxLength={120} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NameModal({ title, initial = '', placeholder, onSave, onClose }) {
  const [v, setV] = useState(initial)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    const n = v.trim()
    if (!n) return
    onSave(n)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <form onSubmit={submit}>
          <label className="modal-field">
            <span>{placeholder || 'Nome'}</span>
            <input value={v} onChange={(e) => setV(e.target.value)} maxLength={60} autoFocus />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={!v.trim()}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChangelogModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal changelog-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Novidades e correções</h3>
        <div className="changelog-list">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-head">
                <span className="changelog-version">Versão {entry.version}</span>
                <span className="changelog-date">{entry.date}</span>
              </div>
              <ul className="changelog-items">
                {entry.items.map((item, i) => (
                  <li key={i} className={`changelog-item ${item.type}`}>
                    <span className="changelog-tag">
                      {item.type === 'correcao' ? 'Correção' : 'Novo'}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

function PlaylistPicker({ playlists, track, onCreate, onAdd, onClose }) {
  const [name, setName] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !track) return
    const id = onCreate(n)
    if (id) onAdd(id, track.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Adicionar à playlist</h3>
        {track && (
          <p className="modal-text">
            {track.title} — {track.artist}
          </p>
        )}
        <form onSubmit={submit} className="playlist-new-form">
          <label className="modal-field">
            <span>Nova playlist</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da nova playlist" maxLength={60} autoFocus />
          </label>
          <button className="btn-primary" type="submit" disabled={!name.trim()}>
            Criar e adicionar
          </button>
        </form>
        <div className="playlist-picker-list">
          {playlists.length === 0 && (
            <p className="modal-text">Você ainda não tem playlists.</p>
          )}
          {playlists.map((p) => (
            <button key={p.id} className="playlist-picker-row" onClick={() => { onAdd(p.id, track.id); onClose() }}>
              <span className="playlist-picker-name">{p.name}</span>
              <span className="playlist-picker-count">{p.trackIds.length} músicas</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function TrackPicker({ tracks, playlist, onAdd, onAddMany, onClose }) {
  const options = (tracks || []).filter(
    (t) => !playlist?.trackIds?.includes(t.id),
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Adicionar música a {playlist?.name || 'playlist'}</h3>
        {options.length > 0 && (
          <button className="btn-ghost" onClick={() => onAddMany?.(playlist.id, options.map((t) => t.id))}>
            Adicionar todas ({options.length})
          </button>
        )}
        <div className="playlist-picker-list track-picker-list">
          {options.length === 0 && (
            <p className="modal-text">Todas as músicas já estão nesta playlist.</p>
          )}
          {options.map((t) => (
            <button key={t.id} className="playlist-picker-row" onClick={() => onAdd(playlist.id, t.id)}>
              <Cover colors={t.cover} image={t.coverUrl} size={36} radius={7} />
              <span className="playlist-picker-name">{t.title}</span>
              <span className="playlist-picker-count">{t.artist}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function DeviceImport({ tracks, selection, onToggle, onSelectAll, importing, onImport, onClose }) {
  const selCount = Object.values(selection).filter(Boolean).length
  const list = tracks || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal device-import-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Músicas do aparelho</h3>
        <p className="modal-text">
          {list.length} {list.length === 1 ? 'música encontrada' : 'músicas encontradas'}. Selecione as que deseja importar.
        </p>
        <div className="device-import-controls">
          <label className="device-import-all">
            <input
              type="checkbox"
              checked={list.length > 0 && selCount === list.length}
              onChange={(e) => onSelectAll(e.target.checked)}
            />
            Selecionar todas ({list.length})
          </label>
          <span className="device-import-count">{selCount} selecionadas</span>
        </div>
        <div className="playlist-picker-list device-import-list">
          {list.length === 0 && (
            <p className="modal-text">Nenhuma música encontrada no aparelho.</p>
          )}
          {list.map((t) => (
            <button key={t.id} className="playlist-picker-row" onClick={() => onToggle(t.id)}>
              <input
                type="checkbox"
                checked={!!selection[t.id]}
                onChange={() => onToggle(t.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="playlist-picker-name">{t.title}</span>
              <span className="playlist-picker-count">
                {t.artist}
                {t.duration ? ` · ${formatTime(t.duration)}` : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" disabled={importing} onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={importing || selCount === 0} onClick={onImport}>
            {importing ? 'Importando…' : `Importar${selCount ? ` ${selCount}` : ''} música${selCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayerBar({ track, playing, onToggle, onNext, onPrev, onSeek, onOpen, fav = false, onToggleFavorite, onOpenQueue, isOnline = false, sleepMode = null, sleepRemaining = null, onCancelSleep, shuffle = false, repeat = 0, onToggleShuffle = null, onCycleRepeat = null }) {
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const pct = Math.round((progress || 0) * 100)
  const barRef = useRef(null)
  const draggingRef = useRef(false)

  const ratioFromEvent = (e) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onBarDown = (e) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onBarMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
  }
  const onBarUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    onSeek(ratioFromEvent(e))
  }

  return (
    <footer className="player">
      <div className="player-track">
        <button className="player-open" onClick={onOpen} aria-label="Abrir tela de reprodução">
          <Cover colors={track.cover} image={track.coverUrl} size={48} radius={9} />
          <div className="player-meta">
            <span className="player-title">{track.title}</span>
            <span className="player-artist">{track.artist}</span>
          </div>
          <svg className="player-open-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m18 15-6-6-6 6" />
          </svg>
          <button className="icon-btn player-cast" aria-label="Transmitir" title="Transmitir para outro aparelho" hidden={isOnline}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 16.1A5 5 0 0 1 5.9 20" />
              <path d="M2 12.05A9 9 0 0 1 9.95 20" />
              <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
              <circle cx="2" cy="20" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </button>
        <button
          className={`icon-btn ${fav ? 'fav-on' : ''}`}
          aria-label={fav ? 'Desfavoritar' : 'Curtir'}
          aria-pressed={fav}
          onClick={onToggleFavorite}
          hidden={isOnline}
        >
          {fav ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )}
        </button>
      </div>

      <div className="player-controls">
        <div className="controls-row">
          {!isOnline && (
            <button
              className={`icon-btn ${shuffle ? 'ctl-on' : ''}`}
              aria-label="Aleatório"
              title="Modo aleatório"
              aria-pressed={shuffle}
              onClick={onToggleShuffle}
            >
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
            </button>
          )}
          <button className="icon-btn" onClick={onPrev} aria-label="Anterior" disabled={isOnline}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>
          <button className={`play-btn ${playing ? 'paused' : ''}`} onClick={onToggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button className="icon-btn" onClick={onNext} aria-label="Próxima" disabled={isOnline}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.86L12.03 12 8 14.86V9.14zM16 6h2v12h-2z" /></svg>
          </button>
          {!isOnline && (
            <button
              className={`icon-btn ${repeat > 0 ? 'ctl-on' : ''}`}
              aria-label="Repetir"
              title={`Repetir: ${repeat === 1 ? 'uma música' : repeat === 2 ? 'tudo' : 'desligado'}`}
              aria-pressed={repeat > 0}
              onClick={onCycleRepeat}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
              {repeat === 1 && <span className="rep-one-dot" />}
            </button>
          )}
        </div>
        <div className="progress-row">
          <span className="time">{formatTime(elapsed)}</span>
          <div
            className="progress"
            ref={barRef}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerCancel={onBarUp}
          >
            <div className="progress-inner" style={{ width: `${pct}%` }} />
          </div>
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        {sleepMode && onCancelSleep && (
          <button
            className="icon-btn np-sleep-mini"
            aria-label="Tirar o timer de desligar"
            title={`Timer de desligar ativo${sleepMode === 'end' ? '' : ` (${fmtSleep(sleepRemaining)})`} — toque para cancelar`}
            onClick={onCancelSleep}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19.6 16.7A8.5 8.5 0 0 0 7.3 4.4a7 7 0 1 1-1.7 13.7l1.2-.9a5.4 5.4 0 1 0 1.5-8.3 8.5 8.5 0 0 0 11.3 7.8z" />
              <path d="M12 7v5l3 2" />
              <path d="M12.3 3.2 13 1.5M9.4 4 8 2.9" />
            </svg>
            {sleepMode !== 'end' && sleepRemaining != null && (
              <span className="np-sleep-mini-time">{fmtSleep(sleepRemaining)}</span>
            )}
          </button>
        )}
        <button className="icon-btn" aria-label="Fila" title="Fila" onClick={onOpenQueue} hidden={isOnline}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </button>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
        <div className="progress progress-slim">
          <div className="progress-inner" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </footer>
  )
}
PlayerBar = reactMemo(PlayerBar)

function NowPlaying({
  track,
  playing,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onClose,
  repeat,
  shuffle,
  onCycleRepeat,
  onToggleShuffle,
  lyrics,
  syncOffset = 0,
  onSync,
  onAlign,
  onSearchLyrics,
  onPickLyrics,
  eq,
  fav = false,
  onToggleFavorite,
  onOpenQueue,
  speed = 1,
  onSetSpeed,
  depth = '',
  onSetDepth,
  isOnline = false,
  sleepMode = null,
  sleepRemaining = null,
  onStartSleep,
  onCancelSleep,
  eqEnabled = false,
  eqPreset = 'flat',
  favPing = 0,
  trackId = null,
  soundOn = true,
  cheer = null,
  idleSinceRef = null,
  onPetAction = null,
  mood = 'neutral',
}) {
  const barRef = useRef(null)
  const draggingRef = useRef(false)
  const activeRef = useRef(null)
  const depthMenuRef = useRef(null)
  const menuRef = useRef(null)
  const lyricsRef = useRef(null)
  const sleepMenuRef = useRef(null)
  const [dragRatio, setDragRatio] = useState(null)
  const [showEq, setShowEq] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [depthOpen, setDepthOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)
  const palette = coverPalette(track)

  const runSearch = (q) => {
    setSearching(true)
    Promise.resolve(onSearchLyrics?.(q)).then((list) => {
      setResults(list || [])
      setSearching(false)
    })
  }

  const openSearch = () => {
    const q = [cleanArtist(track.artist), cleanTitle(track.title)].filter(Boolean).join(' ')
    setQuery(q)
    setResults([])
    setSearchOpen(true)
    if (q) runSearch(q)
  }

  const pickResult = (item) => {
    onPickLyrics?.(item)
    setSearchOpen(false)
  }

  const lines = lyrics?.status === 'done' ? lyrics.lines : []
  const synced = !!lyrics?.synced
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const lyricTrans = useLyricsTranslation(lines)
  const lyricTime = elapsed - syncOffset
  let activeIndex = -1
  if (synced && lines.length) {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].time <= lyricTime + 0.25) activeIndex = i
      else break
    }
  }

  useEffect(() => {
    const box = lyricsRef.current
    if (activeIndex < 0 || !box) return
    const line = box.querySelectorAll('.np-lyric')[activeIndex]
    if (!line) return
    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeIndex])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (sleepOpen && !isOnline) setSleepOpen(false)
        else if (menuOpen) setMenuOpen(false)
        else if (showEq) setShowEq(false)
        else if (depthOpen) setDepthOpen(false)
        else onClose()
        return
      }
      const tag = e.target?.tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') return
      if (e.key === ' ') {
        e.preventDefault()
        onToggle()
      }
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, onToggle, onNext, onPrev, searchOpen, menuOpen, showEq, depthOpen, sleepOpen, isOnline])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  useEffect(() => {
    if (searchOpen && lyricsRef.current) lyricsRef.current.scrollTop = 0
  }, [searchOpen])

  useEffect(() => {
    if (!depthOpen) return
    const onDown = (e) => {
      if (depthMenuRef.current && !depthMenuRef.current.contains(e.target)) setDepthOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [depthOpen])

  useEffect(() => {
    if (!sleepOpen) return
    const onDown = (e) => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target)) setSleepOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [sleepOpen])

  const pickDepth = (v) => {
    onSetDepth?.(v)
    setDepthOpen(false)
  }

  const ratioFromX = (clientX) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragRatio(ratioFromX(e.clientX))
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
    setDragRatio(ratioFromX(e.clientX))
  }
  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const r = Math.min(0.999, ratioFromX(e.clientX))
    setDragRatio(null)
    onSeek(r)
  }

  const shown = dragRatio !== null ? dragRatio : progress || 0
  const shownTime = dragRatio !== null ? dragRatio * (duration || 0) : elapsed

  return (
    <div
      className={`now-playing ${searchOpen ? 'searching' : ''}`}
      style={{ '--npc1': palette.c1, '--npc2': palette.c2, '--npc3': palette.c3 }}
    >
      <NowParticles />
      <div className="np-top">
        <button className="np-close" onClick={onClose} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="np-heading">Tocando agora</span>
        <div className="np-top-right">
          <button
            className={`np-close np-fav-btn ${fav ? 'on' : ''}`}
            onClick={() => onToggleFavorite?.(track.id)}
            aria-label={fav ? 'Desfavoritar' : 'Favoritar'}
            aria-pressed={fav}
            title={fav ? 'Desfavoritar' : 'Favoritar'}
            hidden={isOnline}
          >
            {fav ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          </button>
          {!isOnline && (
            <div className={`np-sleep-wrap ${sleepOpen ? 'open' : ''}`} ref={sleepMenuRef}>
              <button
                className={`np-close np-sleep-btn ${sleepMode ? 'on' : ''}`}
                onClick={() => setSleepOpen((v) => !v)}
                aria-label="Timer de desligar"
                aria-expanded={sleepOpen}
                title="Timer de desligar"
              >
                {sleepMode ? (
                  <span className="np-sleep-pill">
                    {sleepMode === 'end' ? 'fim' : fmtSleep(sleepRemaining)}
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19.6 16.7A8.5 8.5 0 0 0 7.3 4.4a7 7 0 1 1-1.7 13.7l1.2-.9a5.4 5.4 0 1 0 1.5-8.3 8.5 8.5 0 0 0 11.3 7.8z" />
                    <path d="M12 7v5l3 2" />
                    <path d="M12.3 3.2 13 1.5M9.4 4 8 2.9" />
                  </svg>
                )}
              </button>
              {sleepOpen && (
                <div className="np-sleep-menu" role="menu">
                  <span className="np-sleep-title">Parar depois de</span>
                  {[10, 20, 30, 60].map((m) => (
                    <button
                      key={m}
                      className={`np-sleep-opt ${sleepMode === String(m) ? 'active' : ''}`}
                      onClick={() => {
                        onStartSleep?.(m)
                        setSleepOpen(false)
                      }}
                    >
                      {m} minutos
                    </button>
                  ))}
                  <button
                    className={`np-sleep-opt ${sleepMode === 'end' ? 'active' : ''}`}
                    onClick={() => {
                      onStartSleep?.('end')
                      setSleepOpen(false)
                    }}
                  >
                    Final desta música
                  </button>
                  {sleepMode && (
                    <button
                      className="np-sleep-opt np-sleep-cancel"
                      onClick={() => {
                        onCancelSleep?.()
                        setSleepOpen(false)
                      }}
                    >
                      Cancelar timer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!isOnline && (
            <div className="np-menu-wrap" ref={menuRef}>
            <button
              className={`np-close np-menu-btn ${menuOpen ? 'active' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Menu"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <circle cx="12" cy="5" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
            {menuOpen && (
              <div className="np-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenQueue?.()
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 6h13M8 12h13M8 18h13" />
                    <path d="M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                  Fila de reprodução
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowEq(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                    <path d="M1 14h6M9 8h6M17 16h6" />
                  </svg>
                  Equalizador
                </button>
              </div>
            )}
          </div>
          )}
          {!isOnline && (
            <button
              className={`np-close np-eq-btn ${showEq ? 'active' : ''} ${eq?.settings?.enabled ? 'eq-on' : ''}`}
              onClick={() => setShowEq((v) => !v)}
              aria-label="Equalizador"
              aria-pressed={showEq}
              title={eq?.settings?.enabled ? 'Equalizador ativado' : 'Equalizador'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                <path d="M1 14h6M9 8h6M17 16h6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showEq && (
        <div className="np-eq-sheet">
          <div className="np-eq-sheet-head">
            <button className="np-eq-sheet-close" onClick={() => setShowEq(false)} aria-label="Fechar equalizador">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="np-eq-sheet-scroll">
            <Equalizer eq={eq} />
          </div>
        </div>
      )}

      <div className="np-main">
        <div className="np-pet">
          <PetFriend
            size={42}
            playing={!!playing}
            eqEnabled={eqEnabled}
            eqPreset={eqPreset}
            favPing={favPing}
            shuffle={shuffle}
            trackId={trackId || track?.id || null}
            sleepMode={sleepMode}
            sleepRemaining={sleepRemaining}
            soundOn={soundOn}
            cheer={cheer}
            idleSinceRef={idleSinceRef}
            onPetAction={onPetAction}
            mood={mood}
          />
        </div>
        <div className="np-cover">
          <Cover colors={track.cover} image={track.coverUrl} size="min(56vw, 260px)" radius={22} />
        </div>

        <div className="np-info">
          <h2 className="np-title">{track.title}</h2>
          <p className="np-artist">{track.artist}</p>
          {track.album && <p className="np-album">{track.album}</p>}
          {!isOnline && <p className="np-source">📁 Meus Arquivos</p>}
        </div>

        <div className="np-timeline">
          <span className="np-time">{formatTime(shownTime)}</span>
          <div
            className={`np-bar ${dragRatio !== null ? 'dragging' : ''}`}
            ref={barRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="np-bar-fill" style={{ width: `${shown * 100}%` }} />
            <div className="np-bar-thumb" style={{ left: `${shown * 100}%` }} />
          </div>
          <span className="np-time">{formatTime(duration)}</span>
        </div>

        {SPEEDS.length > 0 && (
          <div className="np-speed">
            {SPEEDS.map((v) => (
              <button
                key={v}
                className={speed === v ? 'active' : ''}
                onClick={() => onSetSpeed?.(v)}
                title={`Velocidade ${v === 1 ? 'normal' : v + 'x'}`}
              >
                {v === 1 ? '1x' : `${v}x`}
              </button>
            ))}
          </div>
        )}

        <div className="np-controls">
          <div className="np-controls-side">
            {!isOnline && (
              <button
                className={`np-toggle ${shuffle ? 'on' : ''}`}
                onClick={onToggleShuffle}
                aria-label="Aleatório"
                aria-pressed={shuffle}
                title="Aleatório"
              >
                <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
              </button>
            )}
            <button className="np-btn" onClick={onPrev} aria-label="Anterior" disabled={isOnline}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
          </div>
          <button className={`np-play ${playing ? 'playing' : ''}`} onClick={onToggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <div className="np-controls-side np-controls-right">
            <button className="np-btn" onClick={onNext} aria-label="Próxima" disabled={isOnline}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.86L12.03 12 8 14.86V9.14zM16 6h2v12h-2z" /></svg>
            </button>
            {!isOnline && (
              <button
                className={`np-toggle ${repeat ? 'on' : ''}`}
                onClick={onCycleRepeat}
                aria-label="Repetir"
                title={repeat === 0 ? 'Repetir: desligado' : repeat === 1 ? 'Repetir: tudo' : 'Repetir: uma'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
                {repeat === 2 && <span className="np-badge">1</span>}
              </button>
            )}
            {!isOnline && (
              <div className="np-depth-wrap">
              <button
                className={`np-toggle np-depth-btn ${depth ? 'on' : ''}`}
                onClick={() => setDepthOpen((v) => !v)}
                aria-label="Profundidade de áudio"
                aria-pressed={!!depth}
                title={depth === '8d' ? 'Áudio 8D ativado' : depth === '3d' ? 'Áudio 3D ativado' : 'Profundidade de áudio'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
                  <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </button>
              {depthOpen && (
                <div className="np-depth-menu" ref={depthMenuRef}>
                  <span className="np-depth-title">Profundidade</span>
                  <button className={`np-depth-opt ${depth === '3d' ? 'active' : ''}`} onClick={() => pickDepth('3d')}>
                    🎧 Áudio 3D
                  </button>
                  <button className={`np-depth-opt ${depth === '8d' ? 'active' : ''}`} onClick={() => pickDepth('8d')}>
                    🌀 Áudio 8D
                  </button>
                  <button className={`np-depth-opt ${depth === '' ? 'active' : ''}`} onClick={() => pickDepth('')}>
                    Desativar
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {synced && lines.length > 0 && !searchOpen && (
        <div className="np-sync">
          <div className="np-sync-row">
            <span className="np-sync-label">Sincronia da letra</span>
            <span className={`np-sync-value ${syncOffset ? 'on' : ''}`}>
              {syncOffset ? `${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(1).replace('.', ',')}s` : '0,0s'}
            </span>
          </div>
          <div className="np-sync-buttons">
            <button onClick={() => onSync?.(-5)} title="Adiantar 5s">
              −5s
            </button>
            <button onClick={() => onSync?.(-1)} title="Adiantar 1s">
              −1s
            </button>
            <button onClick={() => onSync?.(-0.5)} title="Adiantar 0,5s">
              −0,5s
            </button>
            <button onClick={() => onSync?.(0.5)} title="Atrasar 0,5s">
              +0,5s
            </button>
            <button onClick={() => onSync?.(1)} title="Atrasar 1s">
              +1s
            </button>
            <button onClick={() => onSync?.(5)} title="Atrasar 5s">
              +5s
            </button>
          </div>
          <div className="np-sync-actions">
            <button className="np-sync-align" onClick={onAlign} title="Toca até o cantor começar esta linha e toca aqui para alinhar">
              Alinhar pelo 1º verso
            </button>
            {!!syncOffset && (
              <button className="np-sync-reset" onClick={() => onSync?.(-syncOffset)} title="Zerar ajuste">
                zerar
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`np-lyrics ${searchOpen ? 'searching' : ''}`} ref={lyricsRef}>
        {searchOpen ? (
          <div className="np-search">
            <form
              className="np-search-form"
              onSubmit={(e) => {
                e.preventDefault()
                runSearch(query)
              }}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Artista ou nome da música"
                autoFocus
              />
              <button type="submit">Buscar</button>
            </form>

            {searching && <p className="np-lyrics-msg">Buscando…</p>}
            {!searching && results.length === 0 && (
              <p className="np-lyrics-msg">Nenhum resultado. Tente outro nome.</p>
            )}

            <div className="np-search-results">
              {results.map((r) => (
                <button key={r.id} className="np-search-item" onClick={() => pickResult(r)}>
                  <span className="np-search-main">
                    <span className="np-search-title">{r.trackName || '—'}</span>
                    <span className="np-search-artist">
                      {r.artistName}
                      {r.albumName ? ` · ${r.albumName}` : ''}
                    </span>
                  </span>
                  <span className="np-search-meta">
                    {r.syncedLyrics && <span className="np-search-badge">sincronizada</span>}
                    {r.duration ? <span className="np-search-dur">{formatTime(r.duration)}</span> : null}
                  </span>
                </button>
              ))}
            </div>

            <button className="np-search-close" onClick={() => setSearchOpen(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            {lyrics?.status === 'done' && lyrics.source && (
              <div className="np-lyrics-source">
                <span className="np-lyrics-source-text">
                  Letra: {lyrics.source.artistName} — {lyrics.source.trackName}
                </span>
                <button onClick={openSearch}>trocar</button>
              </div>
            )}

            {(!lyrics || lyrics.status === 'loading') && (
              <p className="np-lyrics-msg">Buscando letra…</p>
            )}

            {lyrics?.status === 'notfound' && (
              <div className="np-lyrics-msg">
                <p>Letra não encontrada para esta música.</p>
                <button className="btn-search-lyrics" onClick={openSearch}>
                  Buscar letra manualmente
                </button>
              </div>
            )}

            {lyrics?.status === 'done' && lyrics.instrumental && (
              <div className="np-lyrics-msg">
                <p>🎹 Faixa instrumental</p>
                <button className="btn-search-lyrics" onClick={openSearch}>
                  Buscar letra manualmente
                </button>
              </div>
            )}

            {lyrics?.status === 'done' && lines.length > 0 && (
              <>
                <div className="np-lyrics-bar">
                  <button
                    className={`np-tr-btn ${lyricTrans.enabled ? 'on' : ''}`}
                    onClick={() => lyricTrans.setEnabled((v) => !v)}
                    title={
                      lyricTrans.enabled
                        ? 'Desativar tradução para o português'
                        : 'Traduzir a letra para o português'
                    }
                  >
                    {lyricTrans.enabled ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3.5 6h5M6 4v2m-2.5 9c1.2-2 3.4-2.5 5-1.7m-2.5 5.5c1-2.2 3.2-3.4 6-3.7" />
                        <path d="m10 5 4 14M10.8 12h3M18 5c.7 1.4 1.8 2 3 2.2m-3 0c.8 1 2 1.5 3 1.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3.5 6h5M6 4v2m-2.5 9c1.2-2 3.4-2.5 5-1.7m-2.5 5.5c1-2.2 3.2-3.4 6-3.7" />
                        <path d="m10 5 4 14M10.8 12h3M18 5c.7 1.4 1.8 2 3 2.2m-3 0c.8 1 2 1.5 3 1.6" />
                      </svg>
                    )}
                    {lyricTrans.enabled ? 'Mostrar original' : 'Traduzir letra'}
                  </button>
                  {lyricTrans.pending > 0 && (
                    <span className="np-tr-status">Traduzindo… ({lyricTrans.pending})</span>
                  )}
                </div>
                <div className="np-lyrics-lines">
                  {lines.map((line, i) => {
                    const seekable = synced && line.time != null
                    return (
                      <p
                        key={i}
                        ref={i === activeIndex ? activeRef : null}
                        className={`np-lyric ${i === activeIndex ? 'active' : ''} ${seekable ? 'seekable' : ''}`}
                        onClick={
                          seekable
                            ? () => onSeek(Math.min(0.999, line.time / (duration || 1)))
                            : undefined
                        }
                      >
                        <span className="np-lyric-main">{line.text || '\u00A0'}</span>
                        {lyricTrans.enabled && lyricTrans.map[line.text] && (
                          <span className="np-lyric-tr">{lyricTrans.map[line.text]}</span>
                        )}
                      </p>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
NowPlaying = reactMemo(NowPlaying)

function useMediaSession({ track, playing, speed, onToggle, onNext, onPrev, onSeek }) {
  const { elapsed, duration } = useProgress()
  const actionsRef = useRef({ onToggle, onNext, onPrev, onSeek })
  const stateRef = useRef({ elapsed, duration, speed })

  useEffect(() => {
    actionsRef.current = { onToggle, onNext, onPrev, onSeek }
    stateRef.current = { elapsed, duration, speed }
  })

  useEffect(() => {
    if (!track) {
      hideNowPlaying()
      const ms = navigator.mediaSession
      if (!ms) return
      try {
        ms.metadata = null
      } catch {}
      ms.playbackState = 'none'
      return
    }
    updateNowPlaying({
      title: track.title || '',
      artist: track.artist || '',
      album: track.album || '',
      cover: track.coverUrl || (typeof track.cover === 'string' ? track.cover : null),
      playing: !!playing,
      position: Math.max(0, stateRef.current.elapsed || 0),
      duration: Math.max(0, stateRef.current.duration || 0),
      playbackRate: stateRef.current.speed || 1,
    })
    const ms = navigator.mediaSession
    if (!ms) return
    try {
      const art =
        track.coverUrl ||
        (typeof track.cover === 'string' && /^(data:|https?:\/\/)/.test(track.cover) ? track.cover : '')
      ms.metadata = new MediaMetadata({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        artwork: art ? [{ src: art, sizes: '512x512' }] : [],
      })
    } catch {}
  }, [track, playing])

  useEffect(() => {
    if (!track) return undefined
    const send = () => {
      const st = stateRef.current
      updateNowPlaying({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        cover: track.coverUrl || (typeof track.cover === 'string' ? track.cover : null),
        playing: !!playing,
        position: Math.max(0, st.elapsed || 0),
        duration: Math.max(0, st.duration || 0),
        playbackRate: st.speed || 1,
      })
    }
    const iv = window.setInterval(send, 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') send()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [track, playing])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || typeof ms.setActionHandler !== 'function') return
    const handlers = {
      play: () => actionsRef.current.onToggle(),
      pause: () => actionsRef.current.onToggle(),
      previoustrack: () => actionsRef.current.onPrev(),
      nexttrack: () => actionsRef.current.onNext(),
      seekto: (d) => {
        const dur = stateRef.current.duration
        if (d && typeof d.seekTime === 'number' && dur > 0) {
          actionsRef.current.onSeek(Math.min(d.seekTime, dur) / dur)
        }
      },
      seekforward: (d) => {
        const st = stateRef.current
        const off = (d && d.seekOffset) || 10
        const dur = st.duration || 0
        if (dur > 0) actionsRef.current.onSeek(Math.min(st.elapsed + off, dur) / dur)
      },
      seekbackward: (d) => {
        const st = stateRef.current
        const off = (d && d.seekOffset) || 10
        const dur = st.duration || 0
        if (dur > 0) actionsRef.current.onSeek(Math.max(st.elapsed - off, 0) / dur)
      },
    }
    Object.keys(handlers).forEach((a) => {
      try {
        ms.setActionHandler(a, handlers[a])
      } catch {}
    })
    return () => {
      Object.keys(handlers).forEach((a) => {
        try {
          ms.setActionHandler(a, null)
        } catch {}
      })
    }
  }, [])

  useEffect(() => {
    if (track) {
      try {
        updateNowPlaying({
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          cover: track.coverUrl || (typeof track.cover === 'string' ? track.cover : null),
          playing: !!playing,
          position: Math.max(0, stateRef.current.elapsed || 0),
          duration: Math.max(0, stateRef.current.duration || 0),
          playbackRate: stateRef.current.speed || 1,
        })
      } catch (e) {
        console.warn('falha ao espelhar play/pause na notificação nativa', e)
      }
    }
    const ms = navigator.mediaSession
    if (!ms) return
    ms.playbackState = playing ? 'playing' : 'paused'
  }, [playing, track])

  useEffect(() => {
    if (IS_NATIVE) {
      requestNotificationsPermission()
        .catch(() => {})
        .finally(() => {})
    }
    let stop = () => {}
    try {
      stop = onMediaAction(({ action, seekTime, seekOffset }) => {
        const a = actionsRef.current
        const st = stateRef.current
        const dur = st.duration || 0
        switch (action) {
          case 'play':
          case 'pause':
            a.onToggle()
            break
          case 'previoustrack':
            a.onPrev()
            break
          case 'nexttrack':
            a.onNext()
            break
          case 'seekto':
            if (typeof seekTime === 'number' && dur > 0) {
              a.onSeek(Math.min(Math.max(seekTime, 0), dur) / dur)
            }
            break
          case 'seekbackward': {
            const off = typeof seekOffset === 'number' ? seekOffset : 10
            if (dur > 0) a.onSeek(Math.max((st.elapsed || 0) - off, 0) / dur)
            break
          }
          case 'seekforward': {
            const off = typeof seekOffset === 'number' ? seekOffset : 10
            if (dur > 0) a.onSeek(Math.min((st.elapsed || 0) + off, dur) / dur)
            break
          }
          default:
            break
        }
      })
    } catch (e) {
      console.warn('barra nativa sem ponte de ações', e)
    }
    return () => stop()
  }, [])

  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms || !track || typeof ms.setPositionState !== 'function') return
    const id = window.setInterval(() => {
      const st = stateRef.current
      const d = st.duration
      if (!d || d <= 0) return
try {
        ms.setPositionState({ duration: d, position: Math.min(st.elapsed, d), playbackRate: st.speed || 1 })
      } catch {}
    }, 1000)
    return () => window.clearInterval(id)
  }, [track])
}

function MediaSessionBridge({ track, playing, speed, onToggle, onNext, onPrev, onSeek }) {
  useMediaSession({ track, playing, speed, onToggle, onNext, onPrev, onSeek })
  return null
}

const MOOD_WINDOW_MS = 3600
const MOOD_MIN_AUDIBLE_RATIO = 0.2
const MOOD_UPBEAT = new Set(['alegre', 'dancante', 'hype'])
const moodClamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function moodFromFeatures({ loud, onsetRate, bassRatio, treble }) {
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

function useMoodDetector({ playing, sig }) {
  const [mood, setMood] = useState('neutral')
  const moodRef = useRef('neutral')
  const lockRef = useRef(null)

  useEffect(() => {
    moodRef.current = 'neutral'
    lockRef.current = null
    setMood('neutral')
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

function usePlayer(library, speed = 1, onStart, sink = null) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const lastElapsedRef = useRef(-1)
  const lastDurationRef = useRef(0)
  const audioRef = useRef(null)
  const modeRef = useRef('synth')
  const indexRef = useRef(0)
  const libRef = useRef(library)
  const onEndedRef = useRef(() => {})
  const onStartRef = useRef(onStart)
  const onErrorRef = useRef(() => {})
  const errorCountRef = useRef(0)
  const playingRef = useRef(false)
  const currentAudioUrlRef = useRef(null)
  const [repeat, setRepeat] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const repeatRef = useRef(0)

  const emitProgress = useCallback(
    (elapsed, duration) => {
      sink?.current?.({ elapsed, duration })
    },
    [sink],
  )
  const shuffleRef = useRef(false)
  const [queue, setQueue] = useState([])
  const queueRef = useRef([])
  const scopeRef = useRef(null)
  const speedRef = useRef(speed)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    libRef.current = library
  }, [library])

  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])

  useEffect(() => {
    shuffleRef.current = shuffle
  }, [shuffle])

  useEffect(() => {
    if (!queueRef.current.length) return
    const ids = new Set(libRef.current.map((t) => t.id))
    const filtered = queueRef.current.filter((id) => ids.has(id))
    if (filtered.length !== queueRef.current.length) {
      queueRef.current = filtered
      setQueue(filtered)
    }
  }, [library])

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.playbackRate = speedRef.current
      graph.registerMediaElement(a)
      a.addEventListener('ended', () => onEndedRef.current())
      a.addEventListener('error', () => onErrorRef.current())
      a.addEventListener('playing', () => {
        errorCountRef.current = 0
      })
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  const playWithRetryRef = useRef(null)
  const playWithRetry = useCallback((a, attempt = 0) => {
    if (!playingRef.current) return
    a.play().catch(() => {
      if (attempt < 6) setTimeout(() => playWithRetryRef.current(a, attempt + 1), 300)
    })
  }, [])

  useEffect(() => {
    playWithRetryRef.current = playWithRetry
  }, [playWithRetry])

  const startIndex = useCallback((i) => {
    const libAll = libRef.current
    // Se a música está marcada sem som, procura a próxima que tenha som — assim
    // não toca um som de demonstração no lugar da música de verdade.
    const soundable = (c) => c && (c.src || c.audioBlob || !c.audioMissing)
    if (libAll[i]?.audioMissing && !soundable(libAll[i])) {
      for (let step = 1; step < libAll.length; step += 1) {
        const j = (i + step) % libAll.length
        if (soundable(libAll[j])) {
          i = j
          break
        }
      }
    }
    const t = libAll[i]
    if (!t) return
    indexRef.current = i
    setCurrentIndex(i)

    const finish = () => {
      setPlaying(true)
      onStartRef.current?.(i)
    }
    const synthFallback = () => {
      modeRef.current = 'synth'
      if (audioRef.current) audioRef.current.pause()
      graph.getContext()
      engine.startTrack(i + 1)
      emitProgress(0, engine.getDuration())
      finish()
    }
    const startFile = (src, dur) => {
      modeRef.current = 'file'
      const a = getAudio()
      a.src = src
      a.currentTime = 0
      graph.resumeContext()
      playWithRetry(a)
      emitProgress(0, dur || 0)
      finish()
    }

    if (t.src) {
      startFile(t.src, t.duration)
      return
    }
    if (t.audioBlob && (t.audioBlob.size || t.audioBlob.type)) {
      const src = URL.createObjectURL(t.audioBlob)
      currentAudioUrlRef.current = src
      const up = { ...t, src }
      libRef.current[i] = up
      setLibrary((prev) => prev.map((x) => (x.id === t.id ? up : x)))
      startFile(src, t.duration)
      return
    }
    synthFallback()
  }, [getAudio, playWithRetry])

  const randomIndex = useCallback(() => {
    const lib = libRef.current
    const scope = scopeRef.current
    if (scope && scope.length) {
      const inLib = scope.filter((id) => lib.some((t) => t.id === id))
      if (inLib.length <= 1) return indexRef.current
      const curId = lib[indexRef.current]?.id
      let pick = curId
      let guard = 0
      do {
        pick = inLib[Math.floor(Math.random() * inLib.length)]
        guard += 1
      } while (pick === curId && guard < 20)
      const idx = lib.findIndex((t) => t.id === pick)
      return idx >= 0 ? idx : indexRef.current
    }
    const n = lib.length
    if (n <= 1) return 0
    let i = indexRef.current
    while (i === indexRef.current) i = Math.floor(Math.random() * n)
    return i
  }, [])

  const next = useCallback(
    (_auto = false) => {
      const lib = libRef.current
      const n = lib.length
      if (!n) return
      if (shuffleRef.current) {
        startIndex(randomIndex())
        return
      }
      if (queueRef.current.length) {
        const head = queueRef.current[0]
        queueRef.current = queueRef.current.slice(1)
        setQueue(queueRef.current)
        const idx = lib.findIndex((t) => t.id === head)
        if (idx >= 0) {
          startIndex(idx)
          return
        }
      }
      const scope = scopeRef.current
      if (scope && scope.length) {
        const curId = lib[indexRef.current]?.id
        const ci = curId ? scope.indexOf(curId) : -1
        for (let step = 1; step <= scope.length; step += 1) {
          const pick = scope[((ci < 0 ? -1 : ci) + step) % scope.length]
          const idx = pick !== undefined ? lib.findIndex((t) => t.id === pick) : -1
          if (idx >= 0) {
            startIndex(idx)
            return
          }
        }
      }
      startIndex((indexRef.current + 1) % n)
    },
    [startIndex, randomIndex],
  )

  const select = useCallback(
    (i) => {
      scopeRef.current = null
      startIndex(i)
      if (!shuffleRef.current) {
        const nextIds = libRef.current.slice(i + 1).map((t) => t.id)
        queueRef.current = nextIds
        setQueue(nextIds)
      }
    },
    [startIndex],
  )

  const playByList = useCallback(
    (tracks, id) => {
      const objList = tracks && tracks.length ? tracks : null
      if (!objList) return
      const lib = libRef.current
      const i = objList.findIndex((t) => t.id === id)
      const idx = lib.findIndex((t) => t.id === id)
      if (i < 0 || idx < 0) return
      scopeRef.current = objList.map((t) => t.id)
      startIndex(idx)
      if (!shuffleRef.current) {
        const nextIds = objList.slice(i + 1).map((t) => t.id)
        queueRef.current = nextIds
        setQueue(nextIds)
      }
    },
    [startIndex],
  )

  const removeFromQueue = useCallback((id) => {
    queueRef.current = queueRef.current.filter((x) => x !== id)
    setQueue(queueRef.current)
  }, [])

  const moveInQueue = useCallback((id, dir) => {
    const cur = [...queueRef.current]
    const i = cur.indexOf(id)
    if (i < 0) return
    const j = Math.max(0, Math.min(cur.length - 1, i + dir))
    if (j === i) return
    const [item] = cur.splice(i, 1)
    cur.splice(j, 0, item)
    queueRef.current = cur
    setQueue(cur)
  }, [])

  const clearQueue = useCallback(() => {
    queueRef.current = []
    setQueue([])
  }, [])

  const reorderQueue = useCallback((from, to) => {
    const cur = [...queueRef.current]
    if (
      from < 0 ||
      to < 0 ||
      from >= cur.length ||
      to >= cur.length ||
      from === to
    )
      return
    const [item] = cur.splice(from, 1)
    cur.splice(to, 0, item)
    queueRef.current = cur
    setQueue(cur)
  }, [])

  const playQueueItem = useCallback(
    (id) => {
      const idx = libRef.current.findIndex((t) => t.id === id)
      if (idx < 0) return
      const i = queueRef.current.indexOf(id)
      if (i < 0) {
        startIndex(idx)
        return
      }
      const rest = queueRef.current.slice(i + 1)
      queueRef.current = rest
      setQueue(rest)
      startIndex(idx)
    },
    [startIndex],
  )

  const queueAdd = useCallback((id) => {
    if (!libRef.current.some((t) => t.id === id)) return
    const cur = queueRef.current.filter((x) => x !== id)
    cur.push(id)
    queueRef.current = cur
    setQueue(cur)
  }, [])

  const queueNext = useCallback((id) => {
    if (!libRef.current.some((t) => t.id === id)) return
    const cur = queueRef.current.filter((x) => x !== id)
    cur.unshift(id)
    queueRef.current = cur
    setQueue(cur)
  }, [])

  const prev = useCallback(() => {
    const lib = libRef.current
    const n = lib.length
    if (!n) return
    if (shuffleRef.current) {
      startIndex(randomIndex())
      return
    }
    const scope = scopeRef.current
    if (scope && scope.length) {
      const curId = lib[indexRef.current]?.id
      const ci = curId ? scope.indexOf(curId) : -1
      for (let step = 1; step <= scope.length; step += 1) {
        const pick = scope[((ci < 0 ? -1 : ci) - step + scope.length) % scope.length]
        const idx = pick !== undefined ? lib.findIndex((t) => t.id === pick) : -1
        if (idx >= 0) {
          startIndex(idx)
          return
        }
      }
    }
    startIndex((indexRef.current - 1 + n) % n)
  }, [startIndex, randomIndex])

  const handleEnded = useCallback(() => {
    if (repeatRef.current === 2) startIndex(indexRef.current)
    else next(true)
  }, [startIndex, next])

  const handlePlayError = useCallback(() => {
    if (!playingRef.current) return
    errorCountRef.current += 1
    if (errorCountRef.current >= 2) {
      errorCountRef.current = 0
      setPlaying(false)
      return
    }
    next(true)
  }, [next])

  const cycleRepeat = useCallback(() => setRepeat((r) => (r + 1) % 3), [])
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), [])

  const toggle = useCallback(() => {
    if (!libRef.current[indexRef.current]) return
    if (playing) {
      if (modeRef.current === 'file') getAudio().pause()
      else engine.pauseTrack()
      setPlaying(false)
      return
    }
    if (modeRef.current === 'file') {
      const a = getAudio()
      if (a.src) {
        graph
          .resumeContext()
          .then(() => a.play().catch(() => {}))
      } else startIndex(indexRef.current)
    } else if (engine.hasTrack() && engine.currentIndex() === indexRef.current + 1) {
      engine.resumeTrack()
    } else {
      startIndex(indexRef.current)
    }
    setPlaying(true)
  }, [playing, getAudio, startIndex])

  const pausePlayback = useCallback(() => {
    if (!libRef.current[indexRef.current]) return
    if (!playing) return
    if (modeRef.current === 'file') getAudio().pause()
    else engine.pauseTrack()
    setPlaying(false)
  }, [playing, getAudio])

  const seek = useCallback((ratio) => {
    const r = Math.max(0, Math.min(0.999, ratio))
    if (modeRef.current === 'file') {
      const a = getAudio()
      if (a.duration) a.currentTime = a.duration * r
      emitProgress(a.currentTime || 0, a.duration || 0)
    } else if (engine.hasTrack()) {
      engine.seek(engine.getDuration() * r)
      emitProgress(engine.getElapsed(), engine.getDuration())
    }
  }, [getAudio, emitProgress])

  useEffect(() => {
    onEndedRef.current = handleEnded
  }, [handleEnded])

  useEffect(() => {
    onErrorRef.current = handlePlayError
  }, [handlePlayError])

  useEffect(() => {
    if (!playing) return undefined
    let cancelled = false
    // Atualiza o tempo da música 2x por segundo (antes: 60x por segundo,
    // via requestAnimationFrame). O relógio mostra segundos, então 0,5s de
    // passo não muda nada visualmente — mas tira um peso enorme do celular.
    const tick = () => {
      if (cancelled) return
      if (modeRef.current === 'file') {
        const a = getAudio()
        const e = a.currentTime || 0
        const d = a.duration || libRef.current[indexRef.current]?.duration || 0
        if (Math.abs(e - lastElapsedRef.current) >= 0.4 || d !== lastDurationRef.current) {
          lastElapsedRef.current = e
          lastDurationRef.current = d
          emitProgress(e, d)
        }
        if (a.ended) {
          handleEnded()
        } else if (a.paused && !a.ended && a.src && a.readyState >= 2) {
          playWithRetry(a)
        }
      } else {
        const e = engine.getElapsed()
        const d = engine.getDuration() || 0
        if (Math.abs(e - lastElapsedRef.current) >= 0.4 || d !== lastDurationRef.current) {
          lastElapsedRef.current = e
          lastDurationRef.current = d
          emitProgress(e, d)
        }
        if (d && engine.getElapsed() >= d - 0.05) handleEnded()
      }
    }
    const iv = setInterval(tick, 500)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [playing, getAudio, handleEnded, playWithRetry])

  useEffect(() => {
    const resume = () => {
      if (!playingRef.current || cancelledRef.current) return
      if (modeRef.current !== 'file') return
      const a = getAudio()
      if (a && a.paused && !a.ended && a.src && a.readyState >= 2) {
        playWithRetry(a)
      }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') resume()
    }
    const onShow = () => resume()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onShow)
    }
  }, [playingRef, getAudio, playWithRetry])

  const stopAndReset = useCallback(() => {
    if (modeRef.current === 'file') {
      const a = getAudio()
      a.pause()
      if (a.src) a.currentTime = 0
    } else {
      engine.stopTrack()
    }
    indexRef.current = 0
    setCurrentIndex(0)
    setPlaying(false)
    emitProgress(0, 0)
  }, [getAudio, emitProgress])

  return {
    currentIndex,
    playing,
    toggle,
    pausePlayback,
    select,
    playByList,
    next,
    prev,
    seek,
    stopAndReset,
    repeat,
    shuffle,
    cycleRepeat,
    toggleShuffle,
    queue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    reorderQueue,
    playQueueItem,
    queueAdd,
    queueNext,
  }
}

function useOnlinePlayer(rate = 1, sink = null) {
  const [track, setTrack] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState('full')
  const elRef = useRef(null)
  const trackRef = useRef(null)
  const modeRef = useRef('full')
  const rateRef = useRef(rate)

  useEffect(() => {
    rateRef.current = rate
    if (elRef.current) elRef.current.playbackRate = rate
  }, [rate])

  const getEl = useCallback(() => {
    if (!elRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      el.playbackRate = rateRef.current
      el.addEventListener('ended', () => setPlaying(false))
      el.addEventListener('loadedmetadata', () => emitPlayhead())
      el.addEventListener('durationchange', () => emitPlayhead())
      elRef.current = el
    }
    return elRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shownDur = useCallback((elDur) => {
    const base = elDur || trackRef.current?.duration || trackRef.current?.playDuration || 0
    return modeRef.current === 'preview' ? Math.min(30, base || 30) : base
  }, [])

  const emitPlayhead = useCallback(() => {
    if (!sink) return
    const el = elRef.current
    if (!el) return
    const dur = shownDur(el.duration)
    sink.current?.({ elapsed: el.currentTime || 0, duration: dur })
  }, [sink, shownDur])

  const emitAt = useCallback(
    (elapsed, duration) => {
      sink?.current?.({ elapsed, duration })
    },
    [sink],
  )

  useEffect(
    () => () => {
      const el = elRef.current
      if (el) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
    },
    [],
  )

  useEffect(() => {
    if (!playing) return undefined
    const id = setInterval(() => {
      const el = elRef.current
      const time = el ? el.currentTime || 0 : 0
      emitPlayhead()
      if (modeRef.current === 'preview' && time >= 30) {
        el.pause()
        el.currentTime = 30
        setPlaying(false)
      }
    }, 250)
    return () => clearInterval(id)
  }, [playing, emitPlayhead])

  const stop = useCallback(() => {
    const el = getEl()
    el.pause()
    el.currentTime = 0
    trackRef.current = null
    setTrack(null)
    setPlaying(false)
    emitAt(0, 0)
    modeRef.current = 'full'
    setMode('full')
  }, [getEl, emitAt])

  const toggle = useCallback(() => {
    const el = getEl()
    if (!trackRef.current) return
    if (playing) {
      el.pause()
      setPlaying(false)
      return
    }
    if (modeRef.current === 'preview' && (el.currentTime || 0) >= 30) el.currentTime = 0
    el.play().then(() => setPlaying(true)).catch(() => {})
  }, [playing, getEl])

  const play = useCallback(
    (item, opts = {}) => {
      const nextMode = opts.preview ? 'preview' : 'full'
      const src = item.stream || item.streamUrl || item.preview
      if (!src) return
      if (trackRef.current && trackRef.current.id === item.id && modeRef.current === nextMode) {
        toggle()
        return
      }
      const el = getEl()
      el.pause()
      trackRef.current = item
      modeRef.current = nextMode
      setMode(nextMode)
      setTrack(item)
      emitAt(0, shownDur(item.duration || item.playDuration || 0))
      el.src = src
      el.load()
      el.play().then(() => setPlaying(true)).catch(() => {})
    },
    [getEl, toggle, emitAt, shownDur],
  )

  const seek = useCallback(
    (ratio) => {
      const el = getEl()
      const full = el.duration
      if (!full || !Number.isFinite(full)) return
      const limit = modeRef.current === 'preview' ? Math.min(30, full) : full
      el.currentTime = Math.max(0, Math.min(limit - 0.05, ratio * limit))
      emitAt(el.currentTime, shownDur(full))
    },
    [getEl, emitAt, shownDur],
  )

  return {
    track,
    playing,
    mode,
    play,
    toggle,
    seek,
    stop,
  }
}

function LibraryView({ tracks, onSelect }) {
  const artists = [...new Set(tracks.map((t) => t.artist))]
  const albums = [...new Set(tracks.map((t) => t.album))]
  return (
    <div className="view">
      <div className="library-grid">
        {artists.map((a, i) => {
          const artistTracks = tracks.filter((t) => t.artist === a)
          return (
            <div className="card" key={a} onClick={() => onSelect(artistTracks[0].id)}>
              <Cover
                colors={featuredCovers[(i * 3 + 1) % featuredCovers.length]}
                image={artistTracks[0].coverUrl}
                size="100%"
                radius={12}
              />
              <p>{a}</p>
              <small>Artista · {artistTracks.length} faixas</small>
            </div>
          )
        })}
        {albums.map((a, i) => {
          const albumTracks = tracks.filter((t) => t.album === a)
          return (
            <div className="card" key={a} onClick={() => onSelect(albumTracks[0].id)}>
              <Cover
                colors={featuredCovers[(i * 2 + 4) % featuredCovers.length]}
                image={albumTracks[0].coverUrl}
                size="100%"
                radius={12}
              />
              <p>{a}</p>
              <small>Álbum · {albumTracks.length} faixas</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const AUDIO_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i

function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  if (hour >= 18) return 'Boa noite'
  return 'Boa madrugada'
}

const NOISE_RE =
  /\b(official|oficial|lyric|lyrics|letra|letras|video|vídeo|audio|áudio|clipe|clip|mv|m\/v|hd|hq|4k|8k|visualizer|remaster(ed)?|sub|subtitulado|subtitulada|espanol|español|spanish|english|ingl[eé]s|traducci[oó]n|tradu[cç][aã]o|legendado|legendada|legenda(s)?|karaoke|color ?coded|en vivo|full ?hd)\b/i

function cleanTitle(raw) {
  return raw
    .replace(/[(（[]\s*[^)\）\]]*[)）\]]/g, (group) => (NOISE_RE.test(group) ? ' ' : group))
    .replace(/\s*\b(feat\.?|ft\.?|with)\b[^)\]]*/gi, '')
    .replace(/\s*[-–—]\s*topic$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanArtist(raw) {
  return (raw || '').replace(/\s*[-–—]\s*topic$/i, '').replace(/\s{2,}/g, ' ').trim()
}

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase().trim()
}

async function fetchItunesCover(title, artist) {
  const t = cleanTitle(title)
  const a = cleanArtist(artist)
  const queries = []
  if (a && a.toLowerCase() !== 'desconhecido') queries.push(`${a} ${t}`)
  queries.push(t)

  for (const q of queries) {
    if (!q) continue
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`,
      )
      if (!res.ok) continue
      const data = await res.json()
      const art = data.results?.[0]?.artworkUrl100
      if (art) return art.replace(/\/\d+x\d+bb\./, '/600x600bb.')
    } catch {
      /* sem internet / bloqueado */
    }
  }
  return null
}

function parseFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()
  if (base.includes(' - ')) {
    const [artist, ...rest] = base.split(' - ')
    return { artist: artist.trim(), title: rest.join(' - ').trim() }
  }
  return { artist: 'Desconhecido', title: base }
}

function parseLRC(text) {
  if (!text) return []
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const lines = []
  text.split('\n').forEach((raw) => {
    const stamps = [...raw.matchAll(re)]
    if (!stamps.length) return
    const content = raw.replace(re, '').trim()
    stamps.forEach((m) => {
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, '0')}`) : 0
      lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: content })
    })
  })
  return lines.sort((a, b) => a.time - b.time)
}

function buildLyrics(data) {
  if (!data) return null
  const source = {
    id: data.id,
    artistName: data.artistName,
    trackName: data.trackName,
    albumName: data.albumName,
    duration: data.duration,
  }
  if (data.instrumental) return { instrumental: true, synced: false, lines: [], source }
  const synced = parseLRC(data.syncedLyrics)
  if (synced.length) return { synced: true, lines: synced, source }
  if (data.plainLyrics) {
    return {
      synced: false,
      lines: data.plainLyrics.split('\n').map((text) => ({ time: null, text })),
      source,
    }
  }
  return null
}

async function searchLyrics(query) {
  const q = (query || '').trim()
  if (!q) return []
  const get = async (url) => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return []
      const arr = await res.json()
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  const results = []
  const seen = new Set()
  const push = (arr) => {
    if (!Array.isArray(arr)) return
    arr.forEach((c) => {
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        results.push(c)
      }
    })
  }

  const qUrl = (params) =>
    `https://lrclib.net/api/search?${Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')}`

  push(await get(qUrl({ q })))

  if (!results.length) {
    const dash = q.split(/\s*[-–—:]\s*/)
    if (dash.length > 1) {
      const guessArtist = dash[0]
      const guessTitle = dash[dash.length - 1]
      push(
        await get(
          qUrl({
            artist_name: guessArtist.length > 2 ? guessArtist : '',
            track_name: guessTitle,
          }),
        ),
      )
    }
    push(await get(qUrl({ track_name: q })))
  }

  return results
}

function titleVariants(raw) {
  const base = cleanTitle(raw)
  if (!base) return []
  const out = new Set([base])
  const noFeat = base
    .replace(/\s*[([]?\s*(feat|ft|with)\.?\s+[^)\]]+[)\]]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (noFeat) out.add(noFeat)
  ;[' - ', ' | ', ' – '].forEach((sep) => {
    if (base.includes(sep)) out.add(base.split(sep)[0].trim())
  })
  const withoutParen = base
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (withoutParen && withoutParen !== base) out.add(withoutParen)
  const love = base.replace(/\b(featuring|featuring\.)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (love && love !== base) out.add(love)
  return [...out].filter(Boolean).slice(0, 4)
}

const normText = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function fetchLyrics(title, artist, duration) {
  const a = cleanArtist(artist)
  const hasArtist = a && a.toLowerCase() !== 'desconhecido'
  const variants = titleVariants(title)
  if (!variants.length) return null

  const artistVariants = []
  if (hasArtist) {
    artistVariants.push(a)
    const first = a.split(/\s*(?:,|&|;|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b)\s*/i)[0].trim()
    if (first && normText(first) !== normText(a)) artistVariants.push(first)
  }
  artistVariants.push('')

  const qs = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

  const candidates = []
  const seen = new Set()
  const push = (list) => {
    if (!Array.isArray(list)) return
    list.forEach((c) => {
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        candidates.push(c)
      }
    })
  }

  const hasStrongMatch = () =>
    candidates.some(
      (c) => c.syncedLyrics && duration && Math.abs(c.duration - duration) <= 2,
    )

  try {
    const res = await fetch(
      `https://lrclib.net/api/get?${qs({
        artist_name: hasArtist ? a : '',
        track_name: variants[0],
        duration: duration ? Math.round(duration) : '',
      })}`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.ok) push([await res.json()])
  } catch {
    /* tenta busca */
  }

  for (const v of variants) {
    for (const av of artistVariants) {
      if (hasStrongMatch()) break
      try {
        const res = await fetch(
          `https://lrclib.net/api/search?${qs({ artist_name: av, track_name: v })}`,
          { headers: { Accept: 'application/json' } },
        )
        if (res.ok) push(await res.json())
      } catch {
        /* ignora variante */
      }
    }
    if (hasStrongMatch()) break
  }

  if (!candidates.length) return null

  const artistNorms = [...new Set(artistVariants.filter(Boolean).map(normText))]
  const score = (c) => {
    let s = 0
    if (c.syncedLyrics) s += 120
    else if (c.plainLyrics) s += 15
    if (c.instrumental) s -= 10
    if (duration && c.duration) {
      const diff = Math.abs(c.duration - duration)
      if (diff <= 2) s += 80
      else s += Math.max(0, 45 - diff * 3)
    }
    if (artistNorms.length) {
      const ca = normText(c.artistName)
      if (artistNorms.some((n) => ca === n)) s += 50
      else if (artistNorms.some((n) => ca.includes(n) || n.includes(ca))) s += 25
    }
    if (variants.some((v) => normText(v) === normText(c.trackName))) s += 10
    return s
  }

  candidates.sort((x, y) => score(y) - score(x))
  const best = candidates[0]
  const bestArtist = normText(best.artistName)
  const artistOk =
    artistNorms.length > 0 &&
    artistNorms.some((n) => bestArtist === n || bestArtist.includes(n) || n.includes(bestArtist))
  const durationOk =
    !!duration && !!best.duration && Math.abs(best.duration - duration) <= 8
  const bestTrackN = normText(best.trackName)
  const exactTitle = variants.some((v) => normText(v) === bestTrackN)
  const fuzzyTitle =
    exactTitle ||
    (bestTrackN &&
      (bestTrackN.includes(normText(variants[0])) || normText(variants[0]).includes(bestTrackN)))
  const synced = !!best.syncedLyrics
  const accept =
    (artistOk && durationOk) ||
    (artistOk && fuzzyTitle) ||
    (durationOk && fuzzyTitle) ||
    (synced && exactTitle && !best.instrumental)
  if (!accept) return null
  const built = buildLyrics(best)
  if (built) return built
  return fetchPlainLyrics(a, variants[0])
}

/* Letras simples (sem sincronização) — fallback para músicas que
   não existem no LRCLIB (boa cobertura em português/outros idiomas). */
async function fetchPlainLyrics(artist, title) {
  const candidates = []
  candidates.push({ a: artist, t: title })
  if (artist) candidates.push({ a: '', t: title })
  for (const { a, t } of candidates) {
    if (!a || !t) continue
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) continue
      const data = await res.json()
      const text = data && typeof data.lyrics === 'string' ? data.lyrics : ''
      if (!text.trim()) continue
      return {
        synced: false,
        lines: text.split('\n').map((l) => ({ time: null, text: l })),
        source: { provider: 'lyrics.ovh', artistName: a || undefined, trackName: t },
        fallback: true,
      }
    } catch {
      /* tenta a próxima variação */
    }
  }
  return null
}

function VSlider({ value, onChange, min = -12, max = 12, step = 1, label, suffix }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const pct = ((value - min) / (max - min)) * 100

  const setFromPointer = (clientY) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ratio = 1 - (clientY - r.top) / r.height
    const raw = min + Math.max(0, Math.min(1, ratio)) * (max - min)
    onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)))
  }

  return (
    <div className="vslider">
      <span className={`vslider-val ${value ? 'changed' : ''}`}>
        {value > 0 ? `+${value}` : `${value}`}
      </span>
      <div
        className="vslider-track"
        ref={trackRef}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setFromPointer(e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) setFromPointer(e.clientY)
        }}
        onPointerUp={(e) => {
          draggingRef.current = false
          e.currentTarget.releasePointerCapture?.(e.pointerId)
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
      >
        <div className="vslider-zero" />
        <div className="vslider-thumb" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="vslider-label">{label}</span>
      {suffix && <span className="vslider-sub">{suffix}</span>}
    </div>
  )
}

function NowParticles() {
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
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="np-particles" aria-hidden="true" />
}

const TRANS_KEY = 'nt.trans'
let transCache = {}

function transCacheLoad() {
  if (transCache) return transCache
  return transCache
}

function transCacheSave() {
  const entries = Object.entries(transCache || {})
  if (entries.length > 600) {
    transCache = Object.fromEntries(entries.slice(entries.length - 600))
  }
}

async function translateLine(text) {
  const t = (text || '').trim()
  if (!t) return ''
  const cache = transCacheLoad()
  if (cache[t]) return cache[t]
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.slice(0, 480))}&langpair=autodetect|pt`,
    )
    if (!res.ok) return ''
    const data = await res.json()
    const out = data?.responseData?.translatedText || ''
    if (!out || /MYMEMORY WARNING/i.test(out)) return ''
    cache[t] = out
    transCacheSave()
    return out
  } catch {
    return ''
  }
}

function useLyricsTranslation(lines) {
  const [enabled, setEnabled] = useState(false)
  const [map, setMap] = useState({})
  const [pending, setPending] = useState(0)
  const tokenRef = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined
    const myToken = tokenRef.current + 1
    tokenRef.current = myToken
    const unique = []
    const seen = new Set()
    ;(lines || []).forEach((l) => {
      const t = (l.text || '').trim()
      if (t && !seen.has(t)) {
        seen.add(t)
        unique.push(t)
      }
    })
    const cache = transCacheLoad()
    const seeded = {}
    const missing = []
    unique.forEach((t) => {
      if (cache[t]) seeded[t] = cache[t]
      else missing.push(t)
    })
    setMap(seeded)
    setPending(missing.length)
    if (!missing.length) return undefined
    const queue = [...missing]
    const _workers = Array.from({ length: Math.min(3, Math.max(1, queue.length)) }, async () => {
      while (queue.length) {
        if (tokenRef.current !== myToken) return
        const cur = queue.shift()
        const tr = await translateLine(cur)
        if (tokenRef.current !== myToken) return
        if (tr) setMap((m) => ({ ...m, [cur]: tr }))
        setPending((p) => Math.max(0, p - 1))
      }
    })
    return () => {
      tokenRef.current += 1
      setPending(0)
    }
  }, [enabled, lines])

  return { enabled, setEnabled, map, pending }
}

function Visualizer() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    graph.getContext()
    const analyser = graph.getAnalyser()
    if (!canvas || !analyser) return undefined
    const c2d = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
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
        const grad = c2d.createLinearGradient(0, h, 0, h - hh)
        grad.addColorStop(0, 'rgba(139, 92, 246, 0.7)')
        grad.addColorStop(1, 'rgba(34, 211, 238, 0.9)')
        c2d.fillStyle = grad
        c2d.fillRect(x, h - hh, bw * 0.64, hh)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} className="eq-visualizer" aria-hidden="true" />
}

function Equalizer({ eq }) {
  const { settings, setBand, setVolume, applyPreset, toggle, reset } = eq
  return (
    <div className="eq">
      <div className="eq-head">
        <div>
          <h1 className="greeting">Equalizador</h1>
          <p className="eq-sub">10 bandas · 31 Hz a 16 kHz · compressor anti-distorção</p>
        </div>
        <div className="eq-actions">
          <button className="btn-ghost btn-ghost-danger" onClick={reset} title="Voltar ao padrão">
            Restaurar
          </button>
          <button
            role="switch"
            aria-checked={settings.enabled}
            className={`eq-switch ${settings.enabled ? 'on' : ''}`}
            onClick={toggle}
            title={settings.enabled ? 'Desativar equalizador' : 'Ativar equalizador'}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>
      </div>

      {!settings.enabled && (
        <div className="eq-banner">
          Equalizador desativado — o som segue em resposta plana.
        </div>
      )}

      <div className={`eq-body ${settings.enabled ? '' : 'eq-off'}`}>
        <div className="eq-presets">
          {Object.entries(PRESETS)
            .filter(([id]) => id !== 'personalizado')
            .map(([id, p]) => (
            <button
              key={id}
              className={`eq-chip ${settings.preset === id ? 'active' : ''}`}
              onClick={() => applyPreset(id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Visualizer />

        <div className="eq-bands">
          {EQ_FREQS.map((f, i) => (
            <VSlider
              key={f}
              label={f >= 1000 ? `${f / 1000}k` : `${f}`}
              suffix="Hz"
              value={settings.bands[i]}
              onChange={(v) => setBand(i, v)}
            />
          ))}
        </div>

        <div className="eq-panels">
          <div className="eq-card">
            <div className="eq-card-head">
              <h3>Volume</h3>
              <span className="eq-card-val">{Math.round(settings.volume * 100)}%</span>
            </div>
            <p className="eq-card-desc">
              Ajuste geral do NebulaTune, independente do volume do aparelho.
            </p>
            <input
              type="range"
              className="eq-range"
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <div className="eq-range-scale">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QueueSheet({ track, queue, onPlayItem, onRemoveItem, onMoveItem, onClear, onReorder, onClose }) {
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const listRef = useRef(null)
  const [dragSession, setDragSession] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  useEffect(() => {
    if (!dragSession) return undefined
    const onMove = (e) => {
      const d = dragSession
      if (!d.engaged) {
        const dx = Math.abs(e.clientX - d.x)
        const dy = Math.abs(e.clientY - d.y)
        if (dx + dy < 10) return
        d.engaged = true
      }
      try {
        e.preventDefault()
      } catch {}
      const box = listRef.current
      if (!box) return
      const rows = box.querySelectorAll('.queue-row')
      if (!rows.length) return
      let target = d.from
      const y = e.clientY
      rows.forEach((el) => {
        const r = el.getBoundingClientRect()
        const idx = Number(el.dataset.idx)
        if (Number.isFinite(idx) && y >= r.top + r.height / 2) target = idx
      })
      if (target !== d.lastTarget) d.lastTarget = target
      setDragSession({ ...d, lastTarget: target })
    }
    const onUp = () => {
      const d = dragSession
      if (d && d.engaged && d.lastTarget != null && d.lastTarget !== d.from) {
        onReorder?.(d.from, d.lastTarget)
      }
      setDragSession(null)
    }
    const onCancel = () => setDragSession(null)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [dragSession, onReorder])

  const rowPointerDown = (e, i) => {
    if (e.target.closest('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    setDragSession({ from: i, x: e.clientX, y: e.clientY, engaged: false, lastTarget: i })
  }

  return (
    <div className="queue-sheet">
      <div className="queue-bar">
        <button className="queue-close" onClick={onClose} aria-label="Fechar fila">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="queue-title">Fila de reprodução</div>
      </div>

      <div className="queue-scroll">
        <div className="queue-now-head">
          <h3>Tocando agora</h3>
          <span className="queue-now-time">
            {formatTime(elapsed)} / {formatTime(duration)}
          </span>
        </div>
        <button className="queue-row now" onClick={onClose}>
          <Cover colors={track.cover} image={track.coverUrl} size={44} radius={9} />
          <div className="queue-meta">
            <span className="queue-row-title">{track.title}</span>
            <span className="queue-row-artist">{track.artist}</span>
          </div>
          <span className="queue-now-eq"><i /><i /><i /></span>
        </button>
        <div className="queue-progress">
          <div className="queue-progress-inner" style={{ width: `${Math.round((progress || 0) * 100)}%` }} />
        </div>

        <div className="queue-list-head">
          <h3>A seguir ({queue.length})</h3>
          {queue.length > 0 && (
            <button className="queue-clear" onClick={onClear}>Limpar</button>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="queue-empty">
            Nada na fila. As próximas músicas seguem a ordem da biblioteca. Toque em uma
            música da sua lista para ela entrar na fila automaticamente.
          </p>
        ) : (
          <div className="queue-list" ref={listRef}>
            {queue.map((t, i) => (
              <div
                className={`queue-row ${dragSession && dragSession.engaged && dragSession.from === i ? 'dragging' : ''} ${dragSession && dragSession.engaged && dragSession.lastTarget === i && dragSession.lastTarget !== dragSession.from ? 'drag-over' : ''}`}
                key={t.id}
                data-idx={i}
                onPointerDown={(e) => rowPointerDown(e, i)}
              >
                <button className="queue-row-main" onClick={() => onPlayItem(t.id)}>
                  <span className="queue-num">{i + 1}</span>
                  <Cover colors={t.cover} image={t.coverUrl} size={40} radius={8} />
                  <div className="queue-meta">
                    <span className="queue-row-title">{t.title}</span>
                    <span className="queue-row-artist">{t.artist}</span>
                  </div>
                  <span className="queue-dur">{t.duration ? formatTime(t.duration) : '--:--'}</span>
                </button>
                <div className="queue-actions">
                  <button className="icon-btn" onClick={() => onMoveItem(t.id, -1)} aria-label="Subir na fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 15 6-6 6 6" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => onMoveItem(t.id, 1)} aria-label="Descer na fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => onRemoveItem(t.id)} aria-label="Remover da fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0
  }
  return h
}

const ONLINE_GENRES = ['Pop', 'Rock', 'Sertanejo', 'MPB', 'Funk', 'Rap', 'Pagode', 'Eletrônica', 'Bossa Nova', 'Forró']

function OnlineView({ onlineTrack, onlinePlaying, onlineMode, onPlay, onToggle, onStop, pendingQuery, onConsumedQuery }) {
  const { elapsed, duration } = useProgress()
  const onlineProgress = duration ? elapsed / duration : 0
  const onlineElapsed = elapsed
  const onlineDuration = duration
  const [q, setQ] = useState(() => pendingQuery || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [resolveError, setResolveError] = useState(false)
  const [top, setTop] = useState([])
  const [topLoading, setTopLoading] = useState(true)
  const activeId = onlineTrack?.id
  const trimmed = q.trim()

  useEffect(() => {
    if (pendingQuery) onConsumedQuery?.()
  }, [pendingQuery, onConsumedQuery])

  useEffect(() => {
    let cancelled = false
    topTracks()
      .then((list) => {
        if (!cancelled) setTop(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTopLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const value = trimmed
    if (!value) return undefined
    const id = setTimeout(() => {
      searchAudiusTracks(value)
        .then((list) => {
          setResults(list)
          setSearching(false)
        })
        .catch(() => {
          setError(true)
          setSearching(false)
        })
    }, 450)
    return () => clearTimeout(id)
  }, [trimmed])

  const onQueryChange = (value) => {
    setQ(value)
    if (!value.trim()) {
      setResults([])
      setSearching(false)
      setError(false)
    } else {
      setSearching(true)
      setError(false)
    }
  }

  const playItem = (item, preview) => {
    if (!item) return
    setLoadingId(`${item.id}:${preview ? 'p' : 'f'}`)
    setResolveError(false)
    const direct = item.streamUrl || item.stream
    const resolve = direct ? Promise.resolve({ url: direct }) : resolveAudiusStream(item.audiusId)
    resolve
      .then((r) => {
        onPlay(
          {
            ...item,
            stream: r.url,
            playDuration: item.duration || r.playDuration || 0,
          },
          { preview },
        )
      })
      .catch(() => {
        setResolveError(true)
        setTimeout(() => setResolveError(false), 4000)
      })
      .finally(() => setLoadingId(null))
  }

  const rowClick = (item) => {
    if (activeId === item.id && onlineMode === 'full') {
      onToggle()
      return
    }
    playItem(item, false)
  }

  const previewClick = (item) => {
    if (activeId === item.id && onlineMode === 'preview') {
      onToggle()
      return
    }
    playItem(item, true)
  }

  const cover = (item, size) => (
    <Cover
      colors={featuredCovers[hashStr(item.id) % featuredCovers.length]}
      image={item.coverUrl}
      size={size}
      radius={8}
    />
  )

  return (
    <section className="view online-view">
      <div className="lib-head">
        <h1 className="greeting">Músicas online</h1>
      </div>
      <p className="online-sub">
        Músicas completas e gratuitas via Audius: artistas independentes, eletrônica, indie,
        hip-hop e remixes. A faixa toca inteira, sem limite de tempo.
      </p>

      <div className="online-search">
        <svg className="online-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          className="online-search-input"
          placeholder={'Pesquisar música… ex.: "ODESZA" ou "lo-fi"'}
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {searching && <span className="online-spin" aria-label="Buscando" />}
      </div>

      {!trimmed && (
        <>
          <div className="online-chips">
            {ONLINE_GENRES.map((g) => (
              <button key={g} className="chip" onClick={() => onQueryChange(g)}>{g}</button>
            ))}
          </div>

          <h2 className="section-title">Em alta agora</h2>
          {topLoading ? (
            <div className="empty-state">
              <div className="empty-cover spin">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                </svg>
              </div>
              <p>Carregando sugestões…</p>
            </div>
          ) : top.length ? (
            <div className="online-carousel">
              {top.map((item) => (
                <div className="online-card-wrap" key={item.id}>
                  <button className="online-card" onClick={() => rowClick(item)}>
                    <span className="online-card-cover">{cover(item, 132)}</span>
                    <span className="online-card-title">{item.title}</span>
                    <span className="online-card-artist">{item.artist}</span>
                  </button>
                  <button
                    className="online-card-preview"
                    onClick={() => previewClick(item)}
                    title="Ouvir prévia de 30s"
                    aria-label="Ouvir prévia de 30 segundos"
                  >
                    30s
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Não foi possível carregar as sugestões agora.</p>
          )}
        </>
      )}

      {trimmed && (
        <>
          {searching && !results.length ? (
            <div className="empty-state">
              <div className="empty-cover spin">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                </svg>
              </div>
              <p>Buscando…</p>
            </div>
          ) : error ? (
            <p className="empty">Não foi possível buscar agora. Verifique sua conexão e tente de novo.</p>
          ) : results.length ? (
            <div className="section">
              <h2 className="section-title">Resultados para “{trimmed}”</h2>
              <div className="online-list">
                {results.map((item, i) => {
                  const active = activeId === item.id
                  const activeFull = active && onlineMode === 'full'
                  const activePreview = active && onlineMode === 'preview'
                  const loadingFull = loadingId === `${item.id}:f`
                  const loadingPreview = loadingId === `${item.id}:p`
                  return (
                    <div className={`track-row ${active ? 'active' : ''}`} key={item.id}>
                      <span className="track-num">{active ? '♪' : i + 1}</span>
                      {cover(item, 40)}
                      <div className="track-main">
                        <span className="track-title">{item.title}</span>
                        <span className="track-artist">{item.artist}</span>
                      </div>
                      <span className="track-album">{item.album}</span>
                      <span className="online-badge audius">Audius</span>
                      <button
                        className={`row-preview ${activePreview ? 'active' : ''}`}
                        onClick={() => previewClick(item)}
                        title="Ouvir prévia de 30s"
                        aria-label={
                          loadingPreview ? 'Carregando prévia' : activePreview && onlinePlaying ? 'Pausar prévia' : 'Ouvir prévia de 30 segundos'
                        }
                      >
                        {loadingPreview ? (
                          <span className="online-spin" style={{ width: 12, height: 12 }} />
                        ) : activePreview && onlinePlaying ? (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                        ) : (
                          '30s'
                        )}
                      </button>
                      <button
                        className="row-play"
                        onClick={() => rowClick(item)}
                        aria-label={
                          loadingFull
                            ? 'Carregando'
                            : activeFull && onlinePlaying
                              ? 'Pausar'
                              : 'Tocar música completa'
                        }
                      >
                        {loadingFull ? (
                          <span className="online-spin" style={{ width: 14, height: 14 }} />
                        ) : activeFull && onlinePlaying ? (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
              {resolveError && (
                <p className="online-note warn">
                  Não consegui carregar o áudio desta faixa agora. Tente outra ou toque de novo.
                </p>
              )}
              <p className="online-note">
                Faixas completas da Audius, sem limite de tempo. Catálogo de artistas
                independentes — se a música que procura não aparecer, tente o nome do artista ou
                a banda/estilo.
              </p>
            </div>
          ) : (
            <p className="empty">Nada encontrado para “{trimmed}”. Tente outra grafia ou artista.</p>
          )}
        </>
      )}

      {onlineTrack && (
        <div className="online-mini">
          {cover(onlineTrack, 44)}
          <div className="om-meta">
            <span className="om-title">{onlineTrack.title}</span>
            <span className="om-artist">{onlineTrack.artist}</span>
            <div className="om-progress">
              <div className="om-progress-inner" style={{ width: `${Math.round(onlineProgress * 100)}%` }} />
            </div>
          </div>
          <span className="om-time">
            {formatTime(onlineElapsed)} <b>/ {formatTime(onlineDuration || onlineTrack.playDuration || 0)}</b>
          </span>
          <button className="om-play" onClick={onToggle} aria-label={onlinePlaying ? 'Pausar' : 'Tocar'}>
            {onlinePlaying ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button className="om-stop" onClick={onStop} aria-label="Parar música">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </section>
  )
}

function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function makeThumb(blob, max = 320) {
  try {
    if (!blob || !/^image\//.test(blob.type || '')) return blob
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!out) return blob
    return out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}

function extFromType(type) {
  const t = (type || '').split(';')[0].toLowerCase()
  if (t.includes('flac')) return 'flac'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('wav')) return 'wav'
  if (t.includes('m4a')) return 'm4a'
  if (t.includes('mp4')) return 'm4a'
  if (t.includes('aac')) return 'aac'
  if (t.includes('mpeg')) return 'mp3'
  return 'mp3'
}

async function shareBlobNative(blob, fileName, meta) {
  const dataUrl = await blobToDataUrl(blob)
  const base64 = dataUrl ? dataUrl.split(',')[1] : ''
  if (!base64) throw new Error('arquivo vazio')
  const safeName = (fileName || 'arquivo').replace(/[^\w\-. ]+/g, '_').slice(-90)
  await Filesystem.writeFile({
    path: safeName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  })
  const { uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache })
  await CapShare.share({ ...meta, files: [uri] })
}

function NavIcon({ name }) {
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5v9.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19.7z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    online: <><circle cx="12" cy="12" r="9" /><path d="M8.2 8.9a5.8 5.8 0 0 0 0 6.2M15.8 8.9a5.8 5.8 0 0 1 0 6.2" /><circle cx="12" cy="12" r="1.7" /></>,
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    library: <path d="M9 18V5l12-2v13" />,
    eq: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.7 5.7l1.4 1.4M17 17l1.4 1.4M18.3 5.7 17 7M7 17l-1.4 1.4" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  )
}

function ApkDownloadButton() {
  const [size, setSize] = useState(null)
  useEffect(() => {
    fetch('./apk/nebulatune.apk', { method: 'HEAD' })
      .then((res) => {
        const len = res.headers.get('content-length')
        if (len) setSize(Number(len))
      })
      .catch(() => {})
  }, [])
  return (
    <a className="btn-primary" href="./apk/nebulatune.apk" download="NebulaTune.apk">
      Baixar APK{size ? ` · ${fmtBytes(size)}` : ''}
    </a>
  )
}

function SettingsView({ settings, api, library, onClearLibrary, isIOS, isAppInstalled, installEvt, onInstall, isNative, onImport, onShareApp, onImportFolder, onImportDevice, onOpenChangelog, onClearCache, cacheCleanMsg }) {
  const [storage, setStorage] = useState(null)
  const [exported, setExported] = useState(false)
  const [imported, setImported] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [latestVersion, setLatestVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateError, setUpdateError] = useState(false)
  const importInputRef = useRef(null)

  const updateHost = SITE_URL ? (() => {
    try {
      return new URL(SITE_URL).host
    } catch {
      return ''
    }
  })() : ''
  const updateReachable = !!updateHost && !['localhost', '127.0.0.1', '0.0.0.0'].some((h) => updateHost.startsWith(h))

  const checkUpdate = async () => {
    if (checking || updating) return
    setChecking(true)
    setUpdateMsg('')
    setUpdateError(false)
    try {
      const latest = await fetchLatestVersion()
      setLatestVersion(latest)
      if (!isNewer(latest, APP_VERSION)) {
        setUpdateMsg(`Você já está na versão mais recente (${APP_VERSION}).`)
        return
      }
      setUpdateMsg(`Nova versão ${latest} encontrada. Baixando…`)
      setUpdating(true)
      try {
        await installUpdate()
        setUpdateMsg('Download pronto! Confirme a instalação quando o Android pedir.')
      } catch {
        setUpdateError(true)
        setUpdateMsg(`Não consegui baixar automaticamente. Baixe em: ${APK_URL}`)
      } finally {
        setUpdating(false)
      }
    } catch {
      setUpdateError(true)
      setUpdateMsg('Não foi possível verificar agora. Tente de novo.')
    } finally {
      setChecking(false)
    }
  }

  const refreshStorage = useCallback(() => {
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => setStorage(est))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    refreshStorage()
  }, [refreshStorage])

  const exportLibrary = async () => {
    if (!library.length || exporting) return
    setExporting(true)
    try {
      const items = []
      for (const t of library) {
        items.push({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: Math.round(t.duration || 0),
          cover: t.cover,
          fav: t.fav === true,
          plays: t.plays || 0,
          addedAt: t.addedAt || Date.now(),
          audioData: await blobToDataUrl(t.audioBlob),
          coverData: await blobToDataUrl(t.coverBlob),
          coverRemote: t.coverRemote || null,
        })
      }
      const data = {
        app: 'NebulaTune',
        type: 'backup-completo',
        exportedAt: new Date().toISOString(),
        count: items.length,
        tracks: items,
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nebulatune-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setExported(true)
      setTimeout(() => setExported(false), 3500)
    } finally {
      setExporting(false)
    }
  }

  const importLibraryFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || importing) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data || data.app !== 'NebulaTune' || !Array.isArray(data.tracks)) {
          window.alert('Este arquivo não parece ser um backup do NebulaTune.')
          return
        }
        const now = Date.now()
        const tracks = data.tracks
          .filter((t) => t && t.audioData)
          .map((t, i) => {
            const audioBlob = dataUrlToBlob(t.audioData)
            const coverBlob = dataUrlToBlob(t.coverData)
            return {
              id: typeof t.id === 'string' && t.id ? t.id : `restore-${now}-${i}`,
              title: t.title || 'Sem título',
              artist: t.artist || 'Desconhecido',
              album: t.album || '',
              duration: t.duration || 0,
              cover: Array.isArray(t.cover) ? t.cover : null,
              fav: t.fav === true,
              plays: t.plays || 0,
              addedAt: t.addedAt || now + i,
              audioBlob,
              coverBlob,
              coverRemote: t.coverRemote || null,
              src: URL.createObjectURL(audioBlob),
              coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : t.coverRemote || null,
            }
          })
        if (!tracks.length) {
          window.alert('Nenhuma música com áudio encontrada neste backup.')
          return
        }
        onImport(tracks)
        setImported(true)
        setTimeout(() => setImported(false), 3500)
        refreshStorage()
      } catch (err) {
        window.alert('Não foi possível importar o backup: ' + (err.message || err))
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      setImporting(false)
      window.alert('Erro ao ler o arquivo.')
    }
    reader.readAsText(file)
  }

  return (
    <section className="view">
      <h1 className="greeting">Configurações</h1>

      <div className="settings-card">
        <h2 className="section-title">Aparência</h2>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Som do gatinho</span>
            <span className="settings-desc">Miado do bichinho ao tocar ou quando algo bom acontece.</span>
          </div>
          <button
            className={`eq-switch ${settings.petSound !== false ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.petSound !== false}
            onClick={() => api.setPetSound(!(settings.petSound !== false))}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Fundo animado</span>
            <span className="settings-desc">Estrelas pulsantes no fundo do app.</span>
          </div>
          <button
            className={`eq-switch ${settings.bgAnimated ? 'on' : ''}`}
            aria-checked={settings.bgAnimated}
            onClick={() => api.setBgAnimated(!settings.bgAnimated)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Cosmos animado</span>
            <span className="settings-desc">Nebulas e galáxias coloridas no fundo.</span>
          </div>
          <button
            className={`eq-switch ${settings.cosmosAnimated ? 'on' : ''}`}
            aria-checked={settings.cosmosAnimated}
            onClick={() => api.setCosmosAnimated(!settings.cosmosAnimated)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Online</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Buscar capas na internet</span>
            <span className="settings-desc">
              Procura a capa no iTunes ao adicionar músicas.
            </span>
          </div>
          <button
            className={`eq-switch ${settings.fetchCovers ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.fetchCovers}
            onClick={() => api.setFetchCovers(!settings.fetchCovers)}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title">Dados</h2>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Armazenamento</span>
            <span className="settings-desc">
              {storage
                ? `${fmtBytes(storage.usage)} usados de ${fmtBytes(storage.quota)} disponíveis.`
                : 'Calculando…'}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={refreshStorage}>
              Atualizar
            </button>
            <button
              className="btn-ghost btn-ghost-danger"
              onClick={() => {
                if (window.confirm('Remover todas as músicas da biblioteca e liberar espaço?')) {
                  onClearLibrary()
                  setTimeout(refreshStorage, 400)
                }
              }}
            >
              Liberar espaço
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Exportar biblioteca</span>
            <span className="settings-desc">
              {library.length
                ? `Baixa um backup com ${library.length} ${library.length === 1 ? 'música' : 'músicas'} (arquivos de áudio inclusos).`
                : 'Nenhuma música para exportar.'}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={exportLibrary} disabled={!library.length || exporting}>
              {exporting ? 'Exportando…' : exported ? 'Exportado ✓' : 'Exportar backup'}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Importar biblioteca</span>
            <span className="settings-desc">
              Restaura um backup feito aqui. As músicas novas são adicionadas ao que já existe.
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={() => importInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importando…' : imported ? 'Importado ✓' : 'Importar backup'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={importLibraryFile}
            />
          </div>
        </div>
      </div>
    <div className="settings-card">
        <h2 className="section-title">Aplicativo</h2>
        {isNative ? (
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">Atualizar o app</span>
              <span className="settings-desc">
                Versão instalada: {APP_VERSION}.
                {latestVersion
                  ? ` Última disponível: ${latestVersion}.`
                  : ' Toque em Atualizar para verificar se há uma versão nova.'}
              </span>
              {updateMsg && (
                <span className={`settings-note${updateError ? ' settings-note-error' : ''}`}>
                  {updateMsg}
                </span>
              )}
            </div>
            {updateReachable && (
              <div className="settings-actions">
                <button className="btn-primary" onClick={checkUpdate} disabled={checking || updating}>
                  {checking ? 'Verificando…' : updating ? 'Baixando…' : 'Atualizar'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="settings-row">
              <div className="settings-info">
                <span className="settings-label">Instalar no dispositivo</span>
                <span className="settings-desc">
                  {isIOS
                    ? 'No Safari use Compartilhar e toque em "Adicionar à Tela de Início".'
                    : isAppInstalled
                      ? 'O NebulaTune já está instalado no seu dispositivo.'
                      : 'Instala como app de tela cheia, com ícone na tela inicial e uso offline.'}
                </span>
              </div>
              {!isIOS && !isAppInstalled && (
                <button className={`btn-primary ${installEvt ? '' : 'disabled'}`} onClick={onInstall} disabled={!installEvt}>
                  Instalar app
                </button>
              )}
            </div>
            {!isIOS && (
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Baixar APK para Android</span>
                  <span className="settings-desc">
                    Arquivo de instalação do app (Android 7.0+). Atualizações substituem a versão antiga.
                  </span>
                </div>
                <div className="settings-actions">
                  <ApkDownloadButton />
                </div>
              </div>
            )}
          </>
        )}
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Importar uma pasta</span>
            <span className="settings-desc">
              Escolhe uma pasta inteira com músicas e adiciona tudo de uma vez.
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onImportFolder} hidden={isNative}>
              Escolher pasta
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Importar músicas do aparelho</span>
            <span className="settings-desc">
              Lê as músicas baixadas no telefone (arquivos MP3 e afins).
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onImportDevice} hidden={!isNative}>
              Importar
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Limpar cache</span>
            <span className="settings-desc">
              Apaga arquivos temporários e sobras de atualizações para liberar espaço.
              Suas músicas não são apagadas.
            </span>
            {cacheCleanMsg && <span className="settings-note">{cacheCleanMsg}</span>}
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onClearCache}>
              Limpar
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Novidades e correções</span>
            <span className="settings-desc">
              Veja o que há de novo e o que foi consertado em cada versão do app.
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onOpenChangelog}>
              Abrir
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <span className="settings-label">Compartilhar o app</span>
            <span className="settings-desc">Envia o NebulaTune (arquivo APK) para outra pessoa instalar.</span>
          </div>
          <div className="settings-actions">
            <button className="btn-ghost" onClick={onShareApp}>
              Compartilhar
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   Tela bonita de boas-vindas / login (1ª vez,
   sem conta, ou depois de sair da conta)
   ───────────────────────────────────────────── */
function sleepNativeStart(timestampMs) {
  try {
    if (IS_NATIVE && window.Capacitor?.Plugins?.SleepTimer) {
      window.Capacitor.Plugins.SleepTimer.start({ timestamp: timestampMs })
    }
  } catch {}
}

function sleepNativeCancel() {
  try {
    if (IS_NATIVE && window.Capacitor?.Plugins?.SleepTimer) {
      window.Capacitor.Plugins.SleepTimer.cancel()
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.__nebulaSleepPause = () => {
    window.dispatchEvent(new CustomEvent('nebulatune:sleepfire'))
  }
}

function App() {
  const [library, setLibrary] = useState([])
  const [loadingLib, setLoadingLib] = useState(false)
  const [cacheCleanMsg, setCacheCleanMsg] = useState('')
  const [view, setView] = useState('inicio')
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [audioDepth, setAudioDepth] = useState('')
  const [installEvt, setInstallEvt] = useState(null)
  const [isAppInstalled, setIsAppInstalled] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const eq = useEqualizer()
  const { settings: appSettings, api: settingsApi } = useSettings()
  const greetIdxRef = useRef(0)
  const nextPetGreet = useCallback((name, empty) => {
    greetIdxRef.current = (greetIdxRef.current + 1) % PET_GREETINGS.length
    const tpl = PET_GREETINGS[greetIdxRef.current]
    return empty ? PET_GREETINGS[0]() : tpl(name || '')
  }, [])
  const [petGreet, setPetGreet] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)
  useEffect(() => {
    if (!notifOpen) return undefined
    const onDown = (e) => {
      if (!notifRef.current?.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [notifOpen])
  useEffect(() => {
    if (view !== 'inicio') return undefined
    setPetGreet(nextPetGreet(appSettings.userName || '', library.length === 0 && !loadingLib))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loadingLib, library.length, appSettings.userName])
  const { petStats, bumpPet } = usePetStats()
  const topTracks = useMemo(
    () => [...library].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 10),
    [library],
  )
  const handlePetAction = useCallback(
    (a) => {
      const map = { touch: 'touches', heart: 'hearts', scared: 'scares', sleep: 'sleeps', meow: 'meows' }
      const k = map[a]
      if (k) {
        bumpPet(k)
        if (k === 'touches') bumpPet('coins', 2)
      }
    },
    [bumpPet],
  )
  const [cheer, setCheer] = useState(null)
  const cheerIdRef = useRef(0)
  const topSeenRef = useRef(null)
  const playsCheeredRef = useRef(new Set())
  const favBaseRef = useRef(null)
  const favCelebRef = useRef(0)
  const idleSinceRef = useRef(Date.now())
  const dragCounter = useRef(0)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const libraryRef = useRef([])
  const savedBlobsRef = useRef({})
  const [updatePrompt, setUpdatePrompt] = useState(null)
  const [updateInstalling, setUpdateInstalling] = useState(false)
  const [updateInstallMsg, setUpdateInstallMsg] = useState('')

  useEffect(() => {
    libraryRef.current = library
  }, [library])

  // Hidrata a biblioteca 100% local: metadados do localStorage + áudio/capa do
  // IndexedDB. O app abre direto na tela principal, sem login.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = readLocal('nt.library')
      if (!alive || !Array.isArray(rows)) return
      setLoadingLib(true)
      const hydrated = []
      for (const row of rows) {
        const media = await loadMediaBlobs(row.id)
        if (!alive) return
        const audioBlob = media.audio || null
        const coverBlob = media.cover || null
        const prevCover =
          row.coverUrl && row.coverUrl.startsWith('blob:') ? null : row.coverUrl || null
        hydrated.push({
          ...row,
          audioBlob,
          src: audioBlob ? URL.createObjectURL(audioBlob) : null,
          coverBlob,
          coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : prevCover,
          audioMissing: row.audioMissing === true && !audioBlob,
        })
      }
      if (!alive) return
      setLibrary(hydrated)
      requestAnimationFrame(() => setLoadingLib(false))
    })()
    return () => {
      alive = false
    }
  }, [])

  // Salva a biblioteca localmente (debounce): metadados + blobs novos.
  useEffect(() => {
    const t = setTimeout(() => {
      const rows = library
        .filter((x) => x && x.id)
        .map((x) => ({
          id: x.id,
          title: x.title || '',
          artist: x.artist || '',
          album: x.album || '',
          duration: x.duration || 0,
          cover: Array.isArray(x.cover) ? x.cover : null,
          coverRemote: x.coverRemote || null,
          addedAt: x.addedAt || Date.now(),
          fav: x.fav === true,
          plays: x.plays || 0,
          playDays: x.playDays || {},
          audioMissing: x.audioMissing === true,
        }))
      writeLocal('nt.library', rows)
      library.forEach((x) => {
        if (!x || !x.id) return
        const sig = `${x.audioBlob ? String(x.audioBlob.size) + ':' + String(x.audioBlob.type) : ''}|${x.coverBlob ? String(x.coverBlob.size) + ':' + String(x.coverBlob.type) : ''}`
        if (savedBlobsRef.current[x.id] === sig) return
        savedBlobsRef.current[x.id] = sig
        const blobs = {}
        if (x.audioBlob && (x.audioBlob.size || x.audioBlob.type)) blobs.audio = x.audioBlob
        if (x.coverBlob && x.coverBlob.size) blobs.cover = x.coverBlob
        saveMediaBlobs(x.id, blobs)
      })
    }, 600)
    return () => clearTimeout(t)
  }, [library])

  useEffect(() => {
    const mark = () => {
      idleSinceRef.current = Date.now()
    }
    const evs = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel', 'scroll']
    evs.forEach((ev) => window.addEventListener(ev, mark, { passive: true }))
    return () => {
      evs.forEach((ev) => window.removeEventListener(ev, mark))
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!IS_NATIVE) return undefined
    let active = true
    ;(async () => {
      try {
        const latest = await fetchLatestVersion()
        if (!active) return
        if (isNewer(latest, APP_VERSION) && !wasUpdatePrompted(latest)) {
          markUpdatePrompted(latest)
          setUpdatePrompt(latest)
          requestNotificationsPermission()
          notifyUpdateAvailable(latest)
        }
      } catch {
        /* sem internet ou site indisponível: tenta de novo na próxima abertura */
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const postponeUpdate = () => {
    setUpdatePrompt(null)
    setUpdateInstallMsg('')
  }

  const installNow = async () => {
    if (updateInstalling) return
    setUpdateInstalling(true)
    setUpdateInstallMsg('')
    try {
      await installUpdate()
      setUpdateInstallMsg('Download pronto! Confirme a instalação quando o Android pedir.')
    } catch {
      setUpdateInstallMsg(`Não consegui baixar. Use o botão em Configurações ou acesse ${APK_URL}.`)
    } finally {
      setUpdateInstalling(false)
    }
  }

  useEffect(() => {
    // A biblioteca NÃO é mais gravada no aparelho: ela existe na memória
    // durante o uso e é trazida da conta (nuvem) ao entrar. Nada fica salvo.
  }, [])

  const todayKey = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const countPlay = useCallback((i) => {
    const key = todayKey()
    if (bumpPet) bumpPet('coins', 1)
    setLibrary((prev) => {
      const t = prev[i]
      if (!t) return prev
      const days = t.playDays || {}
      return prev.map((x) =>
        x.id === t.id
          ? { ...x, plays: (x.plays || 0) + 1, playDays: { ...days, [key]: (days[key] || 0) + 1 } }
          : x,
)
    })
  }, [bumpPet])

  const [playlists, setPlaylists] = useState(() => readLocal('nt.playlists') || [])

  useEffect(() => {
    writeLocal('nt.playlists', playlists)
  }, [playlists])

  const [activePlaylist, setActivePlaylist] = useState(null)
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState(null)
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false)
  const [renamePlaylistOpen, setRenamePlaylistOpen] = useState(false)
  const [trackPickerPlaylist, setTrackPickerPlaylist] = useState(null)
  const [changelogOpen, setChangelogOpen] = useState(false)

  const createPlaylist = useCallback((name) => {
    const n = (name || '').trim()
    if (!n) return null
    const pl = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: n.slice(0, 60),
      trackIds: [],
      createdAt: Date.now(),
    }
    setPlaylists((prev) => [...prev, pl])
    return pl.id
  }, [])

  const renamePlaylist = useCallback(
    (id, name) => {
      const n = (name || '').trim().slice(0, 60)
      if (!n) return
      setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name: n } : p)))
    },
    [],
  )

  const removePlaylist = useCallback(
    (id) => {
      setPlaylists((prev) => prev.filter((p) => p.id !== id))
      if (activePlaylist === id) setActivePlaylist(null)
    },
    [activePlaylist],
  )

  const addToPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p
        if (p.trackIds.includes(trackId)) return p
        return { ...p, trackIds: [...p.trackIds, trackId] }
      }),
    )
  }, [])

  const addTracksToPlaylist = useCallback(
    (playlistId, ids) => {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p
          const set = new Set(p.trackIds)
          ids.forEach((id) => set.add(id))
          return { ...p, trackIds: [...set] }
        }),
      )
    },
    [],
  )

  const removeFromPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p,
      ),
    )
  }, [])

  const [recentSearches, setRecentSearches] = useState([])

  const addRecentSearch = useCallback((q) => {
    const term = (q || '').trim().toLowerCase()
    if (!term) return
    setRecentSearches((prev) => [term, ...prev.filter((x) => x !== term)].slice(0, 8))
  }, [])

  const clearRecentSearches = useCallback(() => setRecentSearches([]), [])

  const [deviceMusic, setDeviceMusic] = useState(null)
  const [deviceImportOpen, setDeviceImportOpen] = useState(false)
  const [deviceImporting, setDeviceImporting] = useState(false)
  const [deviceSelection, setDeviceSelection] = useState({})

  const progressSink = useRef(null)

  const {
    currentIndex,
    playing,
    toggle,
    select,
    playByList: playerPlayByList,
    next,
    prev,
    seek,
    stopAndReset,
    repeat,
    shuffle,
    cycleRepeat,
    toggleShuffle,
    pausePlayback,
    queue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    reorderQueue,
    playQueueItem,
    queueAdd,
    queueNext,
  } = usePlayer(library, appSettings.speed, countPlay, progressSink)

  const onlinePlayer = useOnlinePlayer(appSettings.speed, progressSink)
  const {
    track: onlineTrack,
    playing: onlinePlaying,
    mode: onlineMode,
    play: playOnline,
    toggle: toggleOnline,
    seek: seekOnline,
    stop: stopOnline,
  } = onlinePlayer

  const track = library[Math.min(currentIndex, library.length - 1)] || library[0]

  const onlineActive = !!onlineTrack
  const displayTrack = useMemo(
    () =>
      onlineActive
        ? { ...onlineTrack, cover: featuredCovers[hashStr(onlineTrack.id) % featuredCovers.length], fav: false }
        : track,
    [onlineActive, onlineTrack, track],
  )
  const mood = useMoodDetector({ playing: !!playing, sig: track?.id })
  const displayPlaying = onlineActive ? onlinePlaying : playing
  const displayToggle = onlineActive ? toggleOnline : toggle
  const displaySeek = onlineActive ? seekOnline : seek
  const recent = useMemo(() => library.slice(0, 8), [library])
  const recentRow = useMemo(() => recent.slice(0, 10), [recent])
  const favoriteTracks = useMemo(() => library.filter((t) => t.fav), [library])
  const queueTracks = useMemo(() => queue.map((id) => library.find((t) => t.id === id)).filter(Boolean), [queue, library])
  const [showQueue, setShowQueue] = useState(false)
  const [pendingOnlineQuery, setPendingOnlineQuery] = useState('')
  const [editingTrack, setEditingTrack] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimerRef = useRef(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(''), 2200)
  }, [])

  const [lyricsByTrack, setLyricsByTrack] = useState({})
  const loadedLyricsRef = useRef(new Set())
  const displayTrackRef = useRef(displayTrack)

  const storeLyrics = useCallback((id, value) => {
    setLyricsByTrack((prev) => {
      const next = { ...prev, [id]: value }
      const keys = Object.keys(next)
      if (keys.length > LYRICS_CACHE_MAX) {
        for (const k of keys.slice(0, keys.length - LYRICS_CACHE_MAX)) {
          delete next[k]
          loadedLyricsRef.current.delete(k)
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    displayTrackRef.current = displayTrack
  }, [displayTrack])

  const [sleepMode, setSleepMode] = useState(null)
  const [sleepEndsAt, setSleepEndsAt] = useState(null)
  const [sleepRemaining, setSleepRemaining] = useState(null)
  const sleepTrackRef = useRef(null)
  const liveRef = useRef({ playing: false, onlineActive: false })
  const liveProgressRef = useRef({ elapsed: 0, duration: 0 })

  useEffect(() => {
    liveRef.current = { playing, onlineActive }
  })

  const stopSleepTimer = useCallback(() => {
    setSleepMode(null)
    setSleepEndsAt(null)
    setSleepRemaining(null)
    sleepTrackRef.current = null
    sleepNativeCancel()
    const live = liveRef.current
    if (live.playing) pausePlayback()
    if (live.onlineActive) stopOnline()
    showToast('⏰ Hora de descansar!')
  }, [pausePlayback, stopOnline, showToast])

  const startSleep = useCallback(
    (minutes) => {
      setSleepMode(String(minutes))
      if (minutes === 'end') {
        sleepTrackRef.current = displayTrackRef.current?.id || null
        setSleepEndsAt(null)
        setSleepRemaining(null)
        const p = liveProgressRef.current
        const remMs = (p.duration - p.elapsed) * 1000
        sleepNativeStart(Date.now() + Math.max(3000, remMs + 1500))
        showToast('Vou parar no fim desta música')
        return
      }
      setSleepEndsAt(Date.now() + Number(minutes) * 60000)
      setSleepRemaining(Number(minutes) * 60)
      sleepNativeStart(Date.now() + Number(minutes) * 60000)
      showToast(`Timer de desligar: ${minutes} min`)
    },
    [showToast],
  )

  useEffect(() => {
    if (!sleepEndsAt) return undefined
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 1000))
      setSleepRemaining(rem)
      if (rem <= 0) stopSleepTimer()
    }, 1000)
    return () => clearInterval(id)
  }, [sleepEndsAt, stopSleepTimer])

  useEffect(() => {
    if (sleepMode !== 'end') return undefined
    const id = setInterval(() => {
      const currentId = displayTrackRef.current?.id || null
      if (!sleepTrackRef.current || sleepTrackRef.current !== currentId) {
        sleepTrackRef.current = currentId
        return
      }
      const live = liveProgressRef.current
      if (live.duration > 0 && live.elapsed >= live.duration - 0.6) {
        stopSleepTimer()
      }
    }, 500)
    return () => clearInterval(id)
  }, [sleepMode, stopSleepTimer])

  useEffect(() => {
    const h = () => {
      if (sleepMode) stopSleepTimer()
    }
    window.addEventListener('nebulatune:sleepfire', h)
    return () => window.removeEventListener('nebulatune:sleepfire', h)
  }, [sleepMode, stopSleepTimer])

  const trackId = displayTrack?.id

  useEffect(() => {
    if (!trackId || !playing || !library.length) return
    const cur = library.find((t) => t.id === trackId)
    if (!cur) return
    const curPlays = cur.plays || 0
    if (curPlays > 0 && curPlays % 10 === 0 && !playsCheeredRef.current.has(`${trackId}:${curPlays}`)) {
      playsCheeredRef.current.add(`${trackId}:${curPlays}`)
      cheerIdRef.current += 1
      setCheer({ id: cheerIdRef.current, text: `essa você já ouviu ${curPlays} vezes! é tua!` })
      return
    }
    if (curPlays >= 3 && topSeenRef.current !== trackId) {
      const isTop = library.every((t) => t.id === trackId || (t.plays || 0) <= curPlays)
      if (isTop) {
        topSeenRef.current = trackId
        cheerIdRef.current += 1
        const phrases = ['essa é a tua preferida!', 'aaa, essa é a tua cara!', 'tua música!']
        setCheer({ id: cheerIdRef.current, text: phrases[Math.floor(Math.random() * phrases.length)] })
      }
    }
  }, [trackId, playing, library])

  useEffect(() => {
    const favCount = library.filter((t) => t.fav).length
    if (favBaseRef.current == null) favBaseRef.current = favCount
    if (favCount > favBaseRef.current && favCount % 10 === 0 && favCount > favCelebRef.current) {
      favCelebRef.current = favCount
      cheerIdRef.current += 1
      const phrases = [
        `${favCount} favoritas no coração!`,
        `uff, ${favCount} favoritas!`,
        `já são ${favCount} músicas que você ama!`,
      ]
      setCheer({ id: cheerIdRef.current, text: phrases[Math.floor(Math.random() * phrases.length)] })
    }
  }, [library])

  useEffect(() => {
    if (!trackId || loadedLyricsRef.current.has(trackId)) return undefined
    let cancelled = false
    const current = displayTrackRef.current
    fetchLyrics(current?.title, current?.artist, current?.duration).then((data) => {
      if (cancelled) return
      loadedLyricsRef.current.add(trackId)
      const value = data ? { status: 'done', ...data } : { status: 'notfound' }
      storeLyrics(trackId, value)
    })
    return () => {
      cancelled = true
    }
  }, [trackId, storeLyrics])

  const lyrics = trackId ? lyricsByTrack[trackId] || { status: 'loading' } : null

  const applyManualLyrics = useCallback(
    (candidate) => {
      if (!trackId) return
      const built = buildLyrics(candidate)
      const value = built ? { status: 'done', ...built } : { status: 'notfound' }
      loadedLyricsRef.current.add(trackId)
      storeLyrics(trackId, value)
    },
    [trackId, storeLyrics],
  )

  const [syncOffsets, setSyncOffsets] = useState(() => readLocal('nt.lyricSync') || {})

  useEffect(() => {
    writeLocal('nt.lyricSync', syncOffsets)
  }, [syncOffsets])

  const adjustSync = useCallback((id, delta) => {
    setSyncOffsets((prev) => {
      const next = { ...prev, [id]: Math.round(((prev[id] || 0) + delta) * 10) / 10 }
      return next
    })
  }, [])

  const syncOffset = trackId ? syncOffsets[trackId] || 0 : 0
  const firstLineTime = lyrics?.lines?.[0]?.time
  const hasTimestamp = firstLineTime != null

  const alignLyrics = useCallback(() => {
    if (!trackId || !hasTimestamp) return
    adjustSync(trackId, Math.round((liveProgressRef.current.elapsed - firstLineTime - syncOffset) * 10) / 10)
  }, [trackId, hasTimestamp, firstLineTime, syncOffset, adjustSync])

  const removeTrack = useCallback(
    (id) => {
      const t = library.find((x) => x.id === id)
      if (!t) return
      stopAndReset()
      setLibrary((prev) => prev.filter((x) => x.id !== id))
      setPlaylists((prev) => prev.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })))
      if (t.src) URL.revokeObjectURL(t.src)
      if (t.coverUrl && t.coverUrl.startsWith('blob:')) URL.revokeObjectURL(t.coverUrl)
      deleteMediaBlobs(id)
    },
    [library, stopAndReset],
  )

  const clearLibrary = useCallback(() => {
    if (!window.confirm('Remover todas as músicas da biblioteca?')) return
    stopAndReset()
    library.forEach((t) => {
      if (t.src) URL.revokeObjectURL(t.src)
      if (t.coverUrl && t.coverUrl.startsWith('blob:')) URL.revokeObjectURL(t.coverUrl)
    })
    setLibrary([])
  }, [library, stopAndReset])

  const results = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return library.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    )
  }, [query, library])

  const [favPing, setFavPing] = useState(0)

  const toggleFavorite = useCallback((id) => {
    const wasFav = libraryRef.current?.find((t) => t.id === id)?.fav
    setLibrary((prev) => prev.map((t) => (t.id === id ? { ...t, fav: !t.fav } : t)))
    if (!wasFav) setFavPing((n) => n + 1)
  }, [])

  const startOnline = useCallback(
    (item, opts) => {
      if (playing) pausePlayback()
      playOnline(item, opts)
    },
    [playing, pausePlayback, playOnline],
  )

  const nextLocal = useCallback(() => {
    stopOnline()
    next()
  }, [next, stopOnline])

  const prevLocal = useCallback(() => {
    stopOnline()
    prev()
  }, [prev, stopOnline])

  useEffect(() => {
    graph.setDepth(audioDepth)
  }, [audioDepth])

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    const onInstalled = () => {
      setIsAppInstalled(true)
      setInstallEvt(null)
      showToast('App instalado!')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsAppInstalled(true)
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [showToast])

  const installApp = useCallback(async () => {
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice
setInstallEvt(null)
  }, [installEvt])

  const clearCache = useCallback(async () => {
    setCacheCleanMsg('Limpando…')
    const estimate = () =>
      navigator.storage
        ?.estimate?.()
        .then((e) => e.usage || 0)
        .catch(() => null)
    const before = await estimate()
    try {
      if ('caches' in window) {
        const keys = await caches.keys().catch(() => [])
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})))
      }
      ;['nt.trans', 'nt.recent', 'nt.view'].forEach((key) => {
        try {
          localStorage.removeItem(key)
        } catch {
          /* armazenamento indisponível */
        }
      })
      const after = await estimate()
      const freed = before != null && after != null ? Math.max(0, before - after) : null
      setCacheCleanMsg(
        freed != null && freed > 0
          ? `Cache limpo! Liberados ~${fmtBytes(freed)}.`
          : 'Cache limpo! Suas músicas não foram removidas.',
      )
    } catch {
      setCacheCleanMsg('Não consegui limpar totalmente.')
    }
  }, [])

  const queueItemLocal = useCallback(
    (id) => {
      stopOnline()
      playQueueItem(id)
    },
    [playQueueItem, stopOnline],
  )

  const importLibrary = useCallback((tracks) => {
    setLibrary((prev) => {
      const byId = new Set(prev.map((t) => t.id))
      const fresh = tracks.filter((t) => !byId.has(t.id))
      return fresh.length ? [...prev, ...fresh] : prev
    })
    setView('biblioteca')
  }, [])

  const playById = useCallback(
    (id) => {
      const i = library.findIndex((t) => t.id === id)
      if (i >= 0) {
        stopOnline()
        select(i)
        setShowNowPlaying(true)
      }
    },
    [library, select, stopOnline],
  )

  const playByList = useCallback(
    (tracks, id) => {
      stopOnline()
      playerPlayByList(tracks, id)
      setShowNowPlaying(true)
    },
    [playerPlayByList, stopOnline],
  )

  const queueNextLocal = useCallback(
    (id) => {
      queueNext(id)
      showToast('Tocará a seguir')
    },
    [queueNext, showToast],
  )

  const queueAddLocal = useCallback(
    (id) => {
      queueAdd(id)
      showToast('Adicionada à fila')
    },
    [queueAdd, showToast],
  )

  const shareTrack = useCallback(
    async (t) => {
      const text = `${t.title} — ${t.artist}${t.album ? ` (${t.album})` : ''}`
      const title = `${t.title} — ${t.artist}`
      try {
        if (t.audioBlob) {
          const fileName = `${t.title} - ${t.artist}.${extFromType(t.audioBlob.type)}`
          if (IS_NATIVE) {
            await shareBlobNative(t.audioBlob, fileName, {
              title,
              text,
              dialogTitle: 'Compartilhar música',
            })
            return
          }
          if (navigator.share && navigator.canShare) {
            const file = new File([t.audioBlob], fileName, { type: t.audioBlob.type })
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title, text })
              return
            }
          }
        }
        const data = { title, text }
        if (IS_NATIVE) {
          await CapShare.share({ ...data, dialogTitle: 'Compartilhar música' })
        } else if (navigator.share) {
          await navigator.share(data)
        } else if (navigator.clipboard) {
          const url = t.externalUrl || (t.coverUrl && t.coverUrl.startsWith('http') ? t.coverUrl : '')
          await navigator.clipboard.writeText(url ? `${text}\n${url}` : text)
          showToast('Copiado!')
        }
      } catch {
        /* usuário cancelou ou compartilhamento indisponível */
      }
    },
    [showToast],
  )

  const shareApp = useCallback(async () => {
    try {
      const candidates = []
      if (SITE_URL && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(SITE_URL)) {
        candidates.push(`${SITE_URL}/apk/nebulatune.apk`)
      }
      candidates.push('./apk/nebulatune.apk')
      let dataUri = null
      for (const url of candidates) {
        try {
          const r = await fetch(url)
          if (!r.ok) continue
          const blob = await r.blob()
          if (!blob || blob.size < 100000) continue
          dataUri = await blobToDataUrl(blob)
          break
        } catch {}
      }
      const invite = SITE_URL && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(SITE_URL)
        ? `Baixe o NebulaTune, seu app de músicas: ${SITE_URL}`
        : 'Baixe o NebulaTune, seu app de músicas!'
      if (dataUri) {
        const blob = dataUrlToBlob(dataUri)
        const feed = { title: 'NebulaTune', text: invite }
        if (IS_NATIVE) {
          await shareBlobNative(blob, 'NebulaTune.apk', {
            ...feed,
            dialogTitle: 'Compartilhar o NebulaTune',
          })
        } else if (navigator.share && navigator.canShare) {
          const file = new File([blob], 'NebulaTune.apk', { type: 'application/vnd.android.package-archive' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], ...feed })
          } else {
            await navigator.share(feed)
          }
        } else {
          await navigator.clipboard.writeText(invite)
          showToast('Copiado!')
        }
      } else if (navigator.share) {
        await navigator.share({ title: 'NebulaTune', text: invite })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(invite)
        showToast('Copiado!')
      }
    } catch {
      /* usuário cancelou ou indisponível */
    }
  }, [showToast])

  const openExternal = useCallback((url) => {
    window.open(url, '_blank', 'noopener')
  }, [])

  const searchTrackOnline = useCallback((t) => {
    const query = [cleanArtist(t.artist), cleanTitle(t.title)].filter(Boolean).join(' ')
    setPendingOnlineQuery(query)
    setView('online')
  }, [setPendingOnlineQuery, setView])

  const editTrack = useCallback(
    (id, patch) => {
      setLibrary((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      showToast('Informações salvas')
    },
    [showToast],
  )

  const fetchCovers = appSettings.fetchCovers

  const addFiles = useCallback(
    (fileList) => {
      const all = Array.from(fileList)
    const files = all.filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name))
    if (!files.length) return

    // imagens soltas (capa separada) pareadas pelo nome do arquivo
    const sidecar = new Map()
    all
      .filter((f) => f.type.startsWith('image/') || IMAGE_RE.test(f.name))
      .forEach((f) => sidecar.set(baseName(f.name), f))

    const batch = Date.now()
    const now = Date.now()
    const newTracks = files.map((file, i) => {
      const { title, artist } = parseFileName(file.name)
      const img = sidecar.get(baseName(file.name))
      return {
        id: `file-${batch}-${i}`,
        title,
        artist,
        album: 'Meus Arquivos',
        duration: 0,
        cover: COVERS[(Math.floor(Math.random() * COVERS.length) + i) % COVERS.length],
        audioBlob: file,
        coverBlob: img || null,
        coverRemote: null,
        coverUrl: img ? URL.createObjectURL(img) : null,
        src: URL.createObjectURL(file),
        addedAt: now + i,
      }
    })

    setLibrary((prev) => [...prev, ...newTracks])
    setView('biblioteca')

    files.forEach((file, i) => {
      const id = newTracks[i].id
      const fallback = newTracks[i]

      const applyPatch = (patch) =>
        setLibrary((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))

      const alreadyHasCover = !!fallback.coverUrl

      import('music-metadata')
        .then(({ parseBlob }) => parseBlob(file, { duration: true }))
        .then(async (meta) => {
          const pic = meta.common.picture?.[0]
          let patch = {}
          if (fallback.coverBlob) {
            const small = await makeThumb(fallback.coverBlob)
            if (small !== fallback.coverBlob) {
              if (fallback.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(fallback.coverUrl)
              patch = { coverBlob: small, coverUrl: URL.createObjectURL(small) }
            }
          } else if (!fallback.coverUrl && pic) {
            const raw = new Blob([pic.data], { type: pic.format || 'image/jpeg' })
            const small = await makeThumb(raw)
            patch = { coverBlob: small, coverUrl: URL.createObjectURL(small) }
          }
          const title = meta.common.title || fallback.title
          const artist = meta.common.artist || fallback.artist
          applyPatch({
            title,
            artist,
            album: meta.common.album || fallback.album,
            duration: meta.format.duration || 0,
            ...patch,
          })
          if (fetchCovers && !fallback.coverUrl && !patch.coverUrl && !alreadyHasCover) {
            const found = await fetchItunesCover(title, artist)
            if (found) applyPatch({ coverRemote: found, coverUrl: found })
          }
        })
        .catch(() => {
          if (fetchCovers && !fallback.coverUrl) {
            fetchItunesCover(fallback.title, fallback.artist).then((found) => {
              if (found) applyPatch({ coverRemote: found, coverUrl: found })
            })
          }
        })

      const probe = new Audio()
      probe.preload = 'metadata'
      probe.src = fallback.src
      probe.addEventListener('loadedmetadata', () => {
        setLibrary((prev) =>
          prev.map((x) =>
            x.id === id && !x.duration
              ? { ...x, duration: Number.isFinite(probe.duration) ? probe.duration : 0 }
              : x,
          ),
        )
      })
      })
    },
    [fetchCovers],
  )

  const openDeviceImport = useCallback(async () => {
    setDeviceImportOpen(true)
    const res = await scanDeviceTracks()
    if (!res.available) {
      setDeviceImportOpen(false)
      showToast(res.error || 'Não foi possível ler as músicas do aparelho')
      return
    }
    setDeviceMusic(res.tracks || [])
    setDeviceSelection({})
  }, [showToast])

  const importDeviceTracks = useCallback(async () => {
    const selected = (deviceMusic || []).filter((t) => deviceSelection[t.id])
    if (!selected.length) return
    setDeviceImporting(true)
    const batch = Date.now()
    const added = []
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const dm = selected[i]
        try {
          const res = await importDeviceTrack(dm)
          if (!res?.base64) continue
          const blob = dataUrlToBlob(`data:${res.mime};base64,${res.base64}`)
          if (!blob) continue
          const fallback = {
            id: `dev-${batch}-${i}`,
            title: dm.title || parseFileName(dm.title || 'Desconhecida').title,
            artist: dm.artist || 'Desconhecido',
            album: dm.album || 'Aparelho',
            duration: dm.duration || 0,
            cover: COVERS[Math.floor(Math.random() * COVERS.length)],
            audioBlob: blob,
            coverBlob: null,
            coverRemote: null,
            coverUrl: null,
            src: URL.createObjectURL(blob),
            addedAt: batch + i,
          }
          added.push(fallback)
          setLibrary((prev) => [...prev, fallback])
        } catch {
          /* arquivo não lido: segue para o próximo */
        }
      }
      if (added.length) {
        setView('biblioteca')
        showToast(`${added.length} ${added.length === 1 ? 'música importada' : 'músicas importadas'}!`)
      }
    } finally {
      setDeviceImporting(false)
      setDeviceImportOpen(false)
      setDeviceMusic(null)
      setDeviceSelection({})
    }
  }, [deviceMusic, deviceSelection, showToast])

  const toggleDeviceTrack = useCallback(
    (id) => {
      setDeviceSelection((prev) => ({ ...prev, [id]: !prev[id] }))
    },
    [],
  )

  const selectAllDevice = useCallback(
    (value) => {
      const next = {}
      ;(deviceMusic || []).forEach((t) => {
        next[t.id] = value
      })
      setDeviceSelection(next)
    },
    [deviceMusic],
  )

  const onDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  const onDragEnter = (e) => {
    e.preventDefault()
    dragCounter.current += 1
    setDragOver(true)
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) setDragOver(false)
  }

  // App 100% local: abre direto na tela principal, sem login.
  return (
    <ProgressProvider sinkRef={progressSink} onProgressRef={liveProgressRef}>
      <MediaSessionBridge
        track={displayTrack}
        playing={displayPlaying}
        speed={appSettings.speed}
        onToggle={displayToggle}
        onNext={nextLocal}
        onPrev={prevLocal}
        onSeek={displaySeek}
      />
      <div
      className={`app ${IS_NATIVE ? 'app-native' : ''}`}
      id="top"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Sidebar view={view} setView={setView} onPickFiles={() => fileInputRef.current?.click()} />

      <BackgroundFX bgAnimated={appSettings.bgAnimated} cosmosAnimated={appSettings.cosmosAnimated} />

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {!IS_NATIVE && (
        <input
          ref={folderInputRef}
          type="file"
          multiple
          hidden
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      )}

      <main className="main">
        <header className={`topbar ${IS_NATIVE || view === 'inicio' ? 'app-topbar' : ''}`}>
          {IS_NATIVE || view === 'inicio' ? (
            <>
              <div className="app-brand">
                <span className="app-brand-logo">✦</span>
                <span>NebulaTune</span>
                <span className="app-version-chip">v{APP_VERSION}</span>
              </div>
              <span className="topbar-actions">
                <button
                  className={`notification-btn ${notifOpen ? 'on' : ''}`}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label="Notificações"
                  aria-haspopup="true"
                  aria-expanded={notifOpen}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  <span className="notification-dot" />
                </button>
                <button
                  className="user-btn app-user"
                  onClick={() => setView('perfil')}
                  title={appSettings.userName || 'Perfil'}
                  aria-label="Abrir perfil"
                >
                  {appSettings.avatar ? (
                    <img className="user-btn-avatar" src={appSettings.avatar} alt="" />
                  ) : (
                    appSettings.userName
                      ? appSettings.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'NT'
                      : 'NT'
                  )}
                </button>
              </span>
            </>
          ) : (
            <>
              <div className="topbar-buttons">
                <button className="icon-btn nav-arrow" aria-label="Voltar">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button className="icon-btn nav-arrow" aria-label="Avançar">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
              <div className="search-wrap">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  className="search"
                  placeholder="O que você quer ouvir?"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (e.target.value) setView('buscar')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) addRecentSearch(e.target.value)
                  }}
                />
              </div>
              <span className="app-version-chip">v{APP_VERSION}</span>
              <span className="topbar-actions">
                <button
                  className={`notification-btn ${notifOpen ? 'on' : ''}`}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label="Notificações"
                  aria-haspopup="true"
                  aria-expanded={notifOpen}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  <span className="notification-dot" />
                </button>
                <button className="user-btn" onClick={() => setView('perfil')} title={appSettings.userName || 'Perfil'} aria-label="Abrir perfil">
                  {appSettings.avatar ? (
                    <img className="user-btn-avatar" src={appSettings.avatar} alt="" />
                  ) : (
                    appSettings.userName
                      ? appSettings.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'NT'
                      : 'NT'
                  )}
                </button>
              </span>
            </>
          )}
          {notifOpen && (
            <div className="notif-panel" ref={notifRef}>
              <span className="notif-panel-title">Notificações</span>
              <div className="notif-item">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                <span>App na versão mais recente: <b>v{APP_VERSION}</b>.</span>
              </div>
              <div className="notif-item">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M10 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM18 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /></svg>
                <span>Toque no gatinho para fazer carinho e ouvir suas reações.</span>
              </div>
              <div className="notif-item">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 3 14h8l-1 8 11-14h-8z" /></svg>
                <span>Novo visual: Pet Habitat, mini player flutuante e espaço animado.</span>
              </div>
            </div>
          )}
        </header>

        <div className={`mobile-tabs ${IS_NATIVE ? 'app-bottom-nav' : ''}`}>
          {[
            ['inicio', 'Início', 'home'],
            ['buscar', 'Buscar', 'search'],
            ['online', 'Online', 'online'],
            ['favoritas', 'Favoritas', 'heart'],
            ['biblioteca', 'Biblioteca', 'library'],
            ['equalizador', 'EQ', 'eq'],
            ['configuracoes', 'Ajustes', 'gear'],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={`mobile-tab ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              {IS_NATIVE && <NavIcon name={icon} />}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {view === 'inicio' && (
          <section className="view">
            <div className="lib-head lib-head-home">
              <h1 className="greeting">
                {appSettings.userName
                  ? `${greetingForHour(now.getHours())}, ${appSettings.userName} ✦`
                  : `${greetingForHour(now.getHours())} ✦`}
              </h1>
              <span className="lib-head-right">
                <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                  + Adicionar músicas
                </button>
              </span>
            </div>

            <PetHabitatCard
              greeting={petGreet}
              greetMs={!loadingLib && library.length === 0 ? 0 : 4800}
              stats={petStats}
              onShowProfile={() => setView('perfil')}
              playing={!!playing}
              eqEnabled={eq.settings.enabled}
              eqPreset={eq.settings.preset}
              favPing={favPing}
              shuffle={shuffle}
              trackId={track?.id || null}
              sleepMode={sleepMode}
              sleepRemaining={sleepRemaining}
              soundOn={appSettings.petSound !== false}
              cheer={cheer}
              idleSinceRef={idleSinceRef}
              onPetAction={handlePetAction}
              mood={mood}
            />

            {loadingLib ? (
              <div className="empty-state">
                <div className="empty-cover spin">
                  <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                  </svg>
                </div>
                <h2>Carregando sua biblioteca…</h2>
                <p>Buscando as músicas salvas no navegador.</p>
              </div>
            ) : library.length === 0 ? (
              <div className="empty-state">
                <div className="empty-cover">
                  <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <h2>Sua biblioteca está vazia</h2>
                <p>Adicione as músicas do seu dispositivo para começar a ouvir.</p>
                <button className="btn-primary big" onClick={() => fileInputRef.current?.click()}>
                  + Adicionar músicas
                </button>
                <small>ou arraste os arquivos para cá</small>
              </div>
            ) : (
              <>
                {topTracks.length > 0 && <MusicRow title="Mais tocadas" tracks={topTracks} onPlay={playById} />}
                {recentRow.length > 0 && <MusicRow title="Recentes" tracks={recentRow} onPlay={playById} />}

                <QuickTrackGrid tracks={library.slice(0, 2)} onPlay={playById} />

                <div className="section">
                  <h2 className="section-title">Todas as músicas</h2>
<TrackList tracks={library} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
                </div>
              </>
            )}
          </section>
        )}

        {view === 'buscar' && (
          <section className="view">
            {IS_NATIVE && (
              <div className="search-wrap view-search">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  className="search"
                  placeholder="O que você quer ouvir?"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (e.target.value) setView('buscar')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) addRecentSearch(e.target.value)
                  }}
                />
              </div>
            )}
            <h1 className="greeting">{query ? 'Resultados' : 'Buscar'}</h1>
            {!query && recentSearches.length > 0 && (
              <div className="recent-searches">
                <div className="recent-header">
                  <h2 className="section-title">Busca recente</h2>
                  <button className="recent-clear" onClick={clearRecentSearches}>
                    Limpar
                  </button>
                </div>
                <div className="recent-chips">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      className="recent-chip"
                      onClick={() => {
                        addRecentSearch(term)
                        setQuery(term)
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m21 21-4.3-4.3" />
                        <circle cx="11" cy="11" r="7" />
                      </svg>
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {results.length ? (
              <TrackList tracks={results} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
            ) : (
              query ? (
                <p className="empty">Nenhuma música encontrada para “{query}”.</p>
              ) : (
                <p className="empty">Digite algo no campo de busca acima para encontrar músicas, artistas ou álbuns.</p>
              )
            )}
          </section>
        )}

        {view === 'biblioteca' && (
          <section className="view">
            {activePlaylist ? (
              (() => {
                const pl = playlists.find((p) => p.id === activePlaylist)
                if (!pl) {
                  return <p className="empty">Playlist não encontrada.</p>
                }
                const plTracks = pl.trackIds.map((id) => library.find((t) => t.id === id)).filter(Boolean)
                return (
                  <>
                    <div className="lib-head lib-head-playlist">
                      <button className="btn-ghost playlist-back" onClick={() => setActivePlaylist(null)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                        Biblioteca
                      </button>
                      <h1 className="greeting">{pl.name}</h1>
                      <div className="lib-actions">
                        <button className="btn-ghost" onClick={() => setRenamePlaylistOpen(true)}>
                          Renomear
                        </button>
                        <button className="btn-ghost" onClick={() => removePlaylist(pl.id)}>
                          Apagar
                        </button>
                      </div>
                    </div>
                    <div className="playlist-summary">
                      <span>{plTracks.length} {plTracks.length === 1 ? 'música' : 'músicas'}</span>
                      <span>Duração total: {formatTime(plTracks.reduce((acc, t) => acc + (t.duration || 0), 0))}</span>
                    </div>
                    <button
                      className="btn-primary playlist-add-tracks"
                      onClick={() => setTrackPickerPlaylist(pl)}
                      disabled={library.length === 0}
                    >
                      + Adicionar músicas
                    </button>
                    {plTracks.length === 0 ? (
                      <p className="empty">Esta playlist está vazia. Adicione músicas para começar.</p>
                    ) : (
                      <TrackList
                        tracks={plTracks}
                        currentId={track?.id}
                        onSelect={(id) => playByList(plTracks, id)}
                        onRemove={(id) => removeFromPlaylist(pl.id, id)}
                        onToggleFavorite={toggleFavorite}
                        onQueueNext={queueNextLocal}
                        onQueueAdd={queueAddLocal}
                        onSearchOnline={searchTrackOnline}
                        onEdit={setEditingTrack}
                        onShare={shareTrack}
                        onOpenSource={openExternal}
                      />
                    )}
                  </>
                )
              })()
            ) : (
              <>
                <div className="lib-head">
                  <h1 className="greeting">Sua Biblioteca</h1>
                  <div className="lib-actions">
                    {library.length > 0 && (
                      <button className="btn-ghost" onClick={clearLibrary}>
                        Limpar
                      </button>
                    )}
                    {!IS_NATIVE && (
                      <button className="btn-ghost" onClick={() => folderInputRef.current?.click()}>
                        Importar pasta
                      </button>
                    )}
                    <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                      + Adicionar músicas
                    </button>
                  </div>
                </div>

                <div className="section">
                  <div className="playlist-head">
                    <h2 className="section-title">Suas playlists</h2>
                    <button className="btn-ghost" onClick={() => setCreatePlaylistOpen(true)}>
                      + Nova
                    </button>
                  </div>
                  {playlists.length === 0 ? (
                    <p className="empty playlist-empty">
                      Crie uma playlist para organizar suas músicas. Use “⋯” em qualquer música e escolha
                      “Adicionar à playlist”.
                    </p>
                  ) : (
                    <div className="playlist-grid">
                      {playlists.map((p) => {
                        const first = p.trackIds.map((id) => library.find((t) => t.id === id)).find(Boolean)
                        return (
                          <button key={p.id} className="card playlist-card" onClick={() => setActivePlaylist(p.id)}>
                            <Cover colors={first?.cover || featuredCovers[0]} image={first?.coverUrl} size="100%" radius={12} />
                            <span className="playlist-card-name">{p.name}</span>
                            <span className="playlist-card-count">{p.trackIds.length} {p.trackIds.length === 1 ? 'música' : 'músicas'}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {library.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-cover">
                      <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                    <h2>Nenhuma música ainda</h2>
                    <p>Adicione arquivos para montar sua biblioteca.</p>
                    <button className="btn-primary big" onClick={() => fileInputRef.current?.click()}>
                      + Adicionar músicas
                    </button>
                  </div>
                ) : (
                  <>
                    <TrackList tracks={library} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
                    <LibraryView tracks={library} onSelect={playById} />
                  </>
                )}

                {IS_NATIVE && (
                  <div className="settings-card library-import-card">
                    <div className="library-import-row">
                      <div className="library-import-info">
                        <span className="settings-label">Importar músicas do aparelho</span>
                        <span className="settings-desc">
                          Lê as músicas baixadas no telefone e adiciona à biblioteca.
                        </span>
                      </div>
                      <button className="btn-primary" onClick={openDeviceImport}>
                        Importar do aparelho
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      {view === 'favoritas' && (
          <section className="view">
            <div className="lib-head">
              <h1 className="greeting">Favoritas</h1>
              <div className="lib-actions">
                <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                  + Adicionar músicas
                </button>
              </div>
            </div>
            {loadingLib ? (
              <div className="empty-state">
                <div className="empty-cover spin">
                  <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                  </svg>
                </div>
                <h2>Carregando…</h2>
              </div>
            ) : favoriteTracks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-cover">
                  <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <h2>Nenhuma favorita ainda</h2>
                <p>Toque no coração de uma música para guardá-la aqui.</p>
              </div>
            ) : (
              <TrackList
                tracks={favoriteTracks}
                currentId={track?.id}
                onSelect={playById}
                onRemove={removeTrack}
                onToggleFavorite={toggleFavorite}
                onQueueNext={queueNextLocal}
                onQueueAdd={queueAddLocal}
                onSearchOnline={searchTrackOnline}
                onEdit={setEditingTrack}
                onShare={shareTrack}
                onOpenSource={openExternal}
                onAddToPlaylist={setPlaylistPickerTrack}
              />
            )}
          </section>
        )}
      {view === 'perfil' && (
          <Profile settings={appSettings} api={settingsApi} library={library} onPlay={playById} petStats={petStats} />
        )}
      {view === 'online' && (
          <OnlineView
            onlineTrack={onlineTrack}
            onlinePlaying={onlinePlaying}
            onlineMode={onlineMode}
            onPlay={startOnline}
            onToggle={toggleOnline}
            onStop={stopOnline}
            pendingQuery={pendingOnlineQuery}
            onConsumedQuery={() => setPendingOnlineQuery('')}
          />
        )}
      {view === 'equalizador' && (
          <section className="view">
            <Equalizer eq={eq} />
          </section>
        )}
      {view === 'configuracoes' && (
          <SettingsView
            settings={appSettings}
            api={settingsApi}
            library={library}
            onClearLibrary={clearLibrary}
            isIOS={isIOS}
            isAppInstalled={isAppInstalled}
            installEvt={installEvt}
            onInstall={installApp}
            isNative={IS_NATIVE}
            onImport={importLibrary}
            onShareApp={shareApp}
            onImportFolder={() => folderInputRef.current?.click()}
            onImportDevice={openDeviceImport}
            onClearCache={clearCache}
            cacheCleanMsg={cacheCleanMsg}
            onOpenChangelog={() => setChangelogOpen(true)}
          />
        )}
      </main>

      {displayTrack && (
        <PlayerBar
          track={displayTrack}
          playing={displayPlaying}
          onToggle={displayToggle}
          onNext={nextLocal}
          onPrev={prevLocal}
          onSeek={displaySeek}
          onOpen={() => setShowNowPlaying(true)}
          fav={displayTrack.fav}
          onToggleFavorite={() => toggleFavorite(displayTrack.id)}
          onOpenQueue={() => setShowQueue(true)}
          isOnline={onlineActive}
          sleepMode={sleepMode}
          sleepRemaining={sleepRemaining}
          onCancelSleep={stopSleepTimer}
          shuffle={shuffle}
          repeat={repeat}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
        />
      )}

      {showNowPlaying && displayTrack && (
        <NowPlaying
          key={displayTrack.id}
          track={displayTrack}
          playing={displayPlaying}
          onToggle={displayToggle}
          onNext={nextLocal}
          onPrev={prevLocal}
          onSeek={displaySeek}
          onClose={() => setShowNowPlaying(false)}
          repeat={repeat}
          shuffle={shuffle}
          onCycleRepeat={cycleRepeat}
          onToggleShuffle={toggleShuffle}
          lyrics={lyrics}
          syncOffset={syncOffset}
          onSync={(delta) => adjustSync(displayTrack.id, delta)}
          onAlign={alignLyrics}
          onSearchLyrics={searchLyrics}
          onPickLyrics={applyManualLyrics}
          eq={eq}
          fav={displayTrack.fav}
          onToggleFavorite={() => toggleFavorite(displayTrack.id)}
          onOpenQueue={() => {
            setShowNowPlaying(false)
            setShowQueue(true)
          }}
          speed={appSettings.speed}
          onSetSpeed={settingsApi.setSpeed}
          depth={audioDepth}
          onSetDepth={setAudioDepth}
          isOnline={onlineActive}
          sleepMode={sleepMode}
          sleepRemaining={sleepRemaining}
          onStartSleep={startSleep}
          onCancelSleep={stopSleepTimer}
          eqEnabled={eq.settings.enabled}
          eqPreset={eq.settings.preset}
          favPing={favPing}
          trackId={displayTrack.id}
          soundOn={appSettings.petSound !== false}
          cheer={cheer}
          idleSinceRef={idleSinceRef}
          onPetAction={handlePetAction}
          mood={mood}
        />
      )}

      {showQueue && track && (
        <QueueSheet
          track={track}
          queue={queueTracks}
          onPlayItem={queueItemLocal}
          onRemoveItem={removeFromQueue}
          onMoveItem={moveInQueue}
          onClear={clearQueue}
          onReorder={reorderQueue}
          onClose={() => setShowQueue(false)}
        />
      )}

      {editingTrack && (
        <TrackEdit
          track={editingTrack}
          onSave={(patch) => {
            editTrack(editingTrack.id, patch)
            setEditingTrack(null)
          }}
          onClose={() => setEditingTrack(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}

      {playlistPickerTrack && (
        <PlaylistPicker
          playlists={playlists}
          track={playlistPickerTrack}
          onCreate={createPlaylist}
          onAdd={addToPlaylist}
          onClose={() => setPlaylistPickerTrack(null)}
        />
      )}

      {trackPickerPlaylist && (
        <TrackPicker
          tracks={library}
          playlist={trackPickerPlaylist}
          onAdd={addToPlaylist}
          onAddMany={addTracksToPlaylist}
          onClose={() => setTrackPickerPlaylist(null)}
        />
      )}

      {createPlaylistOpen && (
        <NameModal
          title="Nova playlist"
          placeholder="Nome da playlist"
          onSave={(n) => {
            createPlaylist(n)
            setCreatePlaylistOpen(false)
          }}
          onClose={() => setCreatePlaylistOpen(false)}
        />
      )}

      {renamePlaylistOpen && activePlaylist && (
        <NameModal
          title="Renomear playlist"
          initial={playlists.find((p) => p.id === activePlaylist)?.name || ''}
          placeholder="Nome da playlist"
          onSave={(n) => {
            renamePlaylist(activePlaylist, n)
            setRenamePlaylistOpen(false)
          }}
          onClose={() => setRenamePlaylistOpen(false)}
        />
      )}

      {deviceImportOpen && (
        <DeviceImport
          tracks={deviceMusic || []}
          selection={deviceSelection}
          onToggle={toggleDeviceTrack}
          onSelectAll={selectAllDevice}
          importing={deviceImporting}
          onImport={importDeviceTracks}
          onClose={() => {
            if (deviceImporting) return
            setDeviceImportOpen(false)
            setDeviceMusic(null)
            setDeviceSelection({})
          }}
        />
      )}

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-box">
            <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0L7 9m5-5 5 5" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <p>Solte os arquivos de música</p>
            <small>MP3, WAV, OGG, M4A, FLAC…</small>
          </div>
        </div>
      )}

      {updatePrompt && (
        <div className="modal-overlay" onClick={postponeUpdate}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Nova versão disponível</h3>
            <p className="modal-text">
              A versão {updatePrompt} do NebulaTune está disponível. Você está usando a versão{' '}
              {APP_VERSION}.
            </p>
            {updateInstallMsg && <p className="modal-text">{updateInstallMsg}</p>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={postponeUpdate}>
                Deixar pra depois
              </button>
              <button className="btn-primary" onClick={installNow} disabled={updateInstalling}>
                {updateInstalling ? 'Baixando…' : 'Atualizar agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ProgressProvider>
  )
}

export default App