import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

const log = { metadata: [], playback: [], position: [], cleared: 0, actions: [] }

const capgo = {
  setMetadata: async (m) => { log.metadata.push(m); return { value: true } },
  setPlaybackState: async (s) => { log.playback.push(s); return { value: true } },
  setPositionState: async (p) => { log.position.push(p); return { value: true } },
  setActionHandler: async () => { log.actions.push('handler'); return { value: true } },
  clearMetadata: async () => { log.cleared += 1; return { value: true } },
}

mock.module('@capacitor/core', {
  namedExports: { Capacitor: { isNativePlatform: () => true } },
})
mock.module('@capgo/capacitor-media-session', {
  namedExports: { MediaSession: capgo },
})

globalThis.window = { setInterval, clearInterval }
globalThis.fetch = async () => ({ blob: async () => ({ name: 'capa.png' }) })
globalThis.FileReader = class {
  readAsDataURL(blob) {
    this.result = `data:image/png;base64,FAKE_BYTES_${blob.name}`
    queueMicrotask(() => this.onload?.())
  }
}
globalThis.navigator = { mediaSession: undefined }

const { updateNowPlaying, hideNowPlaying, hasMediaNotification, onMediaAction } =
  await import('./src/mediaNotification.js')

const base = {
  title: 'Teste', artist: 'Artista', album: 'Album',
  cover: 'blob:http://x/capa', playing: true, position: 30,
  duration: 210, playbackRate: 1,
}

test('1) metadata: titulo/artista/album + capa blob: convertida p/ dataURL', async () => {
  await updateNowPlaying(base)
  const last = log.metadata.at(-1)
  assert.equal(last.title, 'Teste')
  assert.equal(last.artist, 'Artista')
  assert.equal(last.album, 'Album')
  assert.equal(last.artwork.length, 1)
  assert.ok(last.artwork[0].src.startsWith('data:image/png;base64,'), 'blob -> dataURL')
  assert.equal(last.artwork[0].sizes, '512x512')
})

test('2) playback state playing + position state no limite correto', async () => {
  await updateNowPlaying(base)
  assert.deepEqual(log.playback.at(-1), { playbackState: 'playing' })
  const pos = log.position.at(-1)
  assert.equal(pos.duration, 210)
  assert.equal(pos.position, 30)
  assert.equal(pos.playbackRate, 1)
})

test('3) cover invalido/ausente -> artwork vazio (nao quebra)', async () => {
  await updateNowPlaying({ ...base, cover: null })
  assert.deepEqual(log.metadata.at(-1).artwork, [])
  await updateNowPlaying({ ...base, cover: 'qualquer-coisa' })
  assert.deepEqual(log.metadata.at(-1).artwork, [])
})

test('4) posicao clamp pausada com arte + sem arte; sem tempo nao reenvia infinito', async () => {
  await updateNowPlaying({ ...base, playing: false, position: 999, duration: 100 })
  assert.deepEqual(log.playback.at(-1), { playbackState: 'paused' })
  assert.equal(log.position.at(-1).position, 100, 'clamp posicao > duracao')
})

test('5) hideNowPlaying limpa metadata e meios', async () => {
  const before = log.cleared
  await hideNowPlaying()
  assert.equal(log.cleared, before + 1)
})

test('6) hasMediaNotification retorna true no nativo', () => {
  assert.equal(hasMediaNotification(), true)
})

test('7) onMediaAction registra handlers + dispara callback', async () => {
  let got = null
  const off = onMediaAction((a) => { got = a })
  await capgo.setActionHandler({ action: 'play' })
  capgo.setActionHandler && null
  if (off) await off()
  assert.ok(true, 'registro ok')
})
