// Equalizador, visualizador e vazamento de memória.
//
// O vazamento é o caminho mais curto para o "trava": um listener ou intervalo
// que não é removido no unmount continua rodando enquanto o usuário navega
// entre telas. Encerrar o Habitat dez vezes deixaria dez relógios ativos.
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

const eqFalso = () => ({
  settings: { preampDb: 0, volume: 0.8, bands: new Array(10).fill(0), preset: 'flat', enabled: true },
  setBand: () => {}, setVolume: () => {}, setPreampDb: () => {},
  applyPreset: () => {}, toggle: () => {}, reset: () => {},
})

test('equalizador: monta as 10 bandas sem erro', () => {
  const caixa = caixaNova()
  const root = createRoot(caixa)
  act(() => { root.render(createElement(mod.Equalizer, { eq: eqFalso() })) })

  const html = caixa.innerHTML
  assert.ok(html.includes('Equalizador'), 'não achou o título do equalizador')
  assert.ok(html.includes('eq'), 'não achou o container .eq')

  act(() => { root.unmount() })
  caixa.remove()
})

test('equalizador: abrir e fechar 10 vezes não deixa animação pendurada', () => {
  // É assim que o usuário usa: abre a tela, volta, abre de novo. Se o
  // unmount não limpar o rAF, a fila cresce a cada abertura.
  for (let volta = 0; volta < 10; volta += 1) {
    const caixa = caixaNova()
    const root = createRoot(caixa)
    act(() => { root.render(createElement(mod.Equalizer, { eq: eqFalso() })) })
    rodar(3)
    act(() => { root.unmount() })
    caixa.remove()
  }
  assert.equal(h.pendentes(), 0, `sobrou ${h.pendentes()} callback depois de 10 aberturas`)
})

test('visualizador: roda 300 quadros e para no unmount', () => {
  const caixa = caixaNova()
  const root = createRoot(caixa)
  act(() => { root.render(createElement(mod.Visualizer, null)) })

  rodar(2)
  const estavel = h.pendentes()
  for (let i = 0; i < 300; i += 1) rodar(1)
  assert.ok(h.pendentes() <= estavel + 1, 'a fila de animação cresceu')

  act(() => { root.unmount() })
  rodar(3)
  assert.equal(h.pendentes(), 0, 'o visualizador deixou rAF rodando após sair')
  caixa.remove()
})

test('agora-tocando: abrir e fechar 10 vezes não deixa nada pendurado', () => {
  const faixa = { id: 't', title: 'M', artist: 'A', album: 'B', duration: 200, cover: [] }
  const props = {
    track: faixa, onClose: () => {}, onToggle: () => {}, onSeek: () => {}, playing: true,
    lyrics: null, syncOffset: 0, onSearchLyrics: () => {}, onPickLyrics: () => {},
    eq: false, fav: false, onToggleFavorite: () => {}, onOpenQueue: () => {},
    speed: 1, onSetSpeed: () => {}, depth: '', onSetDepth: () => {},
    isOnline: false, sleepMode: null, sleepRemaining: null,
    onStartSleep: () => {}, onCancelSleep: () => {},
    eqEnabled: false, eqPreset: 'flat', favPing: 0, trackId: 't',
    soundOn: true, cheer: null, idleSinceRef: null, onPetAction: null,
    mood: 'neutral', userName: 'T',
  }

  for (let volta = 0; volta < 10; volta += 1) {
    const caixa = caixaNova()
    const root = createRoot(caixa)
    act(() => {
      root.render(createElement(mod.NowPlaying, props))
    })
    rodar(3)
    act(() => { root.unmount() })
    caixa.remove()
  }
  assert.equal(h.pendentes(), 0, `sobrou ${h.pendentes()} callback depois de 10 aberturas`)
})

test('habitat: trocar de cena 10 vezes não acumula animação nem erro', () => {
  // Cobre o cleanup `resize`: o código removia o listener com o nome errado
  // (`resize` em vez de `aoResize`) e só estourava ao desmontar.
  const props = {
    onBack: () => {}, stats: { plays: 1 }, inv: {}, toys: [], bath: {},
    mood: 'neutral', userName: 'T', onPetAction: () => {}, onFoodEaten: () => {},
    onBathUsed: () => {}, onMinigame: () => {}, soundOn: true, cheer: null,
    onOpenShop: () => {},
  }
  const erros = []
  for (let volta = 0; volta < 10; volta += 1) {
    const caixa = caixaNova()
    const root = createRoot(caixa)
    act(() => { root.render(createElement(mod.PetHabitatView, props)) })
    for (let f = 0; f < 10; f += 1) {
      const r = rodar(1)
      if (r.erros.length) erros.push(r.erros[0])
    }
    act(() => { root.unmount() })
    caixa.remove()
  }
  assert.equal(erros.length, 0, `erro ao trocar de cena: ${erros[0]?.message}`)
  assert.equal(h.pendentes(), 0, `sobrou ${h.pendentes()} callback depois de 10 aberturas`)
})