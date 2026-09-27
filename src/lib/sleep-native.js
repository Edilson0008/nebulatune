import { IS_NATIVE } from './env.js'

export function sleepNativeStart(timestampMs) {
  try {
    if (IS_NATIVE && window.Capacitor?.Plugins?.SleepTimer) {
      window.Capacitor.Plugins.SleepTimer.start({ timestamp: timestampMs })
    }
  } catch {}
}

export function sleepNativeCancel() {
  try {
    if (IS_NATIVE && window.Capacitor?.Plugins?.SleepTimer) {
      window.Capacitor.Plugins.SleepTimer.cancel()
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.__nebulaSleepPause = () => {
    window.dispatchEvent(new CustomEvent('nebulatune:sleepfire'))
  }
}
