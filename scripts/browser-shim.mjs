// Mínimo de navegador para o React montar o app fora do navegador.
// Só o que os componentes tocam ao renderizar (canvas, localStorage, etc.).
const noop = () => {}
const elemento = () => ({
  style: { setProperty: noop, removeProperty: noop },
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop,
  removeChild: noop,
  setAttribute: noop,
  getAttribute: () => null,
  addEventListener: noop,
  removeEventListener: noop,
  getContext: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  focus: noop,
  click: noop,
  children: [],
  textContent: '',
})

export default function shim() {
  globalThis.window = globalThis
  globalThis.document = {
    createElement: elemento,
    createElementNS: elemento,
    body: elemento(),
    head: elemento(),
    documentElement: elemento(),
    getElementById: () => elemento(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    visibilityState: 'visible',
    hidden: false,
  }
  try {
    if (!globalThis.navigator) globalThis.navigator = {}
  } catch {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'node' },
      configurable: true,
    })
  }
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop }
  globalThis.sessionStorage = globalThis.localStorage
  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
  })
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16)
  globalThis.cancelAnimationFrame = clearTimeout
  globalThis.performance = globalThis.performance || { now: () => Date.now() }
  globalThis.AudioContext = function AudioContext() {
    return { createAnalyser: () => null, resume: noop, close: noop, destination: null, sampleRate: 44100 }
  }
  globalThis.webkitAudioContext = globalThis.AudioContext
  globalThis.indexedDB = undefined
  globalThis.caches = undefined
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), clone: () => ({}) })
  globalThis.MediaSession = undefined
  globalThis.Notification = function Notification() {
    return { requestPermission: async () => 'denied' }
  }
  globalThis.speechSynthesis = { speak: noop, cancel: noop, getVoices: () => [] }
  globalThis.Image = function Image() {}
  globalThis.HTMLCanvasElement = elemento
  globalThis.FileReader = function FileReader() {
    return { readAsDataURL: noop, addEventListener: noop, result: null }
  }
  if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:x'
  if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = noop
}
