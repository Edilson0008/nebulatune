import { Capacitor, registerPlugin } from '@capacitor/core'
import { APP_VERSION, SITE_URL } from './app-config'

const NativeUpdater = registerPlugin('AppUpdater')

export const APK_URL = SITE_URL ? `${SITE_URL}/apk/nebulatune.apk` : './apk/nebulatune.apk'

export function isNative() {
  return Capacitor?.isNativePlatform?.() === true
}

export async function fetchLatestVersion() {
  const base = SITE_URL || '.'
  const res = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('nao foi possivel verificar a versao')
  const data = await res.json()
  const version = String(data?.version || '').trim()
  if (!version) throw new Error('versao indisponivel')
  return version
}

export function isNewer(latest, current = APP_VERSION) {
  const toNumbers = (v) =>
    String(v || '')
      .split(/[^0-9]+/)
      .filter((part) => part !== '')
      .map((part) => parseInt(part, 10))
  const a = toNumbers(latest)
  const b = toNumbers(current)
  const len = Math.max(a.length, b.length, 1)
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

const PROMPTED_KEY = 'nt.updatePrompted'

export function wasUpdatePrompted(version) {
  try {
    return sessionStorage.getItem(PROMPTED_KEY) === String(version)
  } catch {
    return false
  }
}

export function markUpdatePrompted(version) {
  try {
    sessionStorage.setItem(PROMPTED_KEY, String(version))
  } catch {
    /* armazenamento indisponível */
  }
}

export async function installUpdate(url = APK_URL) {
  if (Capacitor?.getPlatform?.() === 'android') {
    await NativeUpdater.installApk({ url })
    return
  }
  const a = document.createElement('a')
  a.href = url
  a.download = 'NebulaTune.apk'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function requestNotificationsPermission() {
  if (Capacitor?.getPlatform?.() !== 'android') return
  try {
    await NativeUpdater.requestNotificationsPermission()
  } catch {
    /* usuário negou ou plataforma sem suporte */
  }
}

export async function notifyUpdateAvailable(latest) {
  if (Capacitor?.getPlatform?.() !== 'android') return
  try {
    if (!wasUpdatePrompted(latest)) {
      markUpdatePrompted(latest)
    }
    await NativeUpdater.notifyUpdate({
      title: 'NebulaTune ' + latest,
      body: 'Atualização disponível! Toque para atualizar o app.',
      tag: 'update',
    })
  } catch {
    /* sem permissão ou dispositivo bloqueado */
  }
}
