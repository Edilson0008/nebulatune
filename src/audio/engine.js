import { getContext, getInput } from './graph'

let ctx = null
let master = null
let current = null
let playingFlag = false
let activeNodes = []

function getCtx() {
  if (!ctx) {
    ctx = getContext()
    master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(getInput())
  }
  return ctx
}

const ROOTS = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440]
const SCALES = [
  [0, 3, 5, 7, 10, 12],
  [0, 2, 4, 7, 9, 12],
  [0, 2, 5, 7, 9, 12],
]
const BPM = [96, 108, 92, 124, 86, 112, 100, 118]

function freq(root, semitone) {
  return root * Math.pow(2, semitone / 12)
}

function playNote(dest, root, semis, t, dur, vol) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq(root, semis[0]), t)
  semis.forEach((s, i) => {
    if (i === 0) return
    osc.frequency.setValueAtTime(freq(root, s), t + (i * dur) / semis.length)
  })
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(vol, t + 0.03)
  gain.gain.setValueAtTime(vol, t + dur * 0.6)
  gain.gain.linearRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t)
  osc.stop(t + dur + 0.05)
  activeNodes.push(osc)
}

function playBass(dest, root, t, dur, vol) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = root / 2
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(vol, t + 0.02)
  gain.gain.setValueAtTime(vol, t + dur * 0.7)
  gain.gain.linearRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t)
  osc.stop(t + dur + 0.05)
  activeNodes.push(osc)
}

export function startTrack(index = 0, startBeat = 0) {
  const c = getCtx()
  if (c.state === 'suspended') c.resume()
  stopTrack()
  activeNodes = []

  const root = ROOTS[index % ROOTS.length]
  const scale = SCALES[index % 3]
  const beat = 60 / BPM[index % BPM.length]
  const totalBeats = 32
  const duration = totalBeats * beat
  const now = c.currentTime + 0.06

  const pattern = Array.from({ length: totalBeats }, (_, i) => {
    if (i % 8 === 0) return [scale[i % scale.length]]
    if (i % 4 === 2) return [scale[(i * 2) % scale.length]]
    if (i % 2 === 1) return []
    return [scale[(i + 5) % scale.length]]
  })

  for (let i = startBeat; i < totalBeats; i++) {
    const t = now + (i - startBeat) * beat
    const notes = pattern[i]
    if (notes.length) {
      playNote(master, root, notes, t, beat * 0.9, 0.14)
      playNote(master, root * 2, notes.slice(0, 1), t, beat * 0.4, 0.05)
    }
    playBass(master, root, t, beat * 0.9, 0.22)
  }

  current = {
    index,
    indexStart: now - startBeat * beat,
    duration,
    totalBeats,
    beat,
  }
  playingFlag = true
}

export function seek(seconds) {
  if (!current) return
  const startBeat = Math.min(
    current.totalBeats - 1,
    Math.max(0, Math.floor(seconds / current.beat)),
  )
  startTrack(current.index, startBeat)
}

export function stopTrack() {
  if (!ctx) return
  const t = ctx.currentTime
  activeNodes.forEach((n) => {
    try {
      n.stop(t)
    } catch {
      /* já parado */
    }
  })
  activeNodes = []
  current = null
  playingFlag = false
}

export function getElapsed() {
  if (!current || !ctx) return 0
  return Math.min(current.duration, Math.max(0, ctx.currentTime - current.indexStart))
}

export function getDuration() {
  return current ? current.duration : 0
}

export function getProgress() {
  const d = getDuration()
  return d ? getElapsed() / d : 0
}

export function isPlaying() {
  return playingFlag
}

export function pauseTrack() {
  if (!ctx || !current) return
  ctx.suspend()
  playingFlag = false
}

export function resumeTrack() {
  if (!ctx || !current) return
  ctx.resume()
  playingFlag = true
}

export function hasTrack() {
  return !!current
}

export function currentIndex() {
  return current ? current.index : 0
}

export function getIsPlaying() {
  return playingFlag
}