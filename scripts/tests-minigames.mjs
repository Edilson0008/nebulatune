// Regressão do bug dos "cactos invisíveis": o id do espinho é STRING e o
// ref o lia com Number() → NaN, então o espinho nunca era posicionado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { novoEspinhoId } from '../src/lib/espinho-id.js'

test('espinho: o id é string e continuaria quebrado com Number()', () => {
  for (let i = 0; i < 200; i += 1) {
    const id = novoEspinhoId()
    assert.equal(typeof id, 'string')
    assert.ok(id.length > 0)
    assert.ok(Number.isNaN(Number(id)), `id '${id}' não pode virar NaN-key por Number()`)
  }
})