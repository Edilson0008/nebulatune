import { Capacitor, registerPlugin } from '@capacitor/core'

const MediaNotificationNative = registerPlugin('MediaNotification')

const isNative = () => Capacitor?.isNativePlatform?.() === true

export function hasMediaNotification() {
  return isNative()
}

export async function updateNowPlaying(state) {
  if (!isNative()) return
  try {
    await MediaNotificationNative.setNowPlaying(state)
  } catch (e) {
    console.warn('[mediaNotification] não consegui mostrar na barra', e)
  }
}

export async function hideNowPlaying() {
  if (!isNative()) return
  try {
    await MediaNotificationNative.hideNowPlaying()
  } catch (e) {
    console.warn('[mediaNotification] não consegui esconder', e)
  }
}

export function onMediaAction(cb) {
  if (!isNative()) return () => {}
  try {
    return MediaNotificationNative.addListener('mediaAction', (info) => cb(info))
  } catch (e) {
    console.warn('[mediaNotification] sem listener', e)
    return () => {}
  }
}
