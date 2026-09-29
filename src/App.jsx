import './App.css'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION, SITE_URL } from './app-config'
import { useEqualizer } from './audio/equalizer'
import * as graph from './audio/graph'
import { blobToDataUrl, dataUrlToBlob } from './backup'
import { COVERS, featuredCovers } from './data/tracks'
import { deleteMediaBlobs, loadAllMediaBlobs, mediaStorageInfo, purgeOrphanMedia, readLocal, saveMediaBlobs, writeLocal } from './localstore'
import { importDeviceTrack, scanDeviceTracks } from './mediaImport'
import { PET_NEEDS_INFO, pickNeedNudge, pickPetNudge } from './petNudges'
import { ProgressProvider } from './progress'
import { MOOD_KEYS, usePetStats, useSettings } from './settings'
import { APK_URL, fetchLatestVersion, installUpdate, isNewer, markUpdatePrompted, notifyUpdateAvailable, requestNotificationsPermission, wasUpdatePrompted } from './updater'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Cover } from './components/Cover.jsx'
import { BackgroundFX } from './components/background.jsx'
import { Equalizer } from './components/equalizer.jsx'
import { ChangelogModal, DeviceImport, NameModal, PlaylistPicker, QuickTrackGrid, Sidebar, TrackPicker } from './components/library-ui.jsx'
import { MediaSessionBridge } from './components/media-session-bridge.jsx'
import { MicButton } from './components/mic-button.jsx'
import { NowPlaying } from './components/now-playing.jsx'
import { AchToast, PetHabitatCard } from './components/pet.jsx'
import { PlayerBar } from './components/player-bar.jsx'
import { QueueSheet } from './components/queue-sheet.jsx'
import { NavIcon } from './components/settings-view.jsx'
import { TrackEdit, TrackList } from './components/track-list.jsx'
import { useMoodDetector } from './hooks/use-mood-detector.js'
import { useOnlinePlayer } from './hooks/use-online-player.js'
import { usePlayer } from './hooks/use-player.js'
import { fetchItunesCover, makeThumb } from './lib/cover.js'
import { IS_NATIVE } from './lib/env.js'
import { AUDIO_RE, IMAGE_RE, baseName, cleanArtist, cleanTitle, extFromType, parseFileName } from './lib/filename.js'
import { fmtBytes, formatTime, hashStr } from './lib/format.js'
import { LYRICS_CACHE_MAX, buildLyrics, fetchLyrics, searchLyrics } from './lib/lyrics.js'
import { BATH_CATALOG, FOOD_CATALOG, PET_GREETINGS, START_INVENTORY, TOY_CATALOG, greetingForHour, random } from './lib/pet.js'
import { setMusicPlaying, sfxCoin, sfxSpawn } from './lib/sfx.js'
import { shareBlobNative } from './lib/share.js'
import { sleepNativeCancel, sleepNativeStart } from './lib/sleep-native.js'
import { getAchievements } from './lib/stats.js'

/* Telas que o usuário quase sempre NÃO abre na primeira visita: entram no
   pacote só na hora de abrir. Deixa a abertura do app mais leve em aparelhos
   fracos. A tela inicial (que é a mais usada) continua no pacote principal. */
const Profile = lazy(() =>
  import('./components/profile.jsx').then((m) => ({ default: m.Profile })),
)
const OnlineView = lazy(() =>
  import('./components/online-view.jsx').then((m) => ({ default: m.OnlineView })),
)
const SettingsView = lazy(() =>
  import('./components/settings-view.jsx').then((m) => ({ default: m.SettingsView })),
)
const PetHabitatView = lazy(() =>
  import('./components/pet-habitat-view.jsx').then((m) => ({ default: m.PetHabitatView })),
)

const SHOP_TABS = [
  { id: 'comida', label: 'Comida', icon: '🍗' },
  { id: 'brinquedo', label: 'Brinquedos', icon: '🎈' },
  { id: 'banho', label: 'Banho', icon: '🛁' },
  { id: 'mimo', label: 'Mimos', icon: '💗' },
]
// Comidas com preço (as básicas já vêm no estoque inicial)
const SHOP_FOOD = FOOD_CATALOG.filter((f) => f.price > 0)
// Brinquedos: comprados viram permanentes e vão pro card do botão Brincar
const SHOP_TOYS = TOY_CATALOG.filter((t) => t.price > 0)
// Banho: cada um tem usos limitados (a Esponjinha é a padrão, não se acaba)
const SHOP_BATH = BATH_CATALOG.filter((b) => b.price > 0)
const SHOP_MIMOS = [
  { id: 'carinho', name: 'Carinho Extra', emoji: '💗', desc: 'mimos que não acaba', price: 45, mood: { happy: 30 } },
  { id: 'sono', name: 'Boa Noite', emoji: '🌙', desc: 'soninho dos deuses', price: 55, mood: { sleep: 40, happy: 5 } },
  { id: 'banho-relampago', name: 'Banho Relâmpago', emoji: '⚡', desc: 'limpo num piscar', price: 60, mood: { clean: 45, happy: 4 } },
  { id: 'festa', name: 'Festa', emoji: '🎉', desc: 'festa de animate com ele', price: 80, mood: { happy: 45, full: 10 } },
]
const SHOP_CONSUMABLES = [...SHOP_FOOD, ...SHOP_TOYS, ...SHOP_BATH, ...SHOP_MIMOS]
const SHOP_BY_TAB = { comida: SHOP_FOOD, brinquedo: SHOP_TOYS, banho: SHOP_BATH, mimo: SHOP_MIMOS }
const MOOD_OF = { full: '🍗', happy: '💗', sleep: '😴', clean: '🫧' }

// Chamada do gatinho: barra baixa vira notificação pedindo pra entrar no app
const MOOD_LOW_NOTIF = 40
const MOOD_URGENT_NOTIF = 18
const NEED_COOLDOWN_MS = 3 * 3600 * 1000 // 3h sem repetir a mesma necessidade
const NEED_GAP_MS = 60 * 60 * 1000 // 1h entre duas chamadas quaisquer

// No navegador usa o Service Worker (funciona com o app em segundo plano)
function notificarWeb(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const reg = navigator.serviceWorker?.ready
    if (reg) {
      reg.then((r) => r.showNotification(title, { body, icon: './icons/icon-192.png', tag: 'pet-need', renotify: false }))
        .catch(() => new Notification(title, { body, icon: './icons/icon-192.png', tag: 'pet-need' }))
      return
    }
    new Notification(title, { body, icon: './icons/icon-192.png', tag: 'pet-need' })
  } catch {
    /* notificação indisponível */
  }
}

/* Enquanto o pedaço não chega, mostra um espaço do mesmo tamanho (sem
   "pulo" de layout) em vez de tela branca. */
function TelaCarregando() {
  return <div className="view" aria-busy="true" />
}

function App() {
  const [library, setLibrary] = useState([])
  const [loadingLib, setLoadingLib] = useState(false)
  const [libraryHydrated, setLibraryHydrated] = useState(false)
  const [cacheCleanMsg, setCacheCleanMsg] = useState('')
  const [freeSpaceMsg, setFreeSpaceMsg] = useState('')
  const [view, setView] = useState('inicio')
  const [shopOpen, setShopOpen] = useState(false)
  const [shopTab, setShopTab] = useState('comida')
  const [inv, setInv] = useState(() => {
    const s = readLocal('nt.inv')
    return s && typeof s === 'object' && Object.keys(s).length ? s : { ...START_INVENTORY }
  })

  useEffect(() => {
    writeLocal('nt.inv', inv)
  }, [inv])
  // Brinquedos comprados: permanentes, ficam no card do botão Brincar
  const [toys, setToys] = useState(() => {
    const s = readLocal('nt.toys')
    return Array.isArray(s) ? s : []
  })
  // Itens de banho comprados: { chave: usos restantes }
  const [bath, setBath] = useState(() => {
    const s = readLocal('nt.bath')
    return s && typeof s === 'object' ? s : {}
  })

  useEffect(() => {
    writeLocal('nt.toys', toys)
  }, [toys])

  useEffect(() => {
    writeLocal('nt.bath', bath)
  }, [bath])

  const [libMoreOpen, setLibMoreOpen] = useState(false)
  const [achSeen, setAchSeen] = useState(() => readLocal('nt.achSeen') || [])
  const [achQueue, setAchQueue] = useState([])
  const achQueueRef = useRef([])

  useEffect(() => {
    writeLocal('nt.achSeen', achSeen)
  }, [achSeen])

  const dismissAchToast = useCallback(() => {
    achQueueRef.current = achQueueRef.current.slice(1)
    setAchQueue(achQueueRef.current)
  }, [])
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
    if (empty) return PET_GREETINGS[0]()
    const n = (name || '').trim()
    if (!n) {
      // Sem nome salvo: o gatinho lembra (de leve) de perguntar.
      const prompts = [
        'Ei! Sou a Nebula... qual é o seu nome? Conta lá em Configurações! 🐾',
        'Hmm, ainda não sei seu nome... eu sou a Nebula, e você? 🥺',
        'Oi! Me diz seu nome nas Configurações pra eu te chamar! Eu sou a Nebula. ✨',
      ]
      greetIdxRef.current = (greetIdxRef.current + 1) % prompts.length
      return prompts[greetIdxRef.current]
    }
    greetIdxRef.current = ((greetIdxRef.current + 1) % (PET_GREETINGS.length - 1)) + 1
    return PET_GREETINGS[greetIdxRef.current](n)
  }, [])
  const [petGreet, setPetGreet] = useState(null)
  // Gatinho chamando de volta: notificação real no app + lembrete na tela no site.
  const [petReminder, setPetReminder] = useState(null)
  useEffect(() => {
    if (!IS_NATIVE) return undefined
    const ID = 9017
    const scheduleNudge = () => {
      try {
        LocalNotifications.schedule({
          notifications: [
            {
              id: ID,
              title: '🐱 Nebula, seu gatinho',
              body: pickPetNudge(),
              channelId: 'pet',
              smallIcon: 'ic_notification',
              schedule: { at: new Date(Date.now() + Math.round(random(90, 300)) * 60000) },
            },
          ],
        }).catch(() => {})
      } catch {
        /* notificação indisponível */
      }
    }
    const cancelNudge = () => {
      LocalNotifications.cancel({ notifications: [{ id: ID }] }).catch(() => {})
    }
    try {
      LocalNotifications.createChannel({
        id: 'pet',
        name: 'Gatinho',
        description: 'Lembretes do gatinho do NebulaTune',
        importance: 4,
      }).catch(() => {})
    } catch {
      /* canal indisponível */
    }
    let unreg = null
    try {
      unreg = CapacitorApp.addListener('appStateChange', (s) => {
        if (s.isActive) cancelNudge()
        else scheduleNudge()
      })
    } catch {
      /* sem suporte */
    }
    return () => {
      try {
        unreg?.then((l) => l.remove?.())
      } catch {
        /* ignora */
      }
      cancelNudge()
    }
  }, [])

  useEffect(() => {
    if (IS_NATIVE) return undefined
    let lastTouch = Date.now()
    const bump = () => {
      lastTouch = Date.now()
    }
    const evs = ['pointerdown', 'touchstart', 'keydown']
    evs.forEach((ev) => window.addEventListener(ev, bump, { passive: true }))
    const timer = setInterval(() => {
      if (document.hidden || petReminder) return
      if (Date.now() - lastTouch > 45 * 60000) {
        setPetReminder({ id: Date.now(), text: pickPetNudge() })
        lastTouch = Date.now()
      }
    }, 30000)
    return () => {
      evs.forEach((ev) => window.removeEventListener(ev, bump))
      clearInterval(timer)
    }
  }, [petReminder])

  useEffect(() => {
    if (!petReminder) return undefined
    const t = setTimeout(() => setPetReminder(null), 9000)
    return () => clearTimeout(t)
  }, [petReminder])
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
  const { petStats, bumpPet, settlePet, restorePetStats } = usePetStats()

  // Permissão de notificação (uma vez só): o gatinho precisa dela pra chamar de volta
  useEffect(() => {
    if (!IS_NATIVE) return undefined
    if (readLocal('nt.notifAsked')) return undefined
    writeLocal('nt.notifAsked', 1)
    const t = setTimeout(() => requestNotificationsPermission(), 2500)
    return () => clearTimeout(t)
  }, [])

  // ---------- Chamada do gatinho quando uma barra fica baixa ----------
  // O pet manda notificação pedindo pra pessoa entrar no app (tipo "tô com fome 🍗").
  // Respeita um intervalo mínimo por necessidade pra não encher o celular de aviso.
  const needNotifRef = useRef(readLocal('nt.petNotif') || {})
  useEffect(() => {
    const agora = Date.now()
    const marca = { ...(needNotifRef.current || {}) }
    let mudou = false
    const baixa = MOOD_KEYS.filter((k) => {
      const v = Number(petStats?.[k])
      return Number.isFinite(v) && v < MOOD_LOW_NOTIF
    }).sort((a, b) => (petStats[a] || 0) - (petStats[b] || 0))
    if (!baixa.length) {
      needNotifRef.current = marca
      return
    }
    const key = baixa[0]
    const info = PET_NEEDS_INFO[key]
    if (!info) return
    const valor = Number(petStats[key]) || 0
    const urgente = valor < MOOD_URGENT_NOTIF
    const ultima = Number(marca[key]) || 0
    if (agora - ultima < NEED_COOLDOWN_MS) {
      needNotifRef.current = marca
      return
    }
    const qualquer = Math.max(0, ...Object.values(marca).map((n) => Number(n) || 0))
    if (agora - qualquer < NEED_GAP_MS) {
      needNotifRef.current = marca
      return
    }
    const texto = pickNeedNudge(key, appSettings.userName, urgente)
    // App aberto: mostra o lembrete na própria tela (notificação seria invisível)
    if (document.visibilityState === 'visible') {
      if (!document.hidden) {
        setPetReminder({ id: agora, text: texto, need: key })
        marca[key] = agora
        mudou = true
      }
    } else {
      const titulo = urgente ? `🚨 ${info.emoji} ${info.label} crítica!` : `${info.emoji} Vem ver o gatinho!`
      if (IS_NATIVE) {
        try {
          LocalNotifications.createChannel({
            id: 'pet',
            name: 'Gatinho',
            description: 'Chamadas do gatinho do NebulaTune',
            importance: 4,
          }).catch(() => {})
          LocalNotifications.schedule({
            notifications: [
              {
                id: 9100 + MOOD_KEYS.indexOf(key),
                title: titulo,
                body: texto,
                channelId: 'pet',
                smallIcon: 'ic_notification',
                schedule: { at: new Date(agora + 60000) },
              },
            ],
          }).catch(() => {})
        } catch {
          /* notificação indisponível */
        }
      } else {
        notificarWeb(titulo, texto)
      }
      marca[key] = agora
      mudou = true
    }
    if (mudou) {
      needNotifRef.current = marca
      writeLocal('nt.petNotif', marca)
    }
  }, [petStats, appSettings.userName])

  // Quando a pessoa entra no app, desmarca as chamadas já respondidas
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      needNotifRef.current = {}
      writeLocal('nt.petNotif', {})
      if (IS_NATIVE) {
        try {
          LocalNotifications.cancel({ notifications: MOOD_KEYS.map((_, i) => ({ id: 9100 + i })) }).catch(() => {})
        } catch {
          /* canal indisponível */
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const handlePetAction = useCallback(
    (a, extra) => {
      const map = {
        touch: { stat: 'touches', coins: 2, mood: { happy: 6 } },
        heart: { stat: 'hearts', coins: 1, mood: { happy: 14 } },
        scared: { stat: 'scares', coins: 0, mood: {} },
        sleep: { stat: 'sleeps', coins: 1, mood: { sleep: 36, happy: 4 } },
        meow: { stat: 'meows', coins: 0, mood: {} },
        food: { stat: null, coins: 2, mood: { full: 28, happy: 6 } },
        play: { stat: null, coins: 2, mood: { happy: 22, sleep: -5 } },
        bath: { stat: null, coins: 2, mood: { clean: 34, happy: 4 } },
        bubbles: { stat: null, coins: 1, mood: { happy: 18 } },
      }
      const def = map[a]
      if (def) {
        if (def.stat) bumpPet(def.stat, 1)
        if (def.coins) bumpPet('coins', def.coins)
        const mood = extra?.mood || def.mood
        if (mood) settlePet(mood)
      }
    },
    [bumpPet, settlePet],
  )
  const shopCoins = Number(petStats?.coins) || 0
  const shopAll = SHOP_CONSUMABLES
  const dailyOffer = shopAll[Math.floor(Date.now() / 86400000) % shopAll.length]
  const dailyPrice = dailyOffer ? Math.round(dailyOffer.price * 0.6) : 0
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
    const finish = () => {
      if (!alive) return
      requestAnimationFrame(() => setLoadingLib(false))
    }
    ;(async () => {
      const rows = readLocal('nt.library')
      if (!alive || !Array.isArray(rows)) {
        if (alive) setLibraryHydrated(true)
        return
      }
      setLoadingLib(true)
      const ids = rows.map((r) => (r && r.id) || '')
      const mediaList = await loadAllMediaBlobs(ids)
      if (!alive) return
      const hydrated = []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!row || typeof row !== 'object') continue
        try {
          const media = mediaList[i] || {}
          const audioBlob = media.audio instanceof Blob ? media.audio : null
          const coverBlob = media.cover instanceof Blob ? media.cover : null
          const prevCover =
            row.coverUrl && row.coverUrl.startsWith('blob:') ? null : row.coverUrl || null
          hydrated.push({
            ...row,
            audioBlob,
            src: audioBlob ? URL.createObjectURL(audioBlob) : null,
            coverBlob,
            coverUrl: coverBlob
              ? URL.createObjectURL(coverBlob)
              : row.coverRemote || prevCover,
            audioMissing: row.audioMissing === true && !audioBlob,
          })
        } catch {
          // Música defeituosa não derruba o carregamento da biblioteca inteira.
        }
      }
      if (!alive) return
      setLibrary(hydrated)
      setLibraryHydrated(true)
      finish()
    })()
    // Rede de segurança: nunca deixar preso em "Carregando sua biblioteca…".
    const guard = setTimeout(finish, 8000)
    return () => {
      alive = false
      clearTimeout(guard)
    }
  }, [])

  // Salva a biblioteca localmente (debounce): metadados + blobs novos.
  useEffect(() => {
    const t = setTimeout(() => {
      // Nunca gravar "biblioteca vazia" por cima da verdadeira antes de a
      // hidratação terminar: isso fazia as músicas sumirem ao trocar de versão.
      if (!libraryHydrated && library.length === 0) return
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
  }, [library, libraryHydrated])

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

  const [playedRecent, setPlayedRecent] = useState(() => readLocal('nt.playedRecent') || [])

  useEffect(() => {
    writeLocal('nt.playedRecent', playedRecent)
  }, [playedRecent])

  const pushPlayedRecent = useCallback((id) => {
    if (!id) return
    setPlayedRecent((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 10))
  }, [])

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
  const recentRow = useMemo(
    () => playedRecent.map((id) => library.find((t) => t.id === id)).filter(Boolean),
    [playedRecent, library],
  )

  useEffect(() => {
    const done = getAchievements(library, petStats?.touches || 0, {
      buys: Number(petStats?.buys) || 0,
      toys: toys.length,
      baths: Object.values(bath).filter((n) => Number(n) > 0).length,
    }).filter((a) => a.done)
    const doneIds = new Set(done.map((a) => a.id))
    const seenIds = new Set(achSeen)
    const fresh = done.filter(
      (a) => !seenIds.has(a.id) && !achQueueRef.current.some((q) => q.id === a.id),
    )
    if (fresh.length) {
      achQueueRef.current = [...achQueueRef.current, ...fresh]
      setAchQueue(achQueueRef.current)
    }
    // “Visto” só cresce: junta os novos feitos com o histórico (nunca apaga no carregamento)
    const merged = Array.from(new Set([...achSeen, ...doneIds]))
    if (merged.length !== achSeen.length) setAchSeen(merged)
  }, [library, petStats, achSeen, toys, bath])
  const favoriteTracks = useMemo(() => library.filter((t) => t.fav), [library])
  const queueTracks = useMemo(() => queue.map((id) => library.find((t) => t.id === id)).filter(Boolean), [queue, library])
  const [showQueue, setShowQueue] = useState(false)
  const [pendingOnlineQuery, setPendingOnlineQuery] = useState('')
  const [editingTrack, setEditingTrack] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimerRef = useRef(null)
  const hasNotif =
    !!updatePrompt || !!petReminder || library.some((t) => t.audioMissing)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(''), 2200)
  }, [])

  const buyShopItem = useCallback(
    (it, offerPrice) => {
      const price = offerPrice ?? it.price
      if ((Number(petStats?.coins) || 0) < price) return
      if (it.kind === 'toy' && toys.includes(it.key)) return
      if (it.kind === 'bath' && (bath[it.key] || 0) > 0) return
      bumpPet('coins', -price)
      bumpPet('buys', 1)
      if (it.kind === 'food') {
        // Comida vai pro estoque: só aparece no card do botão Comida depois de comprada
        setInv((prev) => ({ ...prev, [it.key]: (prev[it.key] || 0) + 1 }))
        showToast(`${it.emoji} ${it.name} no estoque!`)
      } else if (it.kind === 'toy') {
        // Brinquedo é permanente: fica no card do botão Brincar pra sempre
        setToys((prev) => (prev.includes(it.key) ? prev : [...prev, it.key]))
        showToast(`${it.emoji} ${it.name} é dele pra sempre!`)
      } else if (it.kind === 'bath') {
        // Item de banho: entra com o número de usos que veio no pacote
        setBath((prev) => ({ ...prev, [it.key]: (prev[it.key] || 0) + (it.uses || 1) }))
        showToast(`${it.emoji} ${it.name} ×${it.uses} usos!`)
      } else {
        settlePet(it.mood)
        showToast(`${it.emoji} ${it.name}!`)
      }
      if (appSettings.petSound !== false) {
        sfxCoin()
        setTimeout(sfxSpawn, 260)
      }
    },
    [petStats, toys, bath, bumpPet, settlePet, appSettings.petSound, showToast],
  )

// O gato comeu: tira 1 do estoque
const onFoodEaten = useCallback((key) => {
    setInv((prev) => {
      const n = (prev[key] || 0) - 1
      const next = { ...prev }
      if (n > 0) next[key] = n
      else delete next[key]
      return next
    })
  }, [])

// Usou um item de banho: gasta 1 uso (a Esponjinha é a padrão e nunca acaba)
  const onBathUsed = useCallback((key) => {
    if (!key) return
    setBath((prev) => {
      const n = (prev[key] || 0) - 1
      const next = { ...prev }
      if (n > 0) next[key] = n
      else delete next[key]
      return next
    })
  }, [])

  // Fim de um minigame: moedas ganhas + quantas partidas foram jogadas
  const onMinigame = useCallback(
    ({ coins = 0, plays = 0 } = {}) => {
      if (coins) bumpPet('coins', coins)
      if (plays) bumpPet('minigames', plays)
    },
    [bumpPet],
  )

  const dailyCat = SHOP_TOYS.includes(dailyOffer)
    ? 'brinquedo'
    : SHOP_BATH.includes(dailyOffer)
      ? 'banho'
      : SHOP_MIMOS.includes(dailyOffer)
        ? 'mimo'
        : 'comida'

  // Card minimalista da loja: preço sempre visível (mesmo sem saldo) + quanto falta
  const shopItemCard = (it, { offer = false, owned = false, qty = 0, uses = 0 } = {}) => {
    const price = offer ? dailyPrice : it.price
    const missing = Math.max(0, price - shopCoins)
    return (
      <button
        className={`shop-item${owned ? ' is-owned' : missing > 0 ? ' is-poor' : ''}`}
        disabled={owned || missing > 0}
        onClick={() => buyShopItem(it, offer ? dailyPrice : undefined)}
        title={it.desc || it.name}
      >
        <span className="shop-item-emoji">{it.emoji}</span>
        <span className="shop-item-name">{it.name}</span>
        <span className="shop-item-eff">
          {it.kind === 'food'
            ? `${MOOD_OF.full} +${it.full}${it.happy ? ` · ${MOOD_OF.happy} +${it.happy}` : ''}`
            : it.kind === 'toy'
              ? `${MOOD_OF.happy} +${it.happy} · permanente`
              : it.kind === 'bath'
                ? `${MOOD_OF.clean} +${it.clean} · ${it.uses} usos`
                : it.mood
                  ? Object.keys(it.mood)
                      .filter((k) => it.mood[k] > 0)
                      .map((k) => `${MOOD_OF[k]} +${it.mood[k]}`)
                      .join(' · ')
                  : it.desc}
        </span>
        {it.kind === 'food' && qty > 0 && <span className="shop-item-own">no estoque: {qty}</span>}
        {it.kind === 'bath' && uses > 0 && <span className="shop-item-own">resta {uses} usos</span>}
        <span className="shop-item-price">
          {owned ? (
            it.kind === 'toy' ? '✓ dele' : `✓ ${uses} usos`
          ) : (
            <>
              {offer && <s>{it.price} 🪙</s>}
              <b>{price} 🪙</b>
              {missing > 0 && <em>faltam {missing}</em>}
            </>
          )}
        </span>
      </button>
    )
  }

  const genTopMonth = useCallback(() => {
    const now = new Date()
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const scored = library
      .map((t) => {
        let n = 0
        for (const [day, c] of Object.entries(t.playDays || {})) {
          if (day.startsWith(prefix)) n += Number(c) || 0
        }
        return { id: t.id, n }
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 25)
    if (!scored.length) {
      showToast('Ouça algumas músicas primeiro')
      return
    }
    const months = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    ]
    const pid = `top-${prefix.replace('-', '')}`
    const name = `Top de ${months[now.getMonth()]}`
    const ids = scored.map((s) => s.id)
    setPlaylists((prev) => {
      const ix = prev.findIndex((p) => p.id === pid)
      if (ix >= 0) {
        const next = [...prev]
        next[ix] = { ...next[ix], name, trackIds: ids }
        return next
      }
      return [...prev, { id: pid, name, trackIds: ids, createdAt: Date.now(), auto: true }]
    })
    setActivePlaylist(pid)
    showToast(`${name} pronta!`)
  }, [library, showToast])

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
  // Sons mais altos quando não há música tocando (avisado no lib/sfx.js)
  useEffect(() => { setMusicPlaying(playing) }, [playing])

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

  /* Limpa só o que sobrou: blobs de músicas que foram apagadas da biblioteca.
     A "limpar cache" de cima não podia apagar isso (senão a música sumia). */
  const freeSpace = useCallback(async () => {
    setFreeSpaceMsg('Procurando espaço perdido…')
    const antes = await mediaStorageInfo().catch(() => ({ bytes: 0 }))
    try {
      const quantos = await purgeOrphanMedia(library.map((x) => x.id))
      const depois = await mediaStorageInfo().catch(() => ({ bytes: 0 }))
      const liberados = Math.max(0, antes.bytes - depois.bytes)
      setFreeSpaceMsg(
        quantos
          ? `Liberados ~${fmtBytes(liberados)} de ${quantos} ${quantos === 1 ? 'música' : 'músicas'} que não estão mais na biblioteca.`
          : 'Nada sobrando: o espaço está limpo.',
      )
    } catch {
      setFreeSpaceMsg('Não consegui liberar espaço agora.')
    }
  }, [library])

  const queueItemLocal = useCallback(
    (id) => {
      stopOnline()
      playQueueItem(id)
    },
    [playQueueItem, stopOnline],
  )

  const importLibrary = useCallback((tracks, extra) => {
    if (tracks && tracks.length) {
      setLibrary((prev) => {
        const byId = new Set(prev.map((t) => t.id))
        const fresh = tracks.filter((t) => !byId.has(t.id))
        return fresh.length ? [...prev, ...fresh] : prev
      })
    }
    if (extra) {
      if (extra.settings && typeof extra.settings === 'object') settingsApi.setAll(extra.settings)
      if (extra.petStats && typeof extra.petStats === 'object') restorePetStats(extra.petStats)
      if (Array.isArray(extra.playlists)) setPlaylists(extra.playlists)
      if (extra.lyricSync && typeof extra.lyricSync === 'object') setSyncOffsets(extra.lyricSync)
      showToast('Configurações restauradas ✔')
    }
    setView('biblioteca')
  }, [settingsApi, restorePetStats, showToast])

  const playById = useCallback(
    (id) => {
      const i = library.findIndex((t) => t.id === id)
      if (i >= 0) {
        stopOnline()
        select(i)
        pushPlayedRecent(id)
        setShowNowPlaying(true)
      }
    },
    [library, select, stopOnline, pushPlayedRecent],
  )

  const playByList = useCallback(
    (tracks, id) => {
      stopOnline()
      playerPlayByList(tracks, id)
      pushPlayedRecent(id)
      setShowNowPlaying(true)
    },
    [playerPlayByList, stopOnline, pushPlayedRecent],
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

      {!appSettings.lowPower && (
        <BackgroundFX bgAnimated={appSettings.bgAnimated} cosmosAnimated={appSettings.cosmosAnimated} />
      )}

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
                  {hasNotif && <span className="notification-dot" />}
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
                <button className="icon-btn nav-arrow" onClick={() => setView('inicio')} aria-label="Voltar">
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
                    if (e.target.value) setView('inicio')
                  }}
                />
                <MicButton
                  onResult={(text) => {
                    setQuery(text)
                    if (text) setView('inicio')
                  }}
                  notify={showToast}
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
                  {hasNotif && <span className="notification-dot" />}
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
              {(() => {
                const go = (v) => {
                  setNotifOpen(false)
                  setView(v)
                }
                const items = []
                if (updatePrompt) {
                  items.push({
                    id: 'update',
                    icon: (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                    ),
                    text: <>Nova versão <b>{updatePrompt}</b> disponível. Toque para atualizar.</>,
                    onClick: () => go('configuracoes'),
                  })
                }
                if (petReminder) {
                  items.push({
                    id: 'pet',
                    icon: (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M10 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM18 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /></svg>
                    ),
                    text: <>{petReminder.text}</>,
                    onClick: () => go('inicio'),
                  })
                }
                const missingAudio = library.filter((t) => t.audioMissing).length
                if (missingAudio > 0) {
                  items.push({
                    id: 'noaudio',
                    icon: (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    ),
                    text: <>{missingAudio} {missingAudio === 1 ? 'música sem áudio' : 'músicas sem áudio'} na biblioteca.</>,
                    onClick: () => go('biblioteca'),
                  })
                }
                const lastAchId = achSeen[achSeen.length - 1]
                const lastAch = lastAchId
                  ? getAchievements(library, petStats?.touches || 0, {
                    buys: Number(petStats?.buys) || 0,
                    toys: toys.length,
                    baths: Object.values(bath).filter((n) => Number(n) > 0).length,
                  }).find((a) => a.id === lastAchId)
                  : null
                if (lastAch) {
                  items.push({
                    id: 'ach',
                    icon: <span aria-hidden="true">{lastAch.icon}</span>,
                    text: <>Última conquista: <b>{lastAch.name}</b>.</>,
                    onClick: () => go('perfil'),
                  })
                }
                if (!items.length) {
                  return (
                    <div className="notif-item">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                      <span>Tudo em dia! App na versão <b>v{APP_VERSION}</b>.</span>
                    </div>
                  )
                }
                return items.map((n) => (
                  <button key={n.id} className="notif-item notif-item-btn" onClick={n.onClick}>
                    {n.icon}
                    <span>{n.text}</span>
                  </button>
                ))
              })()}
            </div>
          )}
        </header>

        {view !== 'habitat' && (
          <div className={`mobile-tabs ${IS_NATIVE ? 'app-bottom-nav' : ''}`}>
            {[
              ['inicio', 'Início', 'home'],
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
        )}

        {view === 'inicio' && (
          <section className="view">
            <div className="lib-head lib-head-home">
              <h1 className="greeting">
                {appSettings.userName
                  ? `${greetingForHour(now.getHours())}, ${appSettings.userName} ✦`
                  : `${greetingForHour(now.getHours())} ✦`}
              </h1>
              <div className="search-wrap home-search">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  className="search"
                  placeholder="O que você quer ouvir?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <MicButton onResult={(text) => setQuery(text)} notify={showToast} />
                {query && (
                  <button className="search-clear" onClick={() => setQuery('')} aria-label="Limpar busca">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <span className="lib-head-right">
                <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                  + Adicionar músicas
                </button>
              </span>
            </div>

            {query.trim() ? (
              <>
                <h2 className="section-title">Resultados</h2>
                {results.length ? (
                  <TrackList tracks={results} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
                ) : (
                  <p className="empty">Nenhuma música encontrada para “{query}”.</p>
                )}
              </>
            ) : (
              <>
            <PetHabitatCard
              greeting={petGreet}
              greetMs={!loadingLib && library.length === 0 ? 0 : 4800}
              stats={petStats}
              onShowProfile={() => setView('perfil')}
              onOpenHabitat={() => setView('habitat')}
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
              userName={appSettings.userName}
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
                {recentRow.length > 0 && (
                  <QuickTrackGrid title="Recentes" tracks={recentRow.slice(0, 2)} onPlay={playById} />
                )}

                <div className="section">
                  <h2 className="section-title">Todas as músicas</h2>
<TrackList tracks={library} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
                </div>
              </>
            )}
              </>
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
                      <div className="lib-title-wrap">
                        <h1 className="greeting">{pl.name}</h1>
                        <p className="lib-sub">
                          {plTracks.length} {plTracks.length === 1 ? 'música' : 'músicas'}
                          {' · '}
                          {formatTime(plTracks.reduce((acc, t) => acc + (t.duration || 0), 0))}
                        </p>
                      </div>
                      <div className="lib-actions">
                        <button className="btn-ghost" onClick={() => setRenamePlaylistOpen(true)}>
                          Renomear
                        </button>
                        <button className="btn-ghost" onClick={() => removePlaylist(pl.id)}>
                          Apagar
                        </button>
                      </div>
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
                  <div className="lib-title-wrap">
                    <h1 className="greeting">Sua Biblioteca</h1>
                    {library.length > 0 && (
                      <p className="lib-sub">
                        {library.length} {library.length === 1 ? 'música' : 'músicas'}
                        {' · '}
                        {formatTime(library.reduce((acc, t) => acc + (t.duration || 0), 0))}
                      </p>
                    )}
                  </div>
                  <div className="lib-actions">
                    <button className="btn-ghost" onClick={() => setLibMoreOpen((v) => !v)} aria-expanded={libMoreOpen} title="Mais ações">
                      ⋯
                    </button>
                    <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                      + Adicionar
                    </button>
                  </div>
                </div>

                {libMoreOpen && (
                  <div className="lib-more">
                    {!IS_NATIVE && (
                      <button className="btn-ghost" onClick={() => { setLibMoreOpen(false); folderInputRef.current?.click() }}>
                        Importar pasta
                      </button>
                    )}
                    {IS_NATIVE && (
                      <button className="btn-ghost" onClick={() => { setLibMoreOpen(false); openDeviceImport() }}>
                        Importar do aparelho
                      </button>
                    )}
                    {library.length > 0 && (
                      <button className="btn-ghost danger" onClick={() => { setLibMoreOpen(false); clearLibrary() }}>
                        Limpar tudo
                      </button>
                    )}
                  </div>
                )}

                {(playlists.length > 0 || library.length > 0) && (
                  <div className="section">
                    <div className="playlist-head">
                      <h2 className="section-title">Playlists</h2>
                      <div className="lib-actions">
                        {library.length > 0 && (
                          <button className="btn-ghost" onClick={genTopMonth}>
                            Top do mês
                          </button>
                        )}
                        <button className="btn-ghost" onClick={() => setCreatePlaylistOpen(true)}>
                          + Nova
                        </button>
                      </div>
                    </div>
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
                  </div>
                )}

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
                  <TrackList tracks={library} currentId={track?.id} onSelect={playById} onRemove={removeTrack} onToggleFavorite={toggleFavorite} onQueueNext={queueNextLocal} onQueueAdd={queueAddLocal} onSearchOnline={searchTrackOnline} onEdit={setEditingTrack} onShare={shareTrack} onOpenSource={openExternal} onAddToPlaylist={setPlaylistPickerTrack} />
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
      {view === 'habitat' && (
          <Suspense fallback={<TelaCarregando />}>
            <PetHabitatView
            onBack={() => setView('inicio')}
            stats={petStats}
            inv={inv}
            toys={toys}
            bath={bath}
            onFoodEaten={onFoodEaten}
            onBathUsed={onBathUsed}
            onMinigame={onMinigame}
            onOpenShop={() => setShopOpen(true)}
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
            userName={appSettings.userName}
          />
          </Suspense>
        )}
      {view === 'perfil' && (
          <Suspense fallback={<TelaCarregando />}>
            <Profile settings={appSettings} api={settingsApi} library={library} onPlay={playById} petStats={petStats} />
          </Suspense>
        )}
      {view === 'online' && (
          <Suspense fallback={<TelaCarregando />}>
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
          </Suspense>
        )}
      {view === 'equalizador' && (
          <section className="view">
            <Equalizer eq={eq} />
          </section>
        )}
      {view === 'configuracoes' && (
          <Suspense fallback={<TelaCarregando />}>
            <SettingsView
            settings={appSettings}
            api={settingsApi}
            library={library}
            isIOS={isIOS}
            isAppInstalled={isAppInstalled}
            installEvt={installEvt}
            onInstall={installApp}
            isNative={IS_NATIVE}
            onImport={importLibrary}
            onShareApp={shareApp}
            onClearCache={clearCache}
            cacheCleanMsg={cacheCleanMsg}
            onFreeSpace={freeSpace}
            freeSpaceMsg={freeSpaceMsg}
            onOpenChangelog={() => setChangelogOpen(true)}
            petStats={petStats}
            playlists={playlists}
            lyricSync={syncOffsets}
          />
          </Suspense>
        )}
      </main>

      {view === 'inicio' && displayTrack && (
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
          userName={appSettings.userName}
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

      {petReminder && (
        <div
          className="pet-reminder"
          role="button"
          tabIndex={0}
          onClick={() => setPetReminder(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setPetReminder(null)
          }}
        >
          <span className="pet-reminder-icon">🐱</span>
          <span className="pet-reminder-body">
            <b className="pet-reminder-title">Nebula 🐾</b>
            <span className="pet-reminder-text">{petReminder.text}</span>
          </span>
          <span
            className="pet-reminder-close"
            role="button"
            tabIndex={0}
            aria-label="Fechar lembrete"
            onClick={(e) => {
              e.stopPropagation()
              setPetReminder(null)
            }}
          >
            ✕
          </span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <AchToast
        item={achQueue[0] || null}
        soundOn={appSettings.petSound !== false}
        onDone={dismissAchToast}
      />

      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}

      {shopOpen && (
        <div className="modal-overlay" onClick={() => setShopOpen(false)}>
          <div className="modal shop-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shop-head">
              <h3 className="modal-title">🛍️ Lojinha</h3>
              <span className="shop-balance-value">{shopCoins} 🪙</span>
            </div>

            <div className="shop-tabs" role="tablist">
              {SHOP_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={shopTab === t.id}
                  className={`shop-tab${shopTab === t.id ? ' is-active' : ''}`}
                  onClick={() => setShopTab(t.id)}
                >
                  <span className="shop-tab-icon">{t.icon}</span>
                  <span className="shop-tab-label">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="shop-body">
              {dailyCat === shopTab && (
                <div className="shop-offer">
                  <span className="shop-offer-tag">⚡ Oferta do dia</span>
                  {shopItemCard(dailyOffer, {
                    offer: true,
                    qty: dailyOffer.kind === 'food' ? inv[dailyOffer.key] || 0 : 0,
                    uses: dailyOffer.kind === 'bath' ? bath[dailyOffer.key] || 0 : 0,
                    owned:
                      (dailyOffer.kind === 'toy' && toys.includes(dailyOffer.key)) ||
                      (dailyOffer.kind === 'bath' && (bath[dailyOffer.key] || 0) > 0),
                  })}
                </div>
              )}
              <div className="shop-grid">
                {(SHOP_BY_TAB[shopTab] || []).map((it) =>
                  shopItemCard(it, {
                    qty: it.kind === 'food' ? inv[it.key] || 0 : 0,
                    uses: it.kind === 'bath' ? bath[it.key] || 0 : 0,
                    owned:
                      (it.kind === 'toy' && toys.includes(it.key)) ||
                      (it.kind === 'bath' && (bath[it.key] || 0) > 0),
                  }),
                )}
              </div>
            </div>

            <div className="modal-actions shop-foot">
              <button className="btn-ghost" onClick={() => setShopOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
