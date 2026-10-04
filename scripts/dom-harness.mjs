// Harness de teste com DOM de verdade (linkedom) e requestAnimationFrame
// CONTROLADO. O ponto central: contar quantos callbacks de animacao ficam
// pendentes depois de cada quadro.
//
// Se um loop agenda duas vezes por callback, a fila dobra a cada quadro
// (1 -> 2 -> 4 -> 8). Nos testes isso aparece como "pendentes" crescendo sem
// parar. E como o id sobrescrito impede cancelar o orfao, o numero sobe
// mesmo depois do unmount.
import { parseHTML } from 'linkedom'

const { window, document } = parseHTML(
  '<!doctype html><html><body><div id="raiz"></div></body></html>',
)

// --- requestAnimationFrame controlavel -------------------------------
let fila = []
let proximoId = 1
let hora = 0

globalThis.requestAnimationFrame = (fn) => {
  const id = proximoId++
  fila.push({ id, fn })
  return id
}
globalThis.cancelAnimationFrame = (id) => {
  fila = fila.filter((x) => x.id !== id)
}

export const pendentes = () => fila.length

// Roda UM quadro: esvazia a fila e executa o que estava nela. O que for
// agendado durante a execucao fica para o proximo quadro.
export function quadro(avancarMs = 16) {
  hora += avancarMs
  const atual = fila
  fila = []
  const erros = []
  for (const { fn } of atual) {
    try {
      fn(hora)
    } catch (e) {
      erros.push(e)
    }
  }
  return { executados: atual.length, pendentes: fila.length, erros }
}

export function rodar(quadros, avancarMs = 16) {
  const erros = []
  let ultimo = { executados: 0, pendentes: 0 }
  for (let i = 0; i < quadros; i++) {
    ultimo = quadro(avancarMs)
    if (ultimo.erros.length) erros.push(...ultimo.erros)
  }
  return { ...ultimo, erros }
}

// --- canvas 2D falso que CONTA chamadas ------------------------------
export const contadorCanvas = { limpar: 0, arc: 0, fill: 0, gradientes: 0 }
const ctx2d = {
  setTransform: () => {},
  clearRect: () => { contadorCanvas.limpar++ },
  beginPath: () => {},
  arc: () => { contadorCanvas.arc++ },
  fill: () => { contadorCanvas.fill++ },
  fillRect: () => {},
  strokeRect: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fillText: () => {},
  save: () => {},
  restore: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  drawImage: () => {},
  closePath: () => {},
  createLinearGradient: () => { contadorCanvas.gradientes++; return { addColorStop: () => {} } },
  createRadialGradient: () => ({ addColorStop: () => {} }),
  measureText: () => ({ width: 10 }),
  globalAlpha: 1,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: '',
  textBaseline: '',
  globalCompositeOperation: '',
  filter: 'none',
}

const elementoBase = () => ({
  style: { setProperty: () => {}, removeProperty: () => {} },
  dataset: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  appendChild: () => {},
  removeChild: () => {},
  setAttribute: () => {},
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  getContext: () => ctx2d,
  querySelector: () => null,
  querySelectorAll: () => [],
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 700, right: 390, bottom: 700 }),
  focus: () => {},
  click: () => {},
  scrollTo: () => {},
  scrollIntoView: () => {},
  children: [],
  textContent: '',
  clientWidth: 390,
  clientHeight: 700,
  width: 390,
  height: 700,
})

// O linkedom cria os elementos de verdade; a gente so completa o que falta.
const completar = (el) => {
  if (!el || el.__completo) return el
  try { Object.defineProperty(el, '__completo', { value: true, enumerable: false }) } catch { return el }
  if (!el.style) el.style = elementoBase().style
  if (!el.classList) el.classList = elementoBase().classList
  if (!el.getBoundingClientRect) el.getBoundingClientRect = elementoBase().getBoundingClientRect
  if (!el.getContext) el.getContext = () => ctx2d
  if (typeof el.addEventListener !== 'function') el.addEventListener = () => {}
  if (typeof el.removeEventListener !== 'function') el.removeEventListener = () => {}
  if (typeof el.appendChild !== 'function') el.appendChild = () => {}
  if (typeof el.setPointerCapture !== 'function') el.setPointerCapture = () => {}
  if (typeof el.scrollTo !== 'function') el.scrollTo = () => {}
  if (typeof el.scrollIntoView !== 'function') el.scrollIntoView = () => {}
  if (typeof el.focus !== 'function') el.focus = () => {}
  return el
}

globalThis.window = window
globalThis.document = document
window.requestAnimationFrame = globalThis.requestAnimationFrame
window.cancelAnimationFrame = globalThis.cancelAnimationFrame
window.devicePixelRatio = 2
window.innerWidth = 390
window.innerHeight = 700
window.scrollTo = () => {}
window.HTMLCanvasElement = window.HTMLCanvasElement || class {}

const origCreate = document.createElement.bind(document)
document.createElement = (tag, ...resto) => {
  const el = origCreate(tag, ...resto)
  completar(el)
  if (tag !== 'canvas') return el
  // O linkedom TEM getContext, mas devolve null: sobrescreve de fora para o
  // loop de desenho realmente rodar (senao o efeito aborta no `if (!ctx)`).
  el.getContext = () => ctx2d
  el.getBoundingClientRect = elementoBase().getBoundingClientRect
  return el
}

globalThis.HTMLCanvasElement = window.HTMLCanvasElement
// Event/Blob/URL: o player e a tela online usam window.dispatchEvent(new Event)
// e new Blob() para simular faixa.
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
if (!globalThis.Blob) globalThis.Blob = class Blob { constructor(p = []) { this.size = 8; this.type = '' } }
window.Blob = globalThis.Blob
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.HTMLElement = window.HTMLElement
// Node 22 define navigator como getter only: usa defineProperty.
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node', mediaDevices: { getUserMedia: async () => null } },
    configurable: true,
  })
}
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }
globalThis.sessionStorage = globalThis.localStorage
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
// Tempo deterministico: o throttle dos canvas usa performance.now(). Se usar o
// relogio real, o teste roda em milissegundos e nada e desenhado, o que
// esconde a taxa de quadros real.
if (!globalThis.__tempoSimulado) {
  Object.defineProperty(globalThis.performance, 'now', {
    value: () => hora,
    configurable: true,
    writable: true,
  })
}
// Nó de áudio genérico: qualquer AudioParam que o grafo tentar usar existe,
// então o `buildGraph` roda inteiro sem precisar saber de antemão quais nós o
// app usa. Sem isso, faltava `createDynamicsCompressor` e o equalizador nem
// montava — falha do harness, não do app.
const param = (v = 0) => ({
  value: v,
  setValueAtTime: () => {},
  linearRampToValueAtTime: () => {},
  exponentialRampToValueAtTime: () => {},
  setTargetAtTime: () => {},
  cancelScheduledValues: () => {},
})

const noAudio = () => new Proxy({
  connect: () => {},
  disconnect: () => {},
  start: () => {},
  stop: () => {},
  getChannelData: () => new Float32Array(1),
  getByteFrequencyData: () => {},
  frequencyBinCount: 512,
  fftSize: 2048,
  frequency: param(0),
  Q: param(1),
  type: '',
  gain: param(1),
  threshold: param(-24),
  knee: param(30),
  ratio: param(12),
  attack: param(0.003),
  release: param(0.25),
  detune: param(0),
  playbackRate: param(1),
}, {
  get(alvo, chave) {
    if (chave in alvo) return alvo[chave]
    // Qualquer outro nome vira um AudioParam, para o app poder escrever
    // `no.foo.value = 1` sem o harness explodir.
    return param(0)
  },
  set(alvo, chave, valor) { alvo[chave] = valor; return true },
})

globalThis.AudioContext = function () {
  return {
    createAnalyser: noAudio,
    createGain: noAudio,
    createOscillator: noAudio,
    createBiquadFilter: noAudio,
    createDynamicsCompressor: noAudio,
    createMediaElementSource: noAudio,
    createBufferSource: noAudio,
    createBuffer: noAudio,
    createChannelMerger: noAudio,
    createChannelSplitter: noAudio,
    createStereoPanner: noAudio,
    createDelay: noAudio,
    createConvolver: noAudio,
    destination: noAudio(),
    sampleRate: 44100,
    currentTime: 0,
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    state: 'running',
  }
}
globalThis.webkitAudioContext = globalThis.AudioContext
globalThis.OfflineAudioContext = globalThis.AudioContext

// O `TrackList` procura quem esta rolando para poder acrescentar mais linhas.
// No navegador isso vem de `getComputedStyle`; aqui ele responde `auto` para
// qualquer elemento e quem tem `scrollHeight > clientHeight` vale como rolagem.
globalThis.getComputedStyle = () => ({ overflowY: 'auto', overflowX: 'auto' })

export { window, document, ctx2d }
// --- elemento <audio> falso ---------------------------------------------
// O player cria `new Audio()` e depende de src/play/pause/currentTime/
// duration/playbackRate/readyState/paused/ended e dos eventos. O contador
// `tocar` e `tocarFalhou` deixa o teste ver quantas vezes o play foi pedido
// (inclusive as retentativas, que é onde mora o bug de "travou ao tocar").
export const audio = { tocar: 0, tocarFalhou: 0, criado: 0 }

class AudioFalso {
  constructor() {
    audio.criado += 1
    this.src = ''
    this.currentTime = 0
    this.duration = NaN
    this.paused = true
    this.ended = false
    this.preload = ''
    this.playbackRate = 1
    this.readyState = 4
    this.listeners = {}
  }

  addEventListener(tipo, fn) {
    ;(this.listeners[tipo] ||= []).push(fn)
  }

  removeEventListener(tipo, fn) {
    this.listeners[tipo] = (this.listeners[tipo] || []).filter((x) => x !== fn)
  }

  disparar(tipo) {
    for (const fn of [...(this.listeners[tipo] || [])]) fn({ type: tipo })
  }

  // play() devolve Promise no navegador; o player tem retentativa com
  // backoff, então é preciso poder simular sucesso e recusa.
  play() {
    audio.tocar += 1
    if (this._deveFalhar) {
      audio.tocarFalhou += 1
      return Promise.reject(new Error('NotAllowedError'))
    }
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }

  load() {}
}

globalThis.Audio = AudioFalso
window.Audio = AudioFalso

// Deixa o proximo play() recusar, para testar a retentativa.
export function falharProximoPlay() {
  AudioFalso.prototype._deveFalhar = true
}

// Deixa o play passar de novo (usado depois de simular uma recusa).
export function permitirPlay() {
  AudioFalso.prototype._deveFalhar = false
}

export function resetAudio() {
  audio.tocar = 0
  audio.tocarFalhou = 0
  audio.criado = 0
  AudioFalso.prototype._deveFalhar = false
}
