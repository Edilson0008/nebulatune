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

let artCache = null
async function toArtwork(cover) {
  if (!cover || typeof cover !== 'string') return []
  if (artCache && artCache.key === cover) return artCache.value
  let value = []
  if (cover.startsWith('data:') || /^https?:\/\//.test(cover)) {
    value = [{ src: cover, sizes: '512x512' }]
  } else if (cover.startsWith('blob:')) {
    try {
      const blob = await fetch(cover).then((r) => r.blob())
      const dataUrl = await new Promise((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result)
        fr.onerror = () => resolve(null)
        fr.readAsDataURL(blob)
      })
      value = dataUrl ? [{ src: dataUrl, sizes: '512x512' }] : []
    } catch {
      value = []
    }
  }
  artCache = { key: cover, value }
  return value
}

let fallbackArtPromise = null
function fallbackArtwork() {
  if (!fallbackArtPromise) {
    fallbackArtPromise = fetch('./icons/icon-512.png')
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise((resolve) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result)
            fr.onerror = () => resolve(null)
            fr.readAsDataURL(blob)
          }),
      )
      .catch(() => null)
  }
  return fallbackArtPromise
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

  /* 1) METADATA SEMPRE — título/artista/capa vão juntos na 1ª chamada, sem depender de duração.
        (O Android só acha "faixa ativa" quando há posição; sem ela, some até o título.) */
  let artwork = await toArtwork(state?.cover)
  if (!artwork.length) {
    const icon = await fallbackArtwork()
    if (icon) artwork = [{ src: icon, sizes: '512x512' }]
  }
  await safe(() =>
    CapgoMediaSession.setMetadata({
      title: state?.title || '',
      artist: state?.artist || '',
      album: state?.album || '',
      artwork,
    }),
  )
  await safe(() =>
    CapgoMediaSession.setPlaybackState({
      playbackState: state?.playing ? 'playing' : 'paused',
    }),
  )

  /* 2) POSIÇÃO: envia na hora se já houver duração; se ainda está carregando (troca de faixa),
        REENVIA até a duração chegar — é o que faz o tempo e os botões "acordarem" sozinhos. */
  const sendPos = () => {
    const dur = Number(state?.duration) || 0
    if (dur <= 0) return false
    safe(() =>
      CapgoMediaSession.setPositionState({
        duration: dur,
        position: Math.max(0, Math.min(Number(state?.position) || 0, dur)),
        playbackRate: Number(state?.playbackRate) || 1,
      }),
    )
    return true
  }
  if (!sendPos()) {
    /* duração chega 100-600ms depois da troca: espera e reenvia até 5s */
    let tries = 0
    const iv = window.setInterval(() => {
      tries += 1
      if (sendPos() || tries >= 12) window.clearInterval(iv)
    }, 400)
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
