import { Capacitor } from '@capacitor/core'
import { MediaSession as CapgoMediaSession } from '@capgo/capacitor-media-session'

const isNative = () => Capacitor?.isNativePlatform?.() === true

/* Espelha os callbacks do player (onToggle/onNext/onPrev/onSeek) p/ os bots da barra */
let actionsCb = null

function safe(fn) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => console.warn('[mediaSession] chamada nativa falhou', e))
}

function toArtwork(cover) {
  if (!cover || typeof cover !== 'string') return []
  if (cover.startsWith('data:') || /^https?:\/\//.test(cover)) {
    return [{ src: cover, sizes: '512x512' }]
  }
  return []
}

function registerActions() {
  const deliver = (action) => {
    if (actionsCb) actionsCb(action)
  }
  /* handlers que o serviço de foreground responde (barra de notificação) */
  const map = {
    play: () => deliver({ action: 'play' }),
    pause: () => deliver({ action: 'pause' }),
    previoustrack: () => deliver({ action: 'previoustrack' }),
    nexttrack: () => deliver({ action: 'nexttrack' }),
    stop: () => deliver({ action: 'stop' }),
    seekto: (d) =>
      deliver({ action: 'seekto', seekTime: d && typeof d.seekTime === 'number' ? d.seekTime : 0 }),
    seekbackward: (d) =>
      deliver({
        action: 'seekbackward',
        seekOffset: d && typeof d.seekOffset === 'number' ? d.seekOffset : 10,
      }),
    seekforward: (d) =>
      deliver({
        action: 'seekforward',
        seekOffset: d && typeof d.seekOffset === 'number' ? d.seekOffset : 10,
      }),
  }
  Object.entries(map).forEach(([action, handler]) => {
    safe(() => CapgoMediaSession.setActionHandler({ action }, handler))
  })
}

export function hasMediaNotification() {
  return isNative()
}

export async function updateNowPlaying(state) {
  if (!isNative()) return
  await safe(() =>
    CapgoMediaSession.setMetadata({
      title: state?.title || '',
      artist: state?.artist || '',
      album: state?.album || '',
      artwork: toArtwork(state?.cover),
    }),
  )
  await safe(() =>
    CapgoMediaSession.setPlaybackState({
      playbackState: state?.playing ? 'playing' : 'paused',
    }),
  )
  const dur = state?.duration || 0
  if (dur > 0) {
    await safe(() =>
      CapgoMediaSession.setPositionState({
        duration: dur,
        position: Math.max(0, Math.min(state?.position || 0, dur)),
        playbackRate: state?.playbackRate || 1,
      }),
    )
  }
}

export async function hideNowPlaying() {
  if (!isNative()) return
  await safe(() => CapgoMediaSession.setPlaybackState({ playbackState: 'none' }))
  await safe(() => CapgoMediaSession.clearMetadata?.())
}

export function onMediaAction(cb) {
  actionsCb = cb
  if (!isNative()) return () => {}
  registerActions()
  return () => {
    actionsCb = null
  }
}
