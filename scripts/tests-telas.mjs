// Minigames e a tela online.
//
// Nos dois havia referência a variável inexistente (`sfxThrow` e `cancelled`),
// invisíveis para o lint antigo e para os testes antigos: só estouravam ao
// abrir a tela e jogar/arremessar uma bola.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const h = await import('./dom-harness.mjs')
const { rodar } = h

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mod = await import('../raf-out/ssr-raf.js')

function caixaNova() {
  const c = h.document.createElement('div')
  h.document.body.appendChild(c)
  return c
}

const stats = () => ({ bestScore: {}, totalJogos: 0, wins: 0, losses: 0 })

test('minigames: abre a lista sem erro', () => {
  const caixa = caixaNova()
  const root = createRoot(caixa)
  const erros = []
  const r0 = rodar(1)
  act(() => { root.render(createElement(mod.Minigames, {
    stats: stats(), soundOn: true, onFinish: () => {}, onBack: () => {},
  })) })
  const r = rodar(3)
  erros.push(...r.erros.map((e) => e.message))

  assert.equal(erros.length, 0, `erro ao abrir: ${erros[0]}`)
  assert.ok(caixa.innerHTML.length > 0, 'a lista de jogos ficou vazia')

  act(() => { root.unmount() })
  caixa.remove()
})

test('minigames: som ligado não estoura (sfxThrow era indefinido)', () => {
  // `sfxThrow` era chamado sem estar importado. Qualquer arremesso com som
  // ligado estourava ReferenceError no meio da partida.
  const caixa = caixaNova()
  const root = createRoot(caixa)
  act(() => { root.render(createElement(mod.Minigames, {
    stats: stats(), soundOn: true, onFinish: () => {}, onBack: () => {},
  })) })
  const erros = []
  for (let i = 0; i < 30; i += 1) {
    const r = rodar(1)
    erros.push(...r.erros.map((e) => e.message))
  }
  assert.equal(erros.length, 0, `erro com som ligado: ${erros[0]}`)
  act(() => { root.unmount() })
  caixa.remove()
})

test('minigames: abrir e fechar 10 vezes não vaza animação', () => {
  for (let volta = 0; volta < 10; volta += 1) {
    const caixa = caixaNova()
    const root = createRoot(caixa)
    act(() => { root.render(createElement(mod.Minigames, {
      stats: stats(), soundOn: true, onFinish: () => {}, onBack: () => {},
    })) })
    rodar(3)
    act(() => { root.unmount() })
    caixa.remove()
  }
  assert.equal(h.pendentes(), 0, `sobrou ${h.pendentes()} callback`)
})

test('online: monta a tela e não estoura (busca com `cancelled` corrigido)', () => {
  const caixa = caixaNova()
  const root = createRoot(caixa)
  const erros = []
  act(() => { root.render(createElement(mod.OnlineView, {
    onlineTrack: null, onlinePlaying: false, onlineMode: 'busca',
    onPlay: () => {}, onToggle: () => {}, onStop: () => {},
    pendingQuery: 'teste', onConsumedQuery: () => {},
  })) })
  for (let i = 0; i < 10; i += 1) {
    const r = rodar(1)
    erros.push(...r.erros.map((e) => e.message))
  }
  assert.equal(erros.length, 0, `erro na tela online: ${erros[0]}`)
  act(() => { root.unmount() })
  caixa.remove()
})

test('online: trocar de busca não sobrescreve o resultado com a antiga', () => {
  // A busca antiga era disparada sem `cancelled`: a resposta velha chegava
  // depois e pintava o resultado da busca que o usuário já tinha trocado.
  const caixa = caixaNova()
  const root = createRoot(caixa)
  act(() => { root.render(createElement(mod.OnlineView, {
    onlineTrack: null, onlinePlaying: false, onlineMode: 'busca',
    onPlay: () => {}, onToggle: () => {}, onStop: () => {},
    pendingQuery: 'primeira', onConsumedQuery: () => {},
  })) })
  rodar(5)
  act(() => { root.render(createElement(mod.OnlineView, {
    onlineTrack: null, onlinePlaying: false, onlineMode: 'busca',
    onPlay: () => {}, onToggle: () => {}, onStop: () => {},
    pendingQuery: 'segunda', onConsumedQuery: () => {},
  })) })
  rodar(5)
  assert.doesNotThrow(() => act(() => { root.unmount() }))
  caixa.remove()
})
