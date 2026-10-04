import { useEffect, useState, useRef, useCallback } from 'react'
import { PetFriend } from './pet.jsx'
import { Minigames } from './minigames.jsx'
import { BATH_CATALOG, FOOD_CATALOG, TOY_CATALOG } from '../lib/pet.js'
import { setSfxEnabled, sfxEat, sfxCoin, sfxBounce, sfxThrow, sfxSpawn, sfxHeart, sfxSleep, sfxBubbles, sfxWeak, sfxPop } from '../lib/sfx.js'

const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

const ACTIONS = [
  { id: 'food', label: 'Comida', emoji: '🍗', color: '#fbbf24', action: 'food', coins: 2, cd: 30000, bursts: ['🍖', '🍗', '😋'] },
  { id: 'play', label: 'Brincar', emoji: '🎮', color: '#34d399', action: 'play', coins: 2, cd: 20000, bursts: ['💫', '✨', '⚡'] },
  { id: 'sleep', label: 'Dormir', emoji: '😴', color: '#a78bfa', action: 'sleep', coins: 1, cd: 60000, bursts: ['zZz', '💤'] },
  { id: 'bath', label: 'Banho', emoji: '🛁', color: '#06b6d4', action: 'bath', coins: 2, cd: 40000, bursts: ['🫧', '💦'] },
]

const PLAY_OPTS = [
  { kind: 'ball', name: 'Bolinha', emoji: '⚽' },
  { kind: 'bubbles', name: 'Bolhas', emoji: '🫧' },
]

const FOOD_EAT = ['nhac! que delícia!', 'obrigado! 🥰', 'hmm... hummm!', '{n}, adoro!']
const FOOD_MISS = ['aqui não! 😅', 'quase!', 'na boca!', 'um pouquinho pra lá 🤭']
const FOOD_SPAWN = ['que cheirinho!', 'tô com fome!', 'o que é isso?']
const PLAY_SPAWN = ['bora brincar!', 'olha a bolinha!', '{n}, vem brincar!']
const PLAY_FLING = ['uauu!', 'é isso!', 'quero mais!']
const CUDDLE_TAP = ['mmrr!', 'ai que bom!', 'cafuné! 🥰', '{n}! 💗']
const CUDDLE_LIKE = ['mmrr... que bom!', '{n} é um fofo!', 'mais carinho! 🥰', 'que delícia de cafuné!']
const SLEEP_INVITE = ['vem dormir... 😴', 'que soninho eu merecia!']
const SLEEP_DONE = ['boa noite... 😴', 'zZZ...', 'soninho gostoso!']
const BATH_DONE = ['que cheiroso! ✨', 'limpinho e brilhando!', 'adorei o banho! 🫧']
const BUBBLE_SPAWN = ['olha as bolhas! 🫧', 'vai estourar aí?', 'olha quanta bolhinha!']
const BUBBLE_PLAY = ['estourou as bolhinhas! ✨', 'ploc ploc! mais bolhas!', 'as bolhas são demais!']
const PLAY_TOY = ['nossa, que brinquedo novo! 🎈', 'uau, adorei! ✨', 'sempre trago o melhor 💫']
// Barras no maximo: o pet recusa (nao gasta comida, nao usa o item de banho)
const FULL_FOOD = ['que barriga cheia, {n}! 🫄', 'tô alimentado, {n}! agora não...', 'nem mais um pouquinho! 😋']
const FULL_SLEEP = ['não tô com sono, {n}! ⚡', 'tô cheio de energia agora!', 'agora não dá, {n}! 😴']
const FULL_BATH = ['já tô limpinho, {n}! ✨', 'não precisa de banho agora 🫧', 'tô cheirosinho demais! 💫']
const BATH_PICK = ['boa escolha! 🫧', 'que cheiroso! 🧼', 'vem cleaning! ✨']

const MOOD_LOW = 40
const MOOD_FULL = 99
const MOOD_URGENT = 18
const NEEDS = [
  {
    key: 'full', emoji: '🍗', label: 'Fome',
    phrases: [
      'que barriga vazia... {n}, me dá uma comidinha? 🍗',
      'ronron... {n}, tô com uma fome!',
      'um petisco, {n}? por favorzinho 🥺',
      'que cheirinho de comida... acho que é fome, {n}!',
    ],
    urgent: [
      '{n}! que fome! preciso comer já 🍗',
      'tô desmaiando de fome, {n}!! 😿',
      'socorro {n}, a barriga tá roncando!',
      '{n}, preciiiiiso de comida!',
    ],
  },
  {
    key: 'sleep', emoji: '😴', label: 'Sono',
    phrases: [
      'tô com um sono, {n}... bora dormir? 😴',
      'que soninho... {n}, deita comigo?',
      'cadê meu travesseirinho, {n}? 💤',
      'meu olhinho já tá fechando, {n}...',
    ],
    urgent: [
      '{n}, tô caindo de sono! 😴',
      'que olheira, {n}... preciso dormir já!',
      'me embala, {n}... zZZ...',
      '{n}!! sem sono eu não fico!',
    ],
  },
  {
    key: 'clean', emoji: '🫧', label: 'Banho',
    phrases: [
      '{n}, me dá um banhinho? 🛁',
      'que poeirinha... um banho, {n}?',
      'tô me sentindo sujinho, {n} 🫧',
      'espuma, esponjinha... {n}, me lava!',
    ],
    urgent: [
      '{n}! preciso de um banho AGORA 🛁',
      'que nojo, só poeira... {n}, banho!',
      'socorro {n}, bora de esponjinha! 🫧😿',
      '{n}, tô cheirosinho NÃO! me dá banho!',
    ],
  },
  {
    key: 'happy', emoji: '💗', label: 'Carinho',
    phrases: [
      'quero carinho, {n}! passa o dedo em mim 💗',
      'um cafuné, {n}? por favor...',
      '{n}, tô me sentindo sozinho aqui...',
      'cafuné, cafuné! {n}, faz um carinho!',
    ],
    urgent: [
      '{n}!! preciso de carinho já! 💗😿',
      'socorro {n}, que falta de carinho!',
      'me faz um agrado, {n}, agora!',
      '{n}!! passa o dedo que eu desmancho! 💗',
    ],
  },
]
// O botão da barra baixa ganha um pulso: comida=🍗, brincar=💗, dormir=😴, banho=🫧
const NEED_BUTTONS = { food: 'full', play: 'happy', sleep: 'sleep', bath: 'clean' }

const FOODS = [
  { name: 'Frango', emoji: '🍗' },
  { name: 'Pizza', emoji: '🍕' },
  { name: 'Burger', emoji: '🍔' },
  { name: 'Macarrão', emoji: '🍝' },
  { name: 'Peixinho', emoji: '🐟' },
  { name: 'Donut', emoji: '🍩' },
  { name: 'Maçã', emoji: '🍎' },
  { name: 'Uvinhas', emoji: '🍇' },
  { name: 'Leitinho', emoji: '🥛' },
  { name: 'Cenoura', emoji: '🥕' },
]

const MOOD_TAGS = {
  neutral: { emoji: '😺', label: 'Calmo', color: '#a78bfa' },
  sing: { emoji: '🎵', label: 'Cantando', color: '#34d399' },
  hype: { emoji: '🤩', label: 'Empolgado', color: '#fbbf24' },
  dancante: { emoji: '💃', label: 'Dançando', color: '#f472b6' },
  alegre: { emoji: '😻', label: 'Alegre', color: '#fda4af' },
  calmo: { emoji: '😌', label: 'Tranquilo', color: '#7dd3fc' },
  triste: { emoji: '😿', label: 'Triste', color: '#94a3b8' },
}

const SCENES = [
  { from: 5, to: 12, key: 'manha', label: 'Manhã', icon: '☀️' },
  { from: 12, to: 18, key: 'tarde', label: 'Tarde', icon: '🌤️' },
  { from: 18, to: 21, key: 'entardecer', label: 'Entardecer', icon: '🌇' },
  { from: 21, to: 5, key: 'noite', label: 'Noite', icon: '🌙' },
]

const PET_TIPS = [
  'Arraste o gatinho pela sala 🐾',
  'Toque no chão para um mimo rápido 💗',
  'Comida: escolha o card e arraste até a boca dele 🍗',
  'Arraste a bolinha com força pra arremessar 💫',
  'Aperte o botão 💗 e deslize o dedo pelo gatinho,',
  'Coloque o travesseirinho sobre ele para dormir 😴',
  'Esfregue a esponjinha até encher de bolhinhas 🫧',
  'Os botões embaixo dão moedas 🪙',
  'As barrinhas embaixo mostram fome, sono, banho e carinho 💗',
  'Estoure todas as bolhinhas antes de sumirem 🫧',
]

export function PetHabitatView({ onBack, stats, inv = {}, toys = [], bath = {}, mood = 'neutral', userName = '', onPetAction, onFoodEaten = () => {}, onBathUsed = () => {}, onMinigame = () => {}, soundOn = true, cheer: appCheer = null, onOpenShop = () => {}, ..._pet }) {
  const particlesCanvasRef = useRef(null)
  const habitatRef = useRef(null)
  const [clock, setClock] = useState(() => new Date())
  const [tipIdx, setTipIdx] = useState(0)
  const [actionFeedback, setActionFeedback] = useState(null)
  const [cdToast, setCdToast] = useState(null)
  const [cooldowns, setCooldowns] = useState({})
  const [reaction, setReaction] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const cdToastTimer = useRef(null)
  const reactionTimer = useRef(null)
  const reactionIdRef = useRef(0)
  const [catPos, setCatPos] = useState({ x: 0.5, y: 0.62 })
  const [isDragging, setIsDragging] = useState(false)
  const draggingRef = useRef(false)

  // Itens interativos: comida arrastável até a boca + bolinha física (estilo Pou)
  const [food, setFood] = useState(null)
  const [ball, setBall] = useState(null)
  const [hint, setHint] = useState(null)
  const interactRef = useRef(null)
  const dragHistRef = useRef([])
  const ballVelRef = useRef({ vx: 0, vy: 0 })
  const ballRef = useRef(null)
  const foodIdRef = useRef(0)
  const ballIdRef = useRef(0)
  const hintTimer = useRef(null)
  const [localCheer, setLocalCheer] = useState(null)
  const [watching, setWatching] = useState(null)
  const [watchDir, setWatchDir] = useState('')
  const [eating, setEating] = useState(false)
  const [coinPop, setCoinPop] = useState(null)
  const cheerIdRef = useRef(0)
  const eatingTimer = useRef(null)
  const coinIdRef = useRef(0)
  const coinTimer = useRef(null)
  const soundOnRef = useRef(soundOn !== false)
  const lastBounceRef = useRef(0)
  const [foodMenu, setFoodMenu] = useState(false)
  const [playMenu, setPlayMenu] = useState(false)
  const [bathMenu, setBathMenu] = useState(false)
  const [gamesOpen, setGamesOpen] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const sleepTimer = useRef(null)
  const [spark, setSpark] = useState(null)
  const sparkIdRef = useRef(0)
  const sparkTimer = useRef(null)
  const [pillow, setPillow] = useState(null)
  const [sponge, setSponge] = useState(null)
  const [petMode, setPetMode] = useState(false)
  const petModeRef = useRef(false)
  const movedRef = useRef(false)
  const petActiveRef = useRef(false)
  const petProgRef = useRef(0)
  const petTickRef = useRef(0)
  const petLastRef = useRef(0)
  const petLastActiveRef = useRef(0)
  const petPtrRef = useRef(null)
  const tapSayRef = useRef(0)
  const catPosRef = useRef({ x: 0.5, y: 0.62 })
  // Bolhas de sabão
  const [bubbles, setBubbles] = useState([])
  const bubblesRef = useRef([])
  const bubbleIdRef = useRef(0)
  const bubblesDoneRef = useRef(false)
  const spongeProgRef = useRef(0)
  const spongeLastRef = useRef(0)
  const spongeSoundRef = useRef(0)
  const [petSize] = useState(() =>
    typeof window === 'undefined' ? 200 : Math.max(130, Math.min(window.innerWidth * 0.55, window.innerHeight * 0.28, 240))
  )

  // Computed values
  const tag = MOOD_TAGS[mood] || MOOD_TAGS.neutral
  const h = clock.getHours()
  const scene = SCENES.find((s) => (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to)) || SCENES[0]
  const first = userName?.trim().split(/\s+/)[0] || 'você'

  // Humores do gatinho: barras vêm dos stats persistentes (0..100)
  catPosRef.current = catPos

  const meterOf = (k) => {
    const v = Number(stats?.[k])
    return Number.isFinite(v) ? v : 100
  }
  const lowNeeds = NEEDS.filter((n) => meterOf(n.key) < MOOD_LOW)
  // Barra no máximo: não deixa gastar comida/sono/banho à toa
  const meterCheio = useCallback((v) => (Number.isFinite(Number(v)) ? Number(v) : 0) >= MOOD_FULL, [])

  // Só aparece no card de Comida o que o usuário tem no estoque (com a quantidade)
  const ownedFoods = FOOD_CATALOG.map((f) => ({ ...f, qty: Number(inv?.[f.key]) || 0 })).filter(
    (f) => f.qty > 0,
  )

  // Brinquedos comprados: permanentes, entram no card do botão Brincar
  const ownedToys = TOY_CATALOG.filter((t) => Array.isArray(toys) && toys.includes(t.key))

  // Banho: a Esponjinha é a padrão (não acaba) + os comprados com os usos restantes
  const bathTools = BATH_CATALOG.filter(
    (b) => b.key === 'esponja' || (Number(bath?.[b.key]) || 0) > 0,
  ).map((b) => ({ ...b, left: b.key === 'esponja' ? Infinity : Number(bath[b.key]) || 0 }))

  const cdLeft = (id) => {
    const until = cooldowns[id]
    if (!until) return 0
    return Math.max(0, Math.ceil((until - now) / 1000))
  }

  // Cache do rect da cena: atualizado só no resize, não a cada frame/evento.
  const sceneRectRef = useRef({ left: 0, top: 0, width: 400, height: 400 })
  const sceneRect = () => sceneRectRef.current

  const updateSceneRect = useCallback(() => {
    if (habitatRef.current) {
      sceneRectRef.current = habitatRef.current.getBoundingClientRect()
    }
  }, [])

  useEffect(() => {
    updateSceneRect()
    window.addEventListener('resize', updateSceneRect)
    return () => window.removeEventListener('resize', updateSceneRect)
  }, [updateSceneRect])

  const showHint = useCallback((msg, dur = 2400) => {
    setHint(msg)
    clearTimeout(hintTimer.current)
    if (msg) hintTimer.current = setTimeout(() => setHint(null), dur)
  }, [])

  const fireReaction = useCallback((action) => {
    reactionIdRef.current += 1
    setReaction({ id: reactionIdRef.current, action })
    clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(() => setReaction(null), 1400)
  }, [])

  const startCd = useCallback((id) => {
    const def = ACTIONS.find((a) => a.id === id)
    if (def) setCooldowns((c) => ({ ...c, [id]: Date.now() + def.cd }))
  }, [])

  const spawnFood = useCallback(
    (foodDef) => {
      const r = sceneRect()
      const id = ++foodIdRef.current
      const d = foodDef || FOODS[0]
      setFood({
        id,
        key: d.key,
        emoji: d.emoji,
        name: d.name,
        full: d.full ?? 28,
        happy: d.happy ?? 6,
        x: r.width * 0.3,
        y: Math.min(r.height - 130, r.height * 0.66),
      })
    },
    [],
  )

  const spawnBall = useCallback(() => {
    const r = sceneRect()
    const id = ++ballIdRef.current
    setBall({ id, x: r.width * 0.68, y: Math.min(r.height - 140, r.height * 0.5), scored: false, moving: false })
    ballVelRef.current = { vx: 0, vy: 0 }
  }, [])

  const cancelPet = useCallback(() => {
    petActiveRef.current = false
    petProgRef.current = 0
    petModeRef.current = false
    setWatchDir('')
    setPetMode(false)
  }, [])

  // ---------- Bolhas de sabão ----------
  const spawnBubbles = () => {
    const r = sceneRect()
    const list = []
    for (let i = 0; i < 8; i++) {
      list.push({
        id: bubbleIdRef.current++,
        x: 26 + Math.random() * (r.width - 52),
        y: r.height - 150 - Math.random() * 120,
        speed: 13 + Math.random() * 24,
        sway: 6 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        r: 8 + Math.random() * 7,
      })
    }
    bubblesRef.current = list
    bubblesDoneRef.current = false
    setBubbles(list)
  }

  const finishBubbles = (award) => {
    if (bubblesDoneRef.current) return
    bubblesDoneRef.current = true
    bubblesRef.current = []
    setBubbles([])
    if (!award) return
    startCd('bubbles')
    onPetAction?.('bubbles')
    if (soundOnRef.current) sfxCoin()
    sayPet(pickPhrase(BUBBLE_PLAY))
  }

  const handleBubblesPointer = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const r = sceneRect()
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - r.top
    const bs = bubblesRef.current
    let hit = -1
    let best = 1e9
    for (let i = 0; i < bs.length; i++) {
      const dx = bs[i].x - x
      const dy = bs[i].y - y
      const d2 = dx * dx + dy * dy
      if (d2 < best) {
        best = d2
        hit = i
      }
    }
    if (hit >= 0 && best < 30 * 30) {
      bubblesRef.current = bs.filter((_, i) => i !== hit)
      setBubbles(bubblesRef.current)
      if (soundOnRef.current) sfxPop()
      fireReaction('bubbles')
      if (!bubblesRef.current.length) finishBubbles(true)
    }
  }

  const spawnPillow = useCallback(() => {
    const r = sceneRect()
    setPillow({ x: r.width * 0.5, y: Math.min(r.height - 140, r.height * 0.4) })
  }, [])

  const spawnSponge = useCallback((tool) => {
    const r = sceneRect()
    setSponge({
      x: r.width * 0.5,
      y: Math.min(r.height - 140, r.height * 0.45),
      prog: 0,
      rubbing: false,
      key: tool?.key ?? null,
      name: tool?.name ?? 'Esponjinha',
      emoji: tool?.emoji ?? '🧽',
      clean: tool?.clean ?? 26,
      happy: tool?.happy ?? 6,
    })
    spongeProgRef.current = 0
    spongeLastRef.current = 0
  }, [])

  const clampItem = (v, max) => Math.max(16, Math.min(max - 16, v))

  const overCat = useCallback(
    (x, y, radMul) => {
      const r = sceneRect()
      const cx = catPos.x * r.width
      const cy = catPos.y * r.height + petSize * 0.18
      const rad = petSize * radMul
      const dx = x - cx
      const dy = y - cy
      return dx * dx + dy * dy <= rad * rad
    },
    [catPos, petSize],
  )

  const pickPhrase = useCallback(
    (pool) => {
      const nm = (userName || '').trim()
      let usable = nm ? pool : pool.filter((t) => !t.includes('{n}'))
      if (!usable.length) usable = pool
      let t = usable[Math.floor(Math.random() * usable.length)]
      if (nm && t.includes('{n}')) t = t.split('{n}').join(nm.split(/\s+/)[0])
      return t
    },
    [userName],
  )

  const sayPet = useCallback((text) => {
    cheerIdRef.current += 1
    setLocalCheer({ id: cheerIdRef.current, text })
  }, [])

  // Emoji grande que aparece no gato quando ele brinca com um brinquedo novo
  const showSpark = useCallback((emoji) => {
    const r = sceneRect()
    sparkIdRef.current += 1
    setSpark({ id: sparkIdRef.current, emoji, x: catPos.x * r.width, y: catPos.y * r.height - petSize * 0.45 })
    clearTimeout(sparkTimer.current)
    sparkTimer.current = setTimeout(() => setSpark(null), 1000)
  }, [catPos, petSize])

  const selectFood = useCallback(
    (d) => {
      setFoodMenu(false)
      if (food) {
        showHint('já tem comida aqui! 🍗')
        return
      }
      if (meterCheio(stats?.full)) {
        showHint('ele já tá cheiinho! 🍗')
        sayPet(pickPhrase(FULL_FOOD))
        if (soundOn !== false) sfxWeak()
        return
      }
      if ((inv[d.key] || 0) < 1) {
        showHint('você não tem esse item — compre na lojinha 🛍️')
        return
      }
      spawnFood(d)
      if (soundOn !== false) sfxSpawn()
      sayPet(pickPhrase(FOOD_SPAWN))
      showHint('arraste a comida até a boca dele 👄')
    },
    [food, inv, spawnFood, showHint, sayPet, pickPhrase, soundOn, meterCheio, stats],
  )

  const selectPlay = useCallback(
    (opt) => {
      setPlayMenu(false)
      if (opt.key) {
        // Brinquedo comprado: é dele pra sempre, usa quando quiser
        onPetAction?.('play', { mood: { happy: opt.happy } })
        showSpark(opt.emoji)
        fireReaction('play')
        sayPet(pickPhrase(PLAY_TOY))
        if (soundOn !== false) {
          sfxHeart()
          setTimeout(() => { if (soundOnRef.current) sfxCoin() }, 160)
        }
        showHint(`brincando de ${opt.name}! ${opt.emoji}`)
        return
      }
      if (opt.kind === 'ball') {
        if (ball) {
          showHint('a bolinha ainda está na sala! 💫')
          return
        }
        spawnBall()
        if (soundOn !== false) sfxSpawn()
        sayPet(pickPhrase(PLAY_SPAWN))
        showHint('arraste a bolinha com força e solte 💫')
        return
      }
      if (bubbles.length > 0) {
        showHint('ainda tem bolhas na sala! 🫧')
        return
      }
      spawnBubbles()
      if (soundOn !== false) sfxBubbles()
      sayPet(pickPhrase(BUBBLE_SPAWN))
      showHint('estoure as bolhinhas! 👆')
    },
    [ball, bubbles, spawnBall, spawnBubbles, showHint, sayPet, pickPhrase, soundOn, onPetAction, showSpark, fireReaction],
  )

  // Banho: escolhe o item (esponjinha padrão + comprados) e nasce na sala pra esfregar
  const selectBathTool = useCallback(
    (tool) => {
      setBathMenu(false)
      if (sponge) {
        showHint('já tem um item de banho na mão! 🫧')
        return
      }
      if (meterCheio(stats?.clean)) {
        showHint('ele já tá limpinho! 🫧')
        sayPet(pickPhrase(FULL_BATH))
        if (soundOn !== false) sfxWeak()
        return
      }
      spawnSponge(tool)
      if (soundOn !== false) sfxSpawn()
      sayPet(pickPhrase(BATH_PICK))
      showHint(`esfregue o(a) ${tool.name} até encher de bolhinhas 🫧`)
    },
    [sponge, spawnSponge, showHint, sayPet, pickPhrase, soundOn, meterCheio, stats],
  )

  const popCoin = useCallback((x, y, amount = 2) => {
    coinIdRef.current += 1
    setCoinPop({ id: coinIdRef.current, x, y, amount })
    clearTimeout(coinTimer.current)
    coinTimer.current = setTimeout(() => setCoinPop(null), 1200)
  }, [])

  const startEating = useCallback(() => {
    setEating(true)
    clearTimeout(eatingTimer.current)
    eatingTimer.current = setTimeout(() => setEating(false), 650)
  }, [])

  const itemPointer = (e) => {
    if (interactRef.current) return
    if (petModeRef.current) return
    const kind = e.currentTarget.dataset.kind
    if (kind === 'food' && !food) return
    if (kind === 'ball' && !ball) return
    if (kind === 'pillow' && !pillow) return
    if (kind === 'sponge' && !sponge) return
    e.preventDefault()
    e.stopPropagation()
    interactRef.current = kind
    dragHistRef.current = []
    setWatching(kind)
    setWatchDir('')
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sem captura */ }
    if (kind === 'ball') setBall((b) => (b ? { ...b, dragging: true } : b))
    if (kind === 'sponge') spongeLastRef.current = 0
  }

  const itemMove = (e) => {
    const kind = interactRef.current
    if (!kind) return
    e.preventDefault()
    const r = sceneRect()
    const x = clampItem(e.clientX - r.left, r.width)
    const y = clampItem(e.clientY - r.top, r.height - 96)
    dragHistRef.current.push([e.timeStamp, x, y])
    if (dragHistRef.current.length > 10) dragHistRef.current.shift()
    const mx = catPos.x * r.width
    const my = catPos.y * r.height + petSize * 0.18
    setWatchDir((x < mx ? 'l' : 'r') + (y > my + 8 ? 'd' : ''))
    const nowT = performance.now()
    if (kind === 'food') setFood((f) => (f ? { ...f, x, y } : f))
    else if (kind === 'pillow') setPillow((pl) => (pl ? { ...pl, x, y } : pl))
    else if (kind === 'sponge') {
      const dtMs = nowT - (spongeLastRef.current || nowT)
      spongeLastRef.current = nowT
      if (overCat(x, y, 0.6)) {
        spongeProgRef.current = Math.min(1500, spongeProgRef.current + Math.min(dtMs, 100))
        setSponge((s) => (s ? { ...s, x, y, rubbing: true, prog: spongeProgRef.current / 1500 } : s))
        if (nowT - spongeSoundRef.current > 320) {
          spongeSoundRef.current = nowT
          if (soundOnRef.current) sfxBubbles()
        }
      } else {
        setSponge((s) => (s ? { ...s, x, y, rubbing: false } : s))
      }
    } else {
      setBall((b) => (b ? { ...b, x, y } : b))
    }
  }

  const itemUp = (e) => {
    const kind = interactRef.current
    if (!kind) return
    interactRef.current = null
    setWatching(null)
    setWatchDir('')
    e.preventDefault()
    const r = sceneRect()
    const x = clampItem(e.clientX - r.left, r.width)
    const y = clampItem(e.clientY - r.top, r.height - 96)
    if (kind === 'food') {
      const mouthX = catPos.x * r.width
      const mouthY = catPos.y * r.height + petSize * 0.18
      const dx = x - mouthX
      const dy = y - mouthY
      const rad = petSize * 0.26
      if (dx * dx + dy * dy <= rad * rad) {
        const f = food || {}
        setFood(null)
        onPetAction?.('food', { mood: { full: f.full ?? 28, happy: f.happy ?? 6 } })
        if (f.key) onFoodEaten(f.key)
        fireReaction('food')
        startEating()
        sayPet(pickPhrase(FOOD_EAT))
        if (soundOn !== false) {
          sfxEat()
          setTimeout(() => { if (soundOnRef.current) sfxCoin() }, 150)
        }
        popCoin(x, y - petSize * 0.1, 2)
      } else {
        setFood((f) => (f ? { ...f, x, y } : f))
        showHint('quase! arraste até a boca dele 🍗')
        sayPet(pickPhrase(FOOD_MISS))
      }
    } else if (kind === 'pillow') {
      if (overCat(x, y, 0.58)) {
        if (meterCheio(stats?.sleep)) {
          showHint('ele não tá com sono! ⚡')
          sayPet(pickPhrase(FULL_SLEEP))
          if (soundOn !== false) sfxWeak()
          return
        }
        setPillow(null)
        setSleeping(true)
        clearTimeout(sleepTimer.current)
        sleepTimer.current = setTimeout(() => setSleeping(false), 9000)
        onPetAction?.('sleep')
        startCd('sleep')
        if (soundOn !== false) sfxSleep()
        fireReaction('sleep')
        sayPet(pickPhrase(SLEEP_DONE))
        popCoin(x, y - 22, 1)
      } else {
        showHint('coloque o travesseirinho sobre o gatinho 😴')
      }
    } else if (kind === 'sponge') {
      if (spongeProgRef.current >= 1500) {
        if (meterCheio(stats?.clean)) {
          spongeProgRef.current = 0
          setSponge((s) => (s ? { ...s, prog: 0, rubbing: false } : s))
          showHint('ele já tá limpinho! 🫧')
          sayPet(pickPhrase(FULL_BATH))
          if (soundOn !== false) sfxWeak()
          return
        }
        const tool = sponge || {}
        setSponge(null)
        onPetAction?.('bath', { mood: { clean: tool.clean ?? 26, happy: tool.happy ?? 6 } })
        if (tool.key) onBathUsed(tool.key)
        startCd('bath')
        fireReaction('bath')
        sayPet(pickPhrase(BATH_DONE))
        if (soundOn !== false) {
          sfxBubbles()
          setTimeout(() => { if (soundOnRef.current) sfxCoin() }, 200)
        }
        popCoin(x, y - 22, 2)
      } else {
        setSponge((s) => (s ? { ...s, rubbing: false } : s))
        showHint(`esfregue bem até encher de bolhinhas (${Math.min(99, Math.round((spongeProgRef.current / 1500) * 100))}%) 🫧`)
      }
    } else {
      const hist = dragHistRef.current
      let vx = 0
      let vy = 0
      if (hist.length >= 2) {
        const x0 = hist[0][1]
        const y0 = hist[0][2]
        const t1 = hist[hist.length - 1][0]
        const dt = (t1 - hist[0][0]) / 1000
        if (dt > 0.02) {
          vx = (x - x0) / dt
          vy = (y - y0) / dt
        }
      }
      const sp = Math.hypot(vx, vy)
      const MAX = 1500
      const flung = sp > 90
      if (flung) {
        if (sp > MAX) {
          vx *= MAX / sp
          vy *= MAX / sp
        }
        if (!ball.scored) {
          onPetAction?.('play')
          popCoin(x, y - 26, 2)
          sayPet(pickPhrase(PLAY_FLING))
          if (soundOn !== false) {
            sfxThrow()
            setTimeout(() => { if (soundOnRef.current) sfxCoin() }, 250)
          }
        }
        ballVelRef.current = { vx, vy }
        fireReaction('play')
      } else {
        ballVelRef.current = { vx: 0, vy: 0 }
        if (soundOn !== false) sfxWeak()
        showHint('solte com força pra arremessar 💪')
      }
      setBall({ ...ball, x, y, dragging: false, scored: ball.scored || flung, moving: flung })
    }
    dragHistRef.current = []
  }

  const handleAction = useCallback(
    (action) => {
      const def = ACTIONS.find((a) => a.id === action)
      if (!def || !onPetAction) return
      const until = cooldowns[def.id] || 0
      if (until && now < until) {
        setCdToast({ label: def.label, sec: Math.max(1, Math.ceil((until - now) / 1000)) })
        clearTimeout(cdToastTimer.current)
        cdToastTimer.current = setTimeout(() => setCdToast(null), 1500)
        return
      }
      const hasItem =
        (def.id === 'food' && food) ||
        (def.id === 'play' && (ball || bubbles.length > 0)) ||
        (def.id === 'sleep' && pillow) ||
        (def.id === 'bath' && sponge)
      if (hasItem) {
        if (def.id === 'food') showHint('já tem comida aqui! 🍗')
        else if (def.id === 'play') showHint('já tem brincadeira na sala! 💫')
        return
      }
      setActionFeedback({ action: def.id, time: Date.now() })
      setTimeout(() => setActionFeedback(null), 1600)
      const sfx = soundOn !== false
      if (def.id === 'food') {
        setBathMenu(false)
        setFoodMenu((open) => !open)
        if (sfx) sfxSpawn()
        if (!foodMenu) showHint('escolha uma comidinha 🍗')
        return
      }
      if (def.id === 'play') {
        setBathMenu(false)
        setPlayMenu((open) => !open)
        if (sfx) sfxSpawn()
        if (!playMenu) showHint('escolhe a brincadeira: bolinha ou bolhas ⚽')
        return
      }
      setFoodMenu(false)
      setPlayMenu(false)
      setBathMenu(false)
      if (def.id === 'sleep') {
        spawnPillow()
        if (sfx) sfxSpawn()
        sayPet(pickPhrase(SLEEP_INVITE))
        showHint('coloque o travesseirinho sobre o gatinho 😴')
        return
      }
      if (def.id === 'bath') {
        setFoodMenu(false)
        setPlayMenu(false)
        setBathMenu((open) => !open)
        if (sfx) sfxSpawn()
        if (!bathMenu) showHint('escolha com o que dar banho 🧽')
        return
      }
      onPetAction(def.action)
      fireReaction(def.id)
    },
    [onPetAction, now, cooldowns, food, ball, pillow, sponge, bubbles, foodMenu, playMenu, spawnBall, spawnBubbles, spawnPillow, showHint, fireReaction, sayPet, pickPhrase, soundOn, bathMenu],
  )

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    ballRef.current = ball
  }, [ball])

  useEffect(() => {
    const sfx = soundOn !== false
    soundOnRef.current = sfx
    setSfxEnabled(sfx)
  }, [soundOn])

  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % PET_TIPS.length), 8000)
    return () => clearInterval(id)
  }, [])

// Gatinho avisa sozinho quando alguma necessidade fica baixa
const needsWarnRef = useRef(0)
useEffect(() => {
  if (!lowNeeds.length) return undefined
  const id = setInterval(() => {
    if (petModeRef.current || lowNeedsRef.current === null) return
    const n = lowNeedsRef.current[needsWarnRef.current % lowNeedsRef.current.length]
    needsWarnRef.current += 1
    const raw = Number(statsRef.current?.[n.key])
    const pct = Number.isFinite(raw) ? raw : 100
    const pool = pct < MOOD_URGENT ? n.urgent : n.phrases
    const nm = (userNameRef.current || '').trim()
    let usable = nm ? pool : pool.filter((t) => !t.includes('{n}'))
    if (!usable.length) usable = pool
    let t = usable[Math.floor(Math.random() * usable.length)]
    if (nm && t.includes('{n}')) t = t.split('{n}').join(nm.split(/\s+/)[0])
    showHint(`${n.emoji} ${n.label} ${pct < MOOD_URGENT ? 'bem ' : ''}baixa!`)
    sayPet(t)
  }, 15000)
  return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [lowNeeds.length, showHint, sayPet])
const lowNeedsRef = useRef(null)
lowNeedsRef.current = lowNeeds
const statsRef = useRef(null)
statsRef.current = stats
const userNameRef = useRef(null)
userNameRef.current = userName

  // Minimal particles canvas (only dust/fireflies)
  useEffect(() => {
    const canvas = particlesCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let startTime = performance.now()

    const MIN_MS = 1000 / 30
    let ultimo = 0
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

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (typeof document !== 'undefined' && document.hidden) return
      const agora = performance.now()
      if (agora - ultimo < 1000 / 30) return
      ultimo = agora
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)
      const t = performance.now() / 1000

      const isNight = scene.key === 'noite'

      // Dust particles in light beams (day only)
      if (!isNight) {
        ctx.fillStyle = '#fff'
        for (let i = 0; i < 12; i++) {
          const px = w * 0.7 + (i * 73 % 19) / 100 * w * 0.3
          const py = h * 0.15 + (i * 41 % 53) / 100 * (h * 0.62 - h * 0.15)
          const pt = (t * 0.3 + i * 0.5) % 2
          const alpha = 0.08 + Math.sin(pt * Math.PI) * 0.08
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(px, py, 1.2, 0, Math.PI * 2)
          ctx.fill()
        }

        // Fireflies
        const fireflyCount = scene.key === 'noite' ? 18 : 8
        for (let i = 0; i < fireflyCount; i++) {
          const fx = (5 + (i * 43 % 89) / 100) * w / 100
          const fy = (10 + (i * 37 % 72) / 100) * (h * 0.6) / 100
          const pulse = Math.sin(t * 1.5 + i * 2) * 0.5 + 0.5
          const alpha = 0.3 + pulse * 0.4
          ctx.globalAlpha = alpha
          ctx.fillStyle = isNight ? '#a78bfa' : '#fbbf24'
          ctx.beginPath()
          ctx.arc(fx + Math.sin(t + i) * 8, fy + Math.cos(t * 1.3 + i) * 6, 1.8 + Math.sin(t * 3 + i) * 0.8, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [scene.key]);

  // Time & tips
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % PET_TIPS.length), 8000)
    return () => clearInterval(id)
  }, [])


  // Full 2D drag for cat
  // Modo afago: gatinho fica fixo e o dedo deslizando faz carinho
  const petMove = (e) => {
    if (!petActiveRef.current) return
    const r = sceneRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const nowT = performance.now()
    if (!petLastRef.current) petLastRef.current = nowT
    const dt = nowT - petLastRef.current
    petLastRef.current = nowT
    movedRef.current = true
    const cx = catPos.x * r.width
    const cy = catPos.y * r.height + petSize * 0.18
    setWatchDir((x < cx ? 'l' : 'r') + (y > cy + 8 ? 'd' : ''))
    if (overCat(x, y, 0.95)) {
      petProgRef.current += Math.min(dt, 60)
      petLastActiveRef.current = nowT
      if (nowT - petTickRef.current > 380) {
        petTickRef.current = nowT
        if (soundOnRef.current) sfxHeart()
        fireReaction('love')
      }
    }
  }

  const petReward = () => {
    onPetAction?.('heart')
    startCd('love')
    fireReaction('love')
    sayPet(pickPhrase(CUDDLE_LIKE))
    if (soundOnRef.current) sfxHeart()
    const r = sceneRect()
    const cx = catPos.x * r.width
    const cy = catPos.y * r.height + petSize * 0.18
    popCoin(cx, cy - petSize * 0.3 - 8, 1)
    cancelPet()
  }

  const petEnd = () => {
    const award = petActiveRef.current && petProgRef.current >= 900
    petActiveRef.current = false
    petPtrRef.current = null
    if (award) petReward()
  }

  const handleScenePointerDown = (e) => {
    if (interactRef.current) return
    if (!petModeRef.current) return
    try { e.preventDefault() } catch { /* sem preventDefault */ }
    petPtrRef.current = { id: e.pointerId }
    petActiveRef.current = true
    petLastRef.current = 0
    petLastActiveRef.current = performance.now()
    draggingRef.current = false
    setIsDragging(false)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sem captura */ }
    petMove(e)
  }
  const handleScenePointerMove = (e) => {
    if (!petPtrRef.current || e.pointerId !== petPtrRef.current.id) return
    if (interactRef.current) return
    try { e.preventDefault() } catch { /* sem preventDefault */ }
    petMove(e)
  }
  const handleScenePointerUp = (e) => {
    if (!petPtrRef.current || e.pointerId !== petPtrRef.current.id) return
    petEnd()
  }

  const handleDrag = (e) => {
    if (interactRef.current) return
    if (petModeRef.current) {
      if (!petPtrRef.current && petActiveRef.current) petMove(e)
      return
    }
    const rect = habitatRef.current?.getBoundingClientRect()
    if (!rect) return
    if (!draggingRef.current) return
    const x = (e.touches?.[0]?.clientX || e.clientX) - rect.left
    setCatPos({ x: Math.max(0.12, Math.min(0.88, x / rect.width)), y: 0.62 })
    movedRef.current = true
  }

  const handleDragStart = (e) => {
    if (interactRef.current) return
    if (petModeRef.current) {
      if (!petPtrRef.current) {
        petActiveRef.current = true
        petLastRef.current = 0
        petLastActiveRef.current = performance.now()
      }
      return
    }
    const t = e.target
    const isUi = t && typeof t.closest === 'function' && t.closest('button, .habitat-action-bar, .habitat-hud-top, .habitat-droppable')
    if (isUi) return
    draggingRef.current = true
    movedRef.current = false
    setIsDragging(true)
  }
  const handleDragEnd = () => {
    if (petModeRef.current) {
      if (!petPtrRef.current) petEnd()
      return
    }
    draggingRef.current = false
    setIsDragging(false)
  }

  // Sai do modo afago sozinho se ficar ~10s sem nenhuma atividade
  useEffect(() => {
    if (!petMode) return
    const id = setInterval(() => {
      if (performance.now() - petLastActiveRef.current > 10000) cancelPet()
    }, 1000)
    return () => clearInterval(id)
  }, [petMode, cancelPet])

  // Tap simples no fundo = mimo instantâneo (sem moeda/cooldown; o botão 💗 é a interação completa)
  const handleTap = (e) => {
    if (interactRef.current) return
    if (petModeRef.current) return
    if (foodMenu || playMenu || bathMenu) {
      setFoodMenu(false)
      setPlayMenu(false)
      setBathMenu(false)
      return
    }
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    if (e.target !== e.currentTarget) return
    if (soundOn !== false) sfxHeart()
    fireReaction('love')
    const t = Date.now()
    if (t - tapSayRef.current > 4500) {
      tapSayRef.current = t
      sayPet(pickPhrase(CUDDLE_TAP))
    }
  }

  // Bolhas flutuando: sobem, balançam e o gatinho tenta estourar as que passam perto
  useEffect(() => {
    if (!bubbles.length) return undefined
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const bs = bubblesRef.current
      if (!bs.length) return
      const t = now / 1000
      const r = sceneRect()
      const mouthX = catPosRef.current.x * r.width
      const mouthY = catPosRef.current.y * r.height + petSize * 0.18
      const reach = petSize * 0.55
      const next = []
      let poppedByCat = 0
      for (const b of bs) {
        const nx = b.x + Math.cos(t * 1.7 + b.phase) * b.sway * dt
        const ny = b.y - b.speed * dt
        const dx = nx - mouthX
        const dy = ny - mouthY
        if (dx * dx + dy * dy < reach * reach || ny < 6) {
          poppedByCat += 1
          continue
        }
        next.push({ ...b, x: nx, y: ny })
      }
      bubblesRef.current = next
      setBubbles(next)
      if (poppedByCat) {
        if (soundOnRef.current) sfxBubbles()
        fireReaction('bubbles')
      }
      if (next.length) {
        raf = requestAnimationFrame(loop)
      } else {
        finishBubbles(true)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles.length])

  // Bubbles: effect only runs when there are bubbles, no infinite loop
  // (bubbles.length === 0 stops the loop via finishBubbles)

  // Física da bolinha: perde velocidade e quica nas bordas da tela
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const b = ballRef.current
      if (!b || b.dragging) return
      const v = ballVelRef.current
      if (!v || (v.vx === 0 && v.vy === 0)) return
      const rect = sceneRect()
      const w = rect.width
      const h = rect.height - 96
      const r = 16
      const damp = Math.pow(0.994, dt * 60)
      let vx = v.vx * damp
      let vy = v.vy * damp
      let x = b.x + vx * dt
      let y = b.y + vy * dt
      const hitWall = x < r || x > w - r || y < r || y > h - r
      if (x < r) { x = r; vx = Math.abs(vx) * 0.82 }
      else if (x > w - r) { x = w - r; vx = -Math.abs(vx) * 0.82 }
      if (y < r) { y = r; vy = Math.abs(vy) * 0.82 }
      else if (y > h - r) { y = h - r; vy = -Math.abs(vy) * 0.82 }
      if (hitWall && soundOnRef.current && performance.now() - lastBounceRef.current > 90) {
        lastBounceRef.current = performance.now()
        sfxBounce()
      }
      v.vx = vx
      v.vy = vy
      if (Math.hypot(vx, vy) < 12) {
        v.vx = 0
        v.vy = 0
        setBall((prev) => (prev && prev.id === b.id ? { ...prev, moving: false } : prev))
        return
      }
      setBall((prev) => (prev && prev.id === b.id ? { ...prev, x, y, moving: true } : prev))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section
      ref={habitatRef}
      className={`habitat-scene${isDragging ? ' is-dragging' : ''}${petMode ? ' is-petting' : ''}`}
      data-scene={scene.key}
      {...(IS_TOUCH
        ? {
            onTouchStart: handleDragStart,
            onTouchMove: handleDrag,
            onTouchEnd: handleDragEnd,
          }
        : {
            onMouseDown: handleDragStart,
            onMouseMove: handleDrag,
            onMouseUp: handleDragEnd,
          })}
      onPointerDown={handleScenePointerDown}
      onPointerMove={handleScenePointerMove}
      onPointerUp={handleScenePointerUp}
      onPointerCancel={handleScenePointerUp}
      onClick={handleTap}
    >
      {/* CAMADA 0 (z-0) - Sala estrelada */}
      <div className="habitat-bg-layer">
        <div className={`habitat-gradient-bg ${scene.key}`} />

        {/* Ceu galactico: estrelas, lua e estrela cadente */}
        <div className="habitat-cosmic">
          <div className="habitat-stars-layer habitat-stars-a" />
          <div className="habitat-stars-layer habitat-stars-b" />
          <span className="habitat-shooting-star" />
        </div>

        {/* Nebulosa colorida suave na parede */}
        <div className="habitat-nebula" />

        {/* Decoracoes da sala estrelada */}
        <div className="habitat-room-decor">
          <div className="habitat-garland">
            <span className="habitat-garland-star" />
            <span className="habitat-garland-star" />
            <span className="habitat-garland-star" />
            <span className="habitat-garland-star" />
            <span className="habitat-garland-star" />
          </div>

          <div className="habitat-window">
            <div className="habitat-window-glass">
              <div className="habitat-window-cross" />
              <span className="habitat-window-star" style={{ top: '20%', left: '28%' }} />
              <span className="habitat-window-star" style={{ top: '58%', left: '74%' }} />
              <span className="habitat-window-star" style={{ top: '34%', left: '88%' }} />
            </div>
            <div className="habitat-window-sill" />
          </div>

          <div className="habitat-lamp" />


          <div className="habitat-star-clock">
            <span className="habitat-star-clock-star">★</span>
          </div>

          <div className="habitat-shelf">
            <div className="habitat-pot habitat-pot-1" />
            <div className="habitat-pot habitat-pot-2" />
          </div>
        </div>

        {/* Tapete fixo, embaixo de onde o gato fica em repouso (nao segue o pet) */}
        <div
          className="habitat-rug"
          style={{
            left: '50%',
            top: `calc(62% + ${petSize * 0.47}px)`,
            width: `${petSize * 0.68}px`,
            height: `${Math.max(26, petSize * 0.15)}px`
          }}
        />

        {/* Chao estrelado: tigela e bolinha-cosmos */}
        <div className="habitat-floor">
          <div className={`habitat-bowl${reaction?.action === 'food' ? ' is-feeding' : ''}`}>
            <div className="habitat-food" />
          </div>
          <div className={`habitat-ball${reaction?.action === 'play' ? ' is-playing' : ''}`} />
        </div>
      </div>

      {/* =====================================================================
         CAMADA 5 (z-5) — Canvas Mínimo: Partículas (poeira, vaga-lumes)
         ===================================================================== */}
      <canvas
        ref={particlesCanvasRef}
        className="habitat-particles-canvas"
        aria-hidden="true"
      />

      {/* CAMADA 10 - O Pet Virtual: mesmo gato da tela principal */}
      <div
        className={`habitat-cat-stage${watching ? ' is-watching' : ''}${watchDir.includes('l') ? ' watch-l' : ''}${watchDir.includes('r') ? ' watch-r' : ''}${watchDir.includes('d') ? ' watch-d' : ''}${eating ? ' is-eating' : ''}${petMode ? ' is-petting' : ''}${sleeping ? ' is-sleeping' : ''}`}
        style={{ left: `${catPos.x * 100}%`, top: `${catPos.y * 100}%` }}
        aria-hidden="true"
      >
        <div className="habitat-cat-fit">
          <div className="habitat-reaction" key={reaction?.id} data-splash={reaction?.action}>
            {(reaction != null ? ACTIONS.find((a) => a.id === reaction.action)?.bursts || [] : []).map((e, i) => (
              <span className={`habitat-burst habitat-burst-${i}`} key={i}>{e}</span>
            ))}
          </div>
          {sleeping && (
            <div className="habitat-zzz" aria-hidden="true">
              <span>z</span>
              <span>Z</span>
              <span>z</span>
            </div>
          )}
          <PetFriend
            {..._pet}
            cheer={localCheer || appCheer}
            soundOn={soundOn}
            mood={mood}
            userName={userName}
            onPetAction={onPetAction}
            size={petSize}
            greetOnMount="que cantinho gostoso! 🐾"
          />
        </div>
      </div>

      {/* CAMADA 15 - Itens interativos: comida e bolinha */}
      {food && (
        <div
          className="habitat-droppable habitat-food-item"
          style={{ left: food.x, top: food.y }}
          data-kind="food"
          onPointerDown={itemPointer}
          onPointerMove={itemMove}
          onPointerUp={itemUp}
          onPointerCancel={itemUp}
        >
          <span>{food.emoji || '🍗'}</span>
        </div>
      )}
      {ball && (
        <div
          className="habitat-droppable habitat-ball-item"
          style={{ left: ball.x, top: ball.y }}
          data-kind="ball"
          onPointerDown={itemPointer}
          onPointerMove={itemMove}
          onPointerUp={itemUp}
          onPointerCancel={itemUp}
        >
          <span className={`habitat-ball-orb${ball.moving ? ' is-rolling' : ''}`} />
        </div>
      )}
      {pillow && (
        <div
          className="habitat-droppable habitat-pillow-item"
          style={{ left: pillow.x, top: pillow.y }}
          data-kind="pillow"
          onPointerDown={itemPointer}
          onPointerMove={itemMove}
          onPointerUp={itemUp}
          onPointerCancel={itemUp}
        >
          <span>🌙</span>
        </div>
      )}
      {sponge && (
        <div
          className={`habitat-droppable habitat-sponge-item${sponge.rubbing ? ' is-rubbing' : ''}`}
          style={{ left: sponge.x, top: sponge.y }}
          data-kind="sponge"
          onPointerDown={itemPointer}
          onPointerMove={itemMove}
          onPointerUp={itemUp}
          onPointerCancel={itemUp}
        >
          <span className="habitat-sponge-emoji">{sponge.emoji || '🧽'}</span>
          <span className="habitat-sponge-name">{sponge.name || 'Esponjinha'}</span>
          <span className="habitat-sponge-bubble">🫧</span>
          <span className="habitat-sponge-progress"><i style={{ width: `${Math.min(100, (sponge.prog || 0) * 100)}%` }} /></span>
        </div>
      )}

      {spark && (
        <span className="habitat-spark" style={{ left: spark.x, top: spark.y }}>
          {spark.emoji}
        </span>
      )}

      {/* Bolhas de sabão */}
      {bubbles.length > 0 && (
        <div className="habitat-bubbles" onPointerDown={handleBubblesPointer} onTouchStart={handleBubblesPointer}>
          {bubbles.map((b) => (
            <span
              key={b.id}
              className="habitat-bubble"
              style={{ left: b.x, top: b.y, width: b.r * 2, height: b.r * 2 }}
            />
          ))}
        </div>
      )}

      {gamesOpen && (
        <Minigames
          stats={stats}
          soundOn={soundOn}
          onFinish={onMinigame}
          onBack={() => setGamesOpen(false)}
        />
      )}

      {/* =====================================================================
         CAMADA 20 (z-20) — HUD Superior: Glassmorphism
         ===================================================================== */}
      <div className="habitat-hud-top">
        <button
          className="habitat-btn-back habitat-btn-games"
          onClick={() => { setFoodMenu(false); setPlayMenu(false); setBathMenu(false); setGamesOpen(true) }}
          aria-label="Abrir os minigames"
          title="Minigames"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M7 8h10a5 5 0 0 1 4.6 7l-1 1.7a2.2 2.2 0 0 1-3.4-.2l-1-1.5H7.8l-1 1.5a2.2 2.2 0 0 1-3.4.2l-1-1.7A5 5 0 0 1 7 8Zm2.5 2.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
          </svg>
        </button>
        <button
          className="habitat-btn-back"
          onClick={onBack}
          aria-label="Sair do habitat"
          title="Sair"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="habitat-hud-id">
          <b>Habitat</b>
          <span>{scene.icon} {scene.label} · {first}</span>
        </div>
        <div className="habitat-hud-right">
          <div className="habitat-hud-subrow">
            <span className="habitat-coins" key={stats?.coins ?? 0}>🪙 {stats?.coins ?? 0}</span>
            <span className="habitat-clock">{String(h).padStart(2, '0')}:{String(clock.getMinutes()).padStart(2, '0')}</span>
          </div>
          <span className="habitat-mood" style={{ '--mc': tag.color }}>
            {tag.emoji} {tag.label}
          </span>
          <button className="habitat-shop-btn" onClick={onOpenShop}>
            🛍️ Lojinha
          </button>
        </div>
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="habitat-toast" style={{ '--ac': ACTIONS.find(a => a.id === actionFeedback.action)?.color }}>
          <span className="habitat-toast-emoji">{ACTIONS.find(a => a.id === actionFeedback.action)?.emoji}</span>
          <span>{ACTIONS.find(a => a.id === actionFeedback.action)?.label}!</span>
        </div>
      )}

      {cdToast && (
        <div className="habitat-toast is-cd">
          <span>⏳ aguarda {cdToast.sec}s</span>
        </div>
      )}

      {hint && (
        <div className="habitat-toast is-hint">
          <span>💡 {hint}</span>
        </div>
      )}

      {coinPop && (
        <div className="habitat-coin-pop" key={coinPop.id} style={{ left: coinPop.x, top: coinPop.y }}>
          <span className="habitat-coin-pop-icon">🪙</span>
          <span className="habitat-coin-pop-amount">+{coinPop.amount}</span>
        </div>
      )}

{/* CAMADA 40 - Menu de comidas: só o que tem no estoque, com a quantidade */}
      {foodMenu && (
        <div className="habitat-food-menu" role="listbox" aria-label="Escolha uma comida">
          {ownedFoods.length === 0 && (
            <p className="habitat-food-empty">
              Sem comida no estoque 🛍️<small>compre na lojinha para aparecer aqui</small>
            </p>
          )}
          {ownedFoods.map((f) => (
            <button
              key={f.key}
              className="habitat-food-card"
              role="option"
              onClick={(event) => {
                event.stopPropagation()
                selectFood(f)
              }}
            >
              <span className="habitat-food-card-emoji">{f.emoji}</span>
              <span className="habitat-food-card-name">{f.name}</span>
              <span className="habitat-food-card-qty">x{f.qty}</span>
            </button>
          ))}
        </div>
      )}

      {/* CAMADA 30 - Acoes do Pet */}

      {/* Action Bar — Estilo Pou flutuante */}
      <div className="habitat-action-bar" role="group" aria-label="Ações do gatinho">
        {playMenu && (
          <div className="habitat-play-menu" role="listbox" aria-label="Escolha como brincar">
            {[...PLAY_OPTS, ...ownedToys].map((c) => (
              <button
                key={c.kind || c.key}
                className="habitat-play-btn"
                role="option"
                onClick={(event) => {
                  event.stopPropagation()
                  selectPlay(c)
                }}
              >
                <span className="habitat-play-btn-emoji">{c.emoji}</span>
                <span className="habitat-play-btn-label">{c.name}</span>
                {c.key && <span className="habitat-card-tag">dele</span>}
              </button>
            ))}
          </div>
        )}
        {bathMenu && (
          <div className="habitat-play-menu habitat-bath-menu" role="listbox" aria-label="Escolha o item do banho">
            {bathTools.map((b) => (
              <button
                key={b.key}
                className="habitat-play-btn"
                role="option"
                onClick={(event) => {
                  event.stopPropagation()
                  selectBathTool(b)
                }}
              >
                <span className="habitat-play-btn-emoji">{b.emoji}</span>
                <span className="habitat-play-btn-label">{b.name}</span>
                <span className="habitat-card-tag">
                  {b.left === Infinity ? '∞' : `${b.left} usos`}
                </span>
              </button>
            ))}
          </div>
        )}
        {ACTIONS.map((a) => {
            const left = cdLeft(a.id)
            const mk = NEED_BUTTONS[a.id]
            const mVal = mk ? meterOf(mk) : null
            const mLow = mVal !== null && mVal < MOOD_LOW
            const mFull = mVal !== null && mVal >= MOOD_FULL
            return (
              <button
                key={a.id}
                className={`habitat-action-btn${left > 0 ? ' is-cooling' : ''}${mFull ? ' is-full' : ''}`}
                onClick={() => handleAction(a.action)}
                style={{ '--ac': a.color }}
                aria-label={a.label}
                title={`${a.label}${mVal !== null ? ` · ${Math.round(mVal)}%${mFull ? ' (cheio)' : ''}` : ''}`}
              >
                {mFull && <span className="habitat-action-full" aria-hidden="true">✓</span>}
                {mVal !== null && (
                  <span className={`habitat-action-moodbar${mLow ? ' is-low' : ''}`}>
                    <i style={{ width: `${mVal}%` }} />
                  </span>
                )}
                <span className="habitat-action-emoji">{a.emoji}</span>
                <span className="habitat-action-label">{a.label}</span>
                {left > 0 ? (
                  <span className="habitat-action-cd">{left}s</span>
                ) : (
                  (mLow || actionFeedback?.action === a.id) && (
                    <span className={`habitat-action-pulse${mLow ? ' is-need' : ''}`} />
                  )
                )}
              </button>
            )
          })}
      </div>

      <p className="habitat-tip" key={tipIdx}>
        {PET_TIPS[tipIdx]}
      </p>
    </section>
  )
}