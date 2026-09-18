import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeImport = registerPlugin('MediaImporter')
const isNative = () => Capacitor?.isNativePlatform?.() === true

export function hasNativeMediaImport() {
  return isNative()
}

export async function scanDeviceTracks() {
  if (!isNative()) return { available: false, tracks: [] }
  try {
    return { available: true, tracks: await NativeImport.getTracks() }
  } catch (e) {
    return { available: false, tracks: [], error: String(e?.message || e) }
  }
}

export async function importDeviceTrack(track) {
  if (!isNative()) throw new Error('indisponível')
  return NativeImport.importTrack({ id: track.id })
}