// Testes do backup: as MÚSICAS viajam pelo arquivo; configurações, gatinho e
// playlists NÃO — esses passam pela conta (sincronização).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickRestorableTracks } from '../src/backup.js'

test('backup: aceita só backups do NebulaTune', () => {
  assert.equal(pickRestorableTracks(null), null)
  assert.equal(pickRestorableTracks({}), null)
  assert.equal(pickRestorableTracks({ app: 'Outro', tracks: [] }), null)
  assert.equal(pickRestorableTracks({ app: 'NebulaTune' }), null)
})

test('backup: restaura só as músicas que têm áudio; resto é ignorado', () => {
  const backup = {
    app: 'NebulaTune',
    type: 'backup-completo',
    tracks: [
      { id: 't1', title: 'Com Som', audioData: 'data:audio/mpeg;base64,QUFB' },
      { id: 't2', title: 'Sem Áudio', audioData: null },
      { id: 't3', title: 'Só Metadado', src: 'blob:x' },
      null,
    ],
  }
  const out = pickRestorableTracks(backup)
  assert.equal(out.length, 1)
  assert.equal(out[0].title, 'Com Som')
})

test('backup: arquivo novo (só músicas) também restaura as faixas', () => {
  const backup = {
    app: 'NebulaTune',
    type: 'backup-musicas',
    tracks: [{ id: 't1', title: 'A', audioData: 'data:audio/mpeg;base64,QUFB' }],
  }
  const out = pickRestorableTracks(backup)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 't1')
})