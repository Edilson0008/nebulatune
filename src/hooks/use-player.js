import { useCallback, useEffect, useRef, useState } from 'react'
import * as engine from '../audio/engine'
import * as graph from '../audio/graph'

export function usePlayer(library, speed = 1, onStart, sink = null, onMissing = null) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const lastElapsedRef = useRef(-1)
  const lastDurationRef = useRef(0)
  const audioRef = useRef(null)
  const modeRef = useRef('none')
  const indexRef = useRef(0)
  const libRef = useRef(library)
  const onEndedRef = useRef(() => {})
  const onStartRef = useRef(onStart)
  const onMissingRef = useRef(onMissing)
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
    // Só toca o que tem ARQUIVO de verdade (`src` ou blob). `audioMissing` não
    // é mais atalho para "pode tocar": o filtro da biblioteca já garante que
    // essa coluna é sempre falsa, e confiar nela aqui era o que deixava uma
    // música só da nuvem ser escolhida e soar no sintetizador.
    const soundable = (c) => Boolean(c && (c.src || c.audioBlob))
    if (!soundable(libAll[i])) {
      for (let step = 1; step < libAll.length; step += 1) {
        const j = (i + step) % libAll.length
        if (soundable(libAll[j])) {
          i = j
          break
        }
      }
    }
    const t = libAll[i]
    if (!t) return false
    indexRef.current = i
    setCurrentIndex(i)

    const finish = () => {
      setPlaying(true)
      onStartRef.current?.(i)
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
      return true
    }
    if (t.audioBlob && (t.audioBlob.size || t.audioBlob.type)) {
      const src = URL.createObjectURL(t.audioBlob)
      currentAudioUrlRef.current = src
      const up = { ...t, src }
      // O hook recebe `library` como prop e nao tem setter: quem manda no
      // estado da biblioteca e o App. A chamada antiga de `setLibrary` nao
      // existia aqui e estourava ReferenceError justamente ao tocar musica que
      // vem da nuvem em blob. O ref acima e a fonte de verdade deste hook.
      libRef.current[i] = up
      startFile(src, t.duration)
      return true
    }
    // NÃO existe mais o "se não achou arquivo, toca sintetizador": essa era a
    // forma como uma música que só existe na nuvem aparecia com a voz de um
    // instrumento de mentira. A biblioteca só chega aqui com áudio de verdade
    // (portão em `biblioteca.js` / `comAudio` no App), então chegar aqui sem
    // `src` e sem blob é dado corrompido — e dado corrompido não se ouve: só
    // avisa e segue para a próxima.
    // Mesma regra do portao da biblioteca: so tem audio o que tem arquivo.
    if (!(t && (t.src || t.audioBlob))) {
      modeRef.current = 'none'
      if (audioRef.current) audioRef.current.pause()
      onMissingRef.current?.(t)
      return false
    }
    return true
  }, [getAudio, playWithRetry, emitProgress])

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
      playingRef.current = false
      setPlaying(false)
      return
    }
    // `playingRef` so era sincronizado DEPOIS do render. O `playWithRetry`
    // aborta enquanto `playingRef.current` for falso, entao o primeiro toque em
    // play nao tocava nada: so comecava no `setInterval` de 500ms que vasculha
    // o audio pausado. Precisa estar verdadeiro ANTES de `startIndex`.
    playingRef.current = true
    let comecou
    if (modeRef.current === 'file') {
      const a = getAudio()
      if (a.src) {
        graph
          .resumeContext()
          .then(() => a.play().catch(() => {}))
        comecou = true
      } else {
        comecou = startIndex(indexRef.current)
      }
    } else if (engine.hasTrack() && engine.currentIndex() === indexRef.current + 1) {
      engine.resumeTrack()
      comecou = true
    } else {
      comecou = startIndex(indexRef.current)
    }
    // Antes o `setPlaying(true)` era incondicional: dar play numa faixa sem
    // arquivo deixava o app marcado como TOCANDO para sempre, com a tela de
    // "tocando agora" parada e nenhum som. So entra em tocando quando o audio
    // realmente comecou; caso contrario, desmarca e devolve o play.
    if (comecou) {
      setPlaying(true)
    } else {
      playingRef.current = false
      setPlaying(false)
    }
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
    onMissingRef.current = onMissing
  }, [onMissing])

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
  }, [playing, getAudio, handleEnded, playWithRetry, emitProgress])

  useEffect(() => {
    // Flag local deste efeito: o codigo lia um `cancelledRef` que nunca foi
    // declarado, entao qualquer retorno do app ao primeiro plano
    // (visibility/pageshow) estourava ReferenceError em vez de retomar.
    let cancelled = false
    const resume = () => {
      if (cancelled || !playingRef.current) return
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
      cancelled = true
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
