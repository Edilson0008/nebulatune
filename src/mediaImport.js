import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeImport = registerPlugin('MediaImporter')
const isNative = () => Capacitor?.isNativePlatform?.() === true

export function hasNativeMediaImport() {
  return isNative()
}

export async function scanDeviceTracks() {
  if (!isNative()) return { available: false, tracks: [] }
  try {
    const out = await NativeImport.getTracks()
    const list = Array.isArray(out) ? out : out?.tracks || []
    return { available: true, tracks: list }
  } catch (e) {
    return { available: false, tracks: [], error: String(e?.message || e) }
  }
}

export async function importDeviceTrack(track) {
  if (!isNative()) throw new Error('indisponível')
  return NativeImport.importTrack({ id: track.id })
}