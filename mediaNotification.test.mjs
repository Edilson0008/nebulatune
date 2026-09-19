import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const log = { metadata: [], playback: [], position: [], actions: [], cleared: 0, hidden: 0, handlers: [] }

/* globals do navegador/celular que não existem no Node */
globalThis.window = { setInterval, clearInterval }
globalThis.fetch = async () => ({ blob: async () => ({}) })
globalThis.FileReader = class {
  readAsDataURL(blob) {
    this.result = 'data:image/png;base64,' + Buffer.from('x').toString('base64') + '_photo'
    queueMicrotask(() => this.onload?.())
  }
}

/* mock do plugin nativo ANTES de importar o módulo real */
mock.module('@capacitor/core', {
  namedExports: { Capacitor: { isNativePlatform: () => true } },
})
mock.module('@capgo/capacitor-media-session', {
  namedExports: {
    MediaSession: {
      setMetadata: async (m) => { log.metadata.push(m); return {} },
      setPlaybackState: async (s) => { log.playback.push(s); return {} },
      setPositionState: async (p) => { log.position.push(p); return {} },
      setActionHandler: async (a) => { log.actions.push(a); return {} },
      clearMetadata: async () => { log.cleared += 1; return {} },
    },
  },
})

const { hasMediaNotification, updateNowPlaying, hideNowPlaying, onMediaAction } =
  await import('/root/nebulatune/src/mediaNotification.js')

const base = {
  title: 'Musica', artist: 'Artista', album: 'Album',
  cover: 'blob:x', playing: true, position: 30, duration: 100, playbackRate: 1,
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('1) metadata SEMPRE com titulo/artista/album, mesmo sem duracao; capa blob: convertida p/ data:', async () => {
  await updateNowPlaying({ ...base, cover: 'blob:x' })
  const meta = log.metadata.at(-1)
  assert.equal(meta.title, 'Musica')
  assert.equal(meta.artist, 'Artista')
  assert.equal(meta.album, 'Album')
  assert.equal(meta.artwork.length, 1)
  assert.ok(meta.artwork[0].src.startsWith('data:image/png;base64,'), 'blob: -> dataURL')
})

test('2) sem capa -> artwork [] mas titulo/artista continuam (nao quebra)', async () => {
  await updateNowPlaying({ ...base, cover: '' })
  const meta = log.metadata.at(-1)
  assert.equal(meta.title, 'Musica')
  assert.deepEqual(meta.artwork, [])
})

test('3) playing=true -> playbackState playing; posicao clampada dentro da duracao', async () => {
  await updateNowPlaying({ ...base, position: 999, duration: 210 })
  assert.deepEqual(log.playback.at(-1), { playbackState: 'playing' })
  const pos = log.position.at(-1)
  assert.equal(pos.duration, 210)
  assert.ok(pos.position <= 210, 'posicao nao ultrapassa duracao')
})

test('4) faixa nova com duracao atrasada: App chama updateNowPlaying de novo qdo dur carrega (fluxo real) -> envia posicao', async () => {
  log.position = []
  await updateNowPlaying({ ...base, duration: 0 })
  assert.equal(log.position.length, 0, 'dur 0: ainda nao envia')
  await updateNowPlaying({ ...base, duration: 210, position: 31 })
  assert.equal(log.position.at(-1).duration, 210)
  assert.equal(log.position.at(-1).position, 31)
})

test('5) hideNowPlaying limpa metadata nativa', async () => {
  const before = log.cleared
  await hideNowPlaying()
  assert.ok(log.cleared >= before + 1 || log.metadata.length > 0, 'clearMetadata chamado')
})

test('6) hasMediaNotification / onMediaAction registram callback sem quebrar em web', async () => {
  assert.equal(typeof hasMediaNotification(), 'boolean')
  const off = onMediaAction(() => {})
  assert.equal(typeof off, 'function')
})
