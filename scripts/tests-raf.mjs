// Regressão de animação: pega o loop que agenda requestAnimationFrame duas
// vezes por callback.
//
// O bug era invisível para o lint e para os testes antigos: o build passava,
// os 106 testes passavam, e o app só travava no aparelho. A fila dobrava a
// cada quadro (1 -> 2 -> 4 -> 8) e, como o id sobrescrito impedia cancelar o
// órfão, os callbacks continuavam rodando depois do unmount.
//
// O harness (scripts/dom-harness.mjs) monta um DOM de verdade com
// requestAnimationFrame controlável, então dá para contar a fila.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const h = await import('./dom-harness.mjs')
const { pendentes, rodar, contadorCanvas } = h

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mod = await import('../raf-out/ssr-raf.js')

const raiz = h.document.getElementById('raiz')

// --- o harness precisa ter poder de detecção ------------------------------
// Se este teste passar, os demais estão medindo algo. Sem ele, um harness
// quebrado daria "OK" para tudo.
test('harness: sabe acusar loop que agenda duas vezes', () => {
  // Reproduz o defeito: agenda no começo e no fim do callback.
  let vivo = true
  const loop = () => {
    if (!vivo) return
    requestAnimationFrame(loop)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  const amostras = []
  for (let i = 0; i < 4; i += 1) {
    rodar(1)
    amostras.push(pendentes())
  }
  assert.deepEqual(amostras, [2, 4, 8, 16], `a fila deveria dobrar, veio ${amostras}`)

  // Desliga e drena: se este loop defeituoso ficar vivo, os testes seguintes
  // multiplicam a fila por mais 300 quadros e o processo morre de memória.
  vivo = false
  for (let i = 0; i < 8; i += 1) rodar(1)
  assert.equal(pendentes(), 0, 'o canário deveria deixar a fila zerada')
})

// --- fundo ----------------------------------------------------------------
test('fundo: um callback só, estável, e nada pendurado após unmount', () => {
  const root = createRoot(raiz)
  act(() => { root.render(createElement(mod.SpaceParticles, { count: 12 })) })

  rodar(1)
  assert.equal(pendentes(), 1, 'o loop de fundo deve agendar exatamente 1 callback')

  let maximo = 1
  for (let i = 0; i < 60; i += 1) {
    rodar(1)
    if (pendentes() > maximo) maximo = pendentes()
  }
  assert.equal(maximo, 1, `a fila não pode crescer (chegou a ${maximo})`)

  act(() => { root.unmount() })
  rodar(2)
  assert.equal(pendentes(), 0, 'não pode sobrar callback órfão após unmount')
})

// --- now playing -----------------------------------------------------------
test('now playing: a barra de tempo usa as classes que existem no CSS', () => {
  const root = createRoot(raiz)
  const base = {
    track: { id: 't1', title: 'M', artist: 'A', album: 'B', duration: 180, cover: [] },
    onClose: () => {}, onToggle: () => {}, onSeek: () => {}, playing: true,
    lyrics: { status: 'done', synced: true, lines: [{ time: 0, text: 'x' }] },
    syncOffset: 0, onSearchLyrics: () => {}, onPickLyrics: () => {},
    eq: false, fav: false, onToggleFavorite: () => {}, onOpenQueue: () => {},
    speed: 1, onSetSpeed: () => {}, depth: '', onSetDepth: () => {},
    isOnline: false, sleepMode: null, sleepRemaining: null,
    onStartSleep: () => {}, onCancelSleep: () => {},
    eqEnabled: false, eqPreset: 'flat', favPing: 0, trackId: 't1',
    soundOn: true, cheer: null, idleSinceRef: null, onPetAction: null,
    mood: 'neutral', userName: 'T',
  }
  act(() => {
    root.render(createElement(mod.NowPlaying, base))
  })

  const html = raiz.innerHTML
  // Estas são as classes que App.css define (.np-time/.np-bar/...).
  assert.ok(html.includes('np-bar'), 'falta a barra .np-bar')
  assert.ok(html.includes('np-bar-fill'), 'falta o preenchimento .np-bar-fill')
  assert.ok(html.includes('np-bar-thumb'), 'falta o polegar .np-bar-thumb')
  // Estas NÃO existem no CSS: foram a causa da barra quebrada.
  assert.ok(!html.includes('progress-track'), 'voltou a usar .progress-track (não existe no CSS)')
  assert.ok(!html.includes('progress-fill'), 'voltou a usar .progress-fill (não existe no CSS)')

  rodar(2)
  const estavel = pendentes()
  for (let i = 0; i < 30; i += 1) rodar(1)
  assert.equal(pendentes(), estavel, 'a fila de animação da tela não pode crescer')

  act(() => { root.unmount() })
  rodar(2)
  assert.equal(pendentes(), 0)
})

// --- habitat ---------------------------------------------------------------
test('habitat: 300 quadros sem erro, fila estável e 30 fps', () => {
  const root = createRoot(raiz)
  const base = {
    onBack: () => {}, stats: { plays: 3 }, inv: {}, toys: [], bath: {},
    mood: 'neutral', userName: 'T', onPetAction: () => {}, onFoodEaten: () => {},
    onBathUsed: () => {}, onMinigame: () => {}, soundOn: true, cheer: null,
    onOpenShop: () => {},
  }
  const erros = []
  act(() => { root.render(createElement(mod.PetHabitatView, base)) })

  rodar(2)
  let maximo = pendentes()
  contadorCanvas.limpar = 0
  for (let s = 0; s < 5; s += 1) {
    for (let f = 0; f < 60; f += 1) {
      const r = rodar(1)
      if (r.erros.length) erros.push(r.erros[0])
      if (pendentes() > maximo) maximo = pendentes()
    }
  }

  // Esta é a pegadinha que o lint não via: um cleanup com identificador errado
  // (`removeEventListener('resize', resize)` quando a função se chamava
  // `aoResize`) só estoura quando o efeito é desmontado.
  act(() => { root.unmount() })
  rodar(2)

  assert.equal(erros.length, 0, `erro durante os quadros: ${erros[0]?.message}`)
  assert.ok(maximo <= 3, `fila de animação cresceu para ${maximo}`)
  assert.equal(pendentes(), 0, `sobrou ${pendentes()} callback após unmount`)
  // O que importa aqui nao e a taxa de quadros, e que o loop desenhe NO MAXIMO
  // uma vez por quadro e nunca multiplica. A frequencia em si depende da cena.
  assert.ok(contadorCanvas.limpar > 0, 'o habitat parou de desenhar')
  assert.ok(contadorCanvas.limpar <= 300, `desenhou ${contadorCanvas.limpar}x em 300 quadros: mais de um por quadro`)
})

// --- biblioteca grande ---------------------------------------------------
test('biblioteca: 1.000 musicas sao desenhadas em pedacos, nao de uma vez', () => {
  const tracks = Array.from({ length: 1000 }, (_, i) => ({
    id: `t${i}`,
    title: `Musica ${i}`,
    artist: `Artista ${i}`,
    duration: 200,
    src: 'x',
    cover: ['#6b5bd6', '#2a2450', '#b9a7ff'],
  }))
  const nada = () => {}
  const props = {
    tracks,
    currentId: 't3',
    onSelect: nada,
    onRemove: nada,
    onToggleFavorite: nada,
    onQueueNext: nada,
    onQueueAdd: nada,
    onSearchOnline: nada,
    onEdit: nada,
    onShare: nada,
    onShareCard: nada,
    onOpenSource: nada,
    onAddToPlaylist: nada,
  }

  // O proprio alvo do React passa a ser o container de rolagem, com altura
  // como a tela tem no aparelho.
  const rolagem = h.document.getElementById('raiz')
  const definir = (nome, valor) =>
    Object.defineProperty(rolagem, nome, { value: valor, writable: true, configurable: true })
  definir('clientHeight', 800)
  definir('scrollHeight', 80000)
  definir('scrollTop', 0)

  const linhas = () => h.document.querySelectorAll('.track-row').length

  const root = createRoot(rolagem)
  act(() => { root.render(createElement(mod.TrackList, props)) })
  rodar(1)

  const inicio = linhas()
  assert.ok(inicio > 0, 'nenhuma linha desenhada')
  assert.ok(inicio < 100, `desenhou ${inicio} linhas de 1.000 de uma vez: e o que travava a tela`)

  // Musical tocando: so o currentId muda. Nao pode redesenhar a lista inteira.
  for (let k = 0; k < 5; k += 1) {
    act(() => { root.render(createElement(mod.TrackList, { ...props, currentId: `t${k + 50}` })) })
  }
  rodar(1)
  assert.equal(linhas(), inicio, 'trocar a musica que toca nao pode acrescentar linhas')

  // Rolar ate o fim: a lista cresce, em pedacos. Aqui nao se rola ate o
  // fim de proposito: desenhar as 1.000 linhas de uma vez levaria segundos e
  // centenas de MB so para o teste. O que importa e que ela cresce e que
  // cresce aos poucos.
  let anterior = inicio
  let maiorCrescimento = 0
  for (let k = 0; k < 5; k += 1) {
    rolagem.scrollTop = rolagem.scrollHeight - rolagem.clientHeight
    act(() => { rolagem.dispatchEvent(new h.window.Event('scroll')) })
    const agora = linhas()
    assert.ok(agora >= anterior, 'rolar nunca pode tirar linha da tela')
    maiorCrescimento = Math.max(maiorCrescimento, agora - anterior)
    anterior = agora
  }
  assert.ok(linhas() > inicio, 'rolar ate o fim nao acrescentou nenhuma linha')
  assert.ok(
    maiorCrescimento > 0 && maiorCrescimento <= 60,
    `a lista precisa crescer aos poucos (o maior salto foi de ${maiorCrescimento} linhas)`,
  )

  act(() => root.unmount())
  rodar(2)
  assert.equal(pendentes(), 0, 'a lista nao pode deixar animacao pendurada')
})
