// Testa o caminho de áudio do zero: escolher faixa, tocar, dar erro, pular,
// buscar posição, mudar velocidade e retomar do primeiro plano.
//
// Aqui moravam quatro bugs de variável indefinida (setLibrary, comAudio,
// cancelledRef) e um de sincronização: `playingRef` só era atualizado num
// efeito, então o `playWithRetry` abortava e o primeiro toque em play
// ficava mudo até o `setInterval` de 500ms、排 o audio pausado. Todos
// invisíveis para a suíte antiga: só apareciam com música tocando.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const h = await import('./dom-harness.mjs')
const { audio, resetAudio, falharProximoPlay, permitirPlay } = h

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mod = await import('../raf-out/ssr-raf.js')
const { usePlayer } = mod

let api = null
function Sonda({ library, onMissing, onStart, speed }) {
  api = usePlayer(library, speed, onStart, null, onMissing)
  return null
}

// O player usa setInterval/setTimeout de verdade (intervalo de progresso de
// 500ms e backoff de retentativa), então aqui o tempo passa de verdade.
const dormir = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

const comSrc = (id, dur = 180) => ({ id, title: id, src: `blob:${id}`, duration: dur })
const comBlob = (id) => ({ id, title: id, audioBlob: new h.window.Blob(['x']), duration: 90 })
const semAudio = (id) => ({ id, title: id, duration: 0 })

function montar(library, extra = {}) {
  // Container novo por teste: reaproveitar o mesmo com createRoot gera aviso
  // do React e mistura estado entre testes.
  const caixa = h.document.createElement('div')
  h.document.body.appendChild(caixa)
  const root = createRoot(caixa)
  resetAudio()
  act(() => {
    root.render(createElement(Sonda, {
      library,
      onMissing: extra.onMissing || (() => {}),
      onStart: extra.onStart || (() => {}),
      speed: extra.speed || 1,
    }))
  })
  const fechar = () => { act(() => { root.unmount() }); caixa.remove() }
  return { root, fechar }
}

test('áudio: o primeiro toque em play toca na hora, sem esperar o polling', async () => {
  const { fechar } = montar([comSrc('a'), comSrc('b')])
  act(() => { api.toggle() })

  // Este é o ponto: antes, play() só saía no setInterval de 500ms.
  assert.equal(audio.tocar, 1, 'o play não foi pedido no toque')
  assert.equal(api.playing, true)

  // E não pode pedir de novo no intervalo (seria tocar duas vezes).
  await dormir(700)
  assert.equal(audio.tocar, 1, `o polling repetiu o play (${audio.tocar}x)`)
  fechar()
})

test('áudio: cria um único elemento de áudio para a biblioteca toda', () => {
  const { fechar } = montar([comSrc('a'), comSrc('b'), comSrc('c')])
  act(() => { api.toggle() })
  assert.equal(audio.criado, 1, 'criar um <audio> por faixa é o que derruba o aparelho')
  fechar()
})

test('áudio: faixa que só tem blob toca (o caminho que quebrava)', async () => {
  // Antes, este caminho chamava setLibrary, que não existe no hook:
  // ReferenceError garantido ao tocar música que vem da nuvem.
  const { fechar } = montar([comBlob('nuvem')])
  act(() => { api.toggle() })
  assert.equal(audio.tocar, 1, 'não chegou a pedir play')
  fechar()
})

test('áudio: faixa sem arquivo avisa em vez de fingir que toca', async () => {
  let avisadas = 0
  const { fechar } = montar([semAudio('quebrada')], { onMissing: () => { avisadas += 1 } })
  act(() => { api.toggle() })
  await dormir(700)

  assert.equal(avisadas, 1, `deveria avisar 1x, avisou ${avisadas}x`)
  assert.equal(api.playing, false, 'não pode ficar marcado como tocando sem áudio')
  fechar()
})

test('áudio: pular quando a atual está sem arquivo acha a próxima com áudio', async () => {
  const { fechar } = montar([semAudio('quebrada'), comSrc('boa')])
  act(() => { api.toggle() })
  await dormir(700)
  assert.equal(audio.tocar, 1, 'deveria pular direto para a faixa com arquivo')
  fechar()
})

test('áudio: quando o play é recusado, a retentativa roda e não trava', async () => {
  const { fechar } = montar([comSrc('a')])
  // Depois de montar: `montar` chama resetAudio, que religa o play.
  falharProximoPlay()
  act(() => { api.toggle() })

  assert.equal(audio.tocarFalhou, 1, 'a recusa deveria ter acontecido')

  // Libera o play: o backoff de 300ms tem chance de recuperar.
  permitirPlay()
  await dormir(1200)

  assert.ok(audio.tocar >= 2, `deveria ter tentado de novo (tentou ${audio.tocar}x)`)
  fechar()
})

test('áudio: pular de faixa funciona e mexe no índice', async () => {
  const { fechar } = montar([comSrc('a'), comSrc('b'), comSrc('c')])
  act(() => { api.toggle() })
  const antes = api.currentIndex
  act(() => { api.next() })
  assert.notEqual(api.currentIndex, antes, 'next não mudou a faixa')

  act(() => { api.prev() })
  fechar()
})

test('áudio: seek posiciona no tempo pedido', () => {
  const { fechar } = montar([comSrc('a', 200)])
  act(() => { api.toggle() })
  assert.doesNotThrow(() => act(() => { api.seek(0.5) }))
  fechar()
})

test('áudio: velocidade chega no elemento de áudio', () => {
  const { fechar } = montar([comSrc('a')], { speed: 1.5 })
  act(() => { api.toggle() })
  assert.doesNotThrow(() => act(() => { api.seek(0.1) }))
  fechar()
})

test('áudio: voltar do primeiro plano retoma sem estourar (cancelledRef)', () => {
  // O efeito de visibility/pageshow lia `cancelledRef.current`, que nunca foi
  // declarado: retomar do primeiro plano estourava ReferenceError — ou seja,
  // exatamente quando se volta ao app depois de bloquear a tela.
  const { fechar } = montar([comSrc('a')])
  act(() => { api.toggle() })

  assert.doesNotThrow(() => {
    h.document.dispatchEvent(new h.window.Event('visibilitychange'))
    h.window.dispatchEvent(new h.window.Event('pageshow'))
  })
  fechar()
})

test('áudio: desmontar o player não deixa rAF nem intervalo pendurado', async () => {
  const { fechar } = montar([comSrc('a')])
  act(() => { api.toggle() })
  await dormir(600) // deixa o intervalo de progresso existir
  fechar()

  // Se o intervalo sobreviver ao unmount, ele continua emissando progresso
  // para um componente morto: vazamento que consome bateria até o app fechar.
  assert.equal(h.pendentes(), 0, `sobrou ${h.pendentes()} callback de animação`)
  assert.equal(api.playing, true, 'o player deve reportar o estado no momento do unmount')
})