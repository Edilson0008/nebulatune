import { useEffect, useRef } from 'react'
import { hideNowPlaying, onMediaAction, updateNowPlaying } from '../mediaNotification'
import { useProgress } from '../progress-context.js'
import { requestNotificationsPermission } from '../updater'
import { IS_NATIVE } from '../lib/env.js'

export function useMediaSession({ track, playing, speed, onToggle, onNext, onPrev, onSeek }) {
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
