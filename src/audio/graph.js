let ctx = null
let input = null
let master = null
let comp = null
let analyser = null
let pending = null
const bands = []
const mediaSources = new WeakMap()

let depthMode = ''
let panner = null
let depthRaf = 0
let spinStart = 0

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const BAND_COUNT = EQ_FREQS.length

function buildGraph() {
  ctx = new (window.AudioContext || window.webkitAudioContext)()

  input = ctx.createGain()
  input.gain.value = 1

  for (let i = 0; i < BAND_COUNT; i += 1) {
    const b = ctx.createBiquadFilter()
    b.type = 'peaking'
    b.frequency.value = EQ_FREQS[i]
    b.Q.value = 1.1
    b.gain.value = 0
    bands.push(b)
  }
  input.connect(bands[0])
  bands.forEach((b, i) => {
    if (i > 0) bands[i - 1].connect(b)
  })

  master = ctx.createGain()
  master.gain.value = 1
  bands[bands.length - 1].connect(master)

  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 8
  comp.ratio.value = 4
  comp.attack.value = 0.003
  comp.release.value = 0.25
  master.connect(comp)

  analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.82
  comp.connect(analyser)
  analyser.connect(ctx.destination)
}

function applyNow(s) {
  const t = ctx.currentTime
  const enabled = !!s.enabled

  bands.forEach((b, i) => {
    const v = enabled ? s.bands?.[i] || 0 : 0
    b.gain.cancelScheduledValues(t)
    b.gain.setValueAtTime(b.gain.value, t)
    b.gain.linearRampToValueAtTime(v, t + 0.06)
  })

  if (s.volume != null) {
    master.gain.cancelScheduledValues(t)
    master.gain.setValueAtTime(master.gain.value, t)
    master.gain.linearRampToValueAtTime(s.volume, t + 0.06)
  }
}

export function getContext() {
  if (!ctx) {
    buildGraph()
    const s = pending
    pending = null
    if (s) applyNow(s)
  }
  return ctx
}

export function getInput() {
  getContext()
  return input
}

export function resumeContext() {
  const c = getContext()
  if (c && c.state === 'suspended') return c.resume()
  return Promise.resolve()
}

export function getAnalyser() {
  return ctx ? analyser : null
}

export function registerMediaElement(el) {
  if (mediaSources.has(el)) return mediaSources.get(el)
  try {
    const c = getContext()
    const src = c.createMediaElementSource(el)
    src.connect(input)
    mediaSources.set(el, src)
    return src
  } catch {
    return null
  }
}

export function applySettings(s = {}) {
  pending = s
  if (!ctx) return
  applyNow(s)
}

function ensureDepthChain() {
  if (panner || !master || !comp) return
  const c = getContext()
  panner = c.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.rolloffFactor = 0.05
  panner.maxDistance = 10000
  master.disconnect(comp)
  master.connect(panner)
  panner.connect(comp)
}

function spinFrame(ts) {
  if (!depthMode || !panner || !ctx) {
    depthRaf = 0
    return
  }
  if (!spinStart) spinStart = ts
  const t = (ts - spinStart) / 1000
  const speed = depthMode === '8d' ? 1.6 : 0.55
  const radius = depthMode === '8d' ? 2.4 : 1.8
  const ang = t * speed
  panner.positionX.value = radius * Math.cos(ang)
  panner.positionY.value = depthMode === '3d' ? 0.5 * Math.sin(ang * 0.5) : 0
  panner.positionZ.value = radius * Math.sin(ang)
  depthRaf = requestAnimationFrame(spinFrame)
}

export function setDepth(mode = '') {
  depthMode = mode === '3d' || mode === '8d' ? mode : ''
  if (depthMode) {
    ensureDepthChain()
    if (panner && ctx) {
      const t = ctx.currentTime
      panner.positionX.setTargetAtTime(0, t, 0.05)
      panner.positionY.setTargetAtTime(0, t, 0.05)
      panner.positionZ.setTargetAtTime(0, t, 0.05)
    }
    spinStart = performance.now()
    if (!depthRaf) depthRaf = requestAnimationFrame(spinFrame)
  } else if (panner && ctx) {
    const t = ctx.currentTime
    panner.positionX.setTargetAtTime(0, t, 0.05)
    panner.positionY.setTargetAtTime(0, t, 0.05)
    panner.positionZ.setTargetAtTime(0, t, 0.05)
    if (depthRaf) {
      cancelAnimationFrame(depthRaf)
      depthRaf = 0
    }
  }
}

export function getDepth() {
  return depthMode
}