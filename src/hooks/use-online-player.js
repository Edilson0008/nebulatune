import { useCallback, useEffect, useRef, useState } from 'react'

export function useOnlinePlayer(rate = 1, sink = null) {
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
