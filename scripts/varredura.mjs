// Varredura adversarial: casos que a suite NAO cobria. Rodar com:
//   node scripts/varredura.mjs
// Sai com codigo != 0 quando algo quebra, para travar no CI.
import assert from 'node:assert/strict'
import { agruparPorPasta, faixasDaPasta } from '../src/lib/importFolders.js'
import {
  juntaConsumido,
  somaConsumido,
  disponivelDe,
  taxaDeDecaimento,
  MOOD_KEYS,
} from '../src/lib/pet.js'
import {
  mergeAll,
  mergePetstats,
  mergeCounters,
  mergeSettings,
  collectLocal,
  collectExtras,
  mergeExtras,
  mergeLibrary,
  semApagadas,
} from '../src/lib/sync.js'
import { ensureSids } from '../src/lib/sid.js'
import { conquistasDoResumo, getAchievements } from '../src/lib/stats.js'

let falhas = 0
const ok = []
function caso(nome, fn) {
  try {
    fn()
    ok.push(nome)
  } catch (e) {
    falhas++
    console.log(`\nFALHOU: ${nome}\n  ${e.message.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------------------
// LAPIDES: o bug mais serio. mergeAll filtra a biblioteca por
// `local.libApagadas || nuvem.libApagadas`, mas devolve a UNIAO. Ora o
// resultado diz que duas faixas estao apagadas e so uma foi filtrada; pior,
// a faixa apagada no outro aparelho volta para a nuvem.
// ---------------------------------------------------------------------------
caso('lapide so na nuvem nao ressuscita faixa apagada no outro aparelho', () => {
  const local = {
    library: [
      { sid: 'a', title: 'A', plays: 1 },
      { sid: 'b', title: 'B', plays: 1 },
    ],
    libApagadas: ['x'],
  }
  const nuvem = { library: [{ sid: 'b', title: 'B' }, { sid: 'x', title: 'X' }], libApagadas: ['b'] }
  const out = mergeAll(local, nuvem)
  const sids = out.library.map((r) => r.sid)
  assert.ok(out.libApagadas.includes('b'), 'uniao de lapides deve ter as duas')
  assert.ok(!sids.includes('b'), `lapide da nuvem ignorada, sobrou: ${sids.join(',')}`)
  assert.ok(!sids.includes('x'), `lapide local ignorada, sobrou: ${sids.join(',')}`)
})

caso('lapide apagada num lado nunca volta pela union', () => {
  const local = { library: [{ sid: 'a' }, { sid: 'z' }], libApagadas: ['z'] }
  const nuvem = { library: [{ sid: 'z' }, { sid: 'a' }], libApagadas: [] }
  const out = mergeAll(local, nuvem)
  assert.equal(out.libApagadas.includes('z'), true)
  assert.deepEqual(out.library.map((r) => r.sid).sort(), ['a'])
})

// ---------------------------------------------------------------------------
// BARRAS: barray Diminuem, entao vem da copia mais recente. Mas se a copia
// mais recente nao tem a chave, o resultado vira 0 em vez de usar a da outra.
// ---------------------------------------------------------------------------
caso('barra ausente na copia mais recente nao zera', () => {
  const local = { full: 80, lt: 200 }
  const nuvem = { full: 55, lt: 100 }
  const out = mergePetstats(local, nuvem)
  assert.equal(out.full, 80, 'local e a mais recente (lt maior)')
})

caso('barra some quando a copia nova tem lt mas nao tem a chave', () => {
  const local = { full: 80, lt: 100 }
  const nuvem = { coins: 5, lt: 200 }
  const out = mergePetstats(local, nuvem)
  assert.equal(out.full, 80, 'virou 0: barra do aparelho mais antigo foi perdida')
})

caso('todas as barras sobrevivem ao merge nos dois sentidos', () => {
  for (const k of MOOD_KEYS) {
    const a = { [k]: 70, lt: 500 }
    const b = { [k]: 30, lt: 100 }
    assert.equal(mergePetstats(a, b)[k], 70, `${k} local mais recente`)
    assert.equal(mergePetstats(b, a)[k], 70, `${k} nuvem mais recente`)
  }
})

// ---------------------------------------------------------------------------
// CONTADORES: string, null e negativo nao podem virar NaN nemWX.
caso('contador em string e convertido', () => {
  assert.equal(mergeCounters({ racao: '5' }, {})['1'] !== undefined ? '5' : '5', '5')
  assert.equal(mergeCounters({ racao: '5' }, {})['racao'], 5)
})

caso('contador negativo nao viaja para a nuvem', () => {
  const out = mergeCounters({ racao: -3 }, { bola: 2 })
  assert.ok((out.racao || 0) >= 0, `racao negativo vazou: ${out.racao}`)
})

caso('contador NaN vira 0', () => {
  const out = mergeCounters({ racao: 'abc' }, {})
  assert.equal(out.racao, 0)
})

caso('mesma chave com valor igual nao se perde', () => {
  assert.equal(mergeCounters({ racao: 4 }, { racao: 4 }).racao, 4)
})

// ---------------------------------------------------------------------------
// CONSUMO: o que foi gasto nunca pode voltar, e disponivel nunca fica negativo.
// ---------------------------------------------------------------------------
caso('gasto accumulates', () => {
  let c = {}
  c = somaConsumido(c, 'racao')
  c = somaConsumido(c, 'racao', 2)
  assert.equal(c.racao, 3)
})

caso('gasto nao some na union e nao volta a zero', () => {
  const a = juntaConsumido({ racao: 3 }, { racao: 5, bola: 2 })
  assert.equal(a.racao, 5)
  assert.equal(a.bola, 2)
  assert.equal(juntaConsumido({}, { racao: 7 }).racao, 7)
  assert.equal(juntaConsumido({ racao: 7 }, {}).racao, 7)
})

caso('disponivel nunca negativo', () => {
  assert.equal(disponivelDe({ racao: 2 }, { racao: 9 }, 'racao'), 0)
  assert.equal(disponivelDe({}, {}, 'racao'), 0)
  assert.equal(disponivelDe(null, null, 'racao'), 0)
  assert.equal(disponivelDe({ racao: 10 }, { racao: 4 }, 'racao'), 6)
})

caso('somaConsumido nao muta o objeto recebido', () => {
  const base = { racao: 1 }
  somaConsumido(base, 'racao', 5)
  assert.equal(base.racao, 1, 'mutou o original')
})

// ---------------------------------------------------------------------------
// DECAIMENTO: as barras nao podem passar de 100 nem virar negativo/NaN.
// ---------------------------------------------------------------------------
caso('taxa de decaimento aceita valores absurdos', () => {
  for (const v of [-50, 0, 50, 100, 1000, NaN, undefined, 'x', null]) {
    const t = taxaDeDecaimento(v)
    assert.ok(Number.isFinite(t) && t > 0 && t <= 1, `taxa(${v}) = ${t}`)
  }
})

// ---------------------------------------------------------------------------
// LEDGERS DE SEÇÃO: invUsado/bathUsado são de primeira classe. Se collectLocal
// não os enxergar, o gasto não sobe para a nuvem e a comida "volta".
// ---------------------------------------------------------------------------
// collectLocal nao recebe argumento: ele le do localStorage. O teste precisa
// montar o armazenamento antes, senao mede a funcao errada.
caso('invUsado/bathUsado sobrevivem a ida e volta da nuvem', () => {
  // readLocal faz JSON.parse, entao o armazenamento guarda TEXTO.
  const store = new Map([
    ['nt.inv', JSON.stringify({ racao: 5 })],
    ['nt.invUsado', JSON.stringify({ racao: 3 })],
    ['nt.bath', JSON.stringify({ banho: 4 })],
    ['nt.bathUsado', JSON.stringify({ banho: 2 })],
  ])
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, JSON.stringify(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  const local = collectLocal()
  assert.deepEqual(local.invUsado, { racao: 3 }, 'collectLocal perdeu invUsado')
  assert.deepEqual(local.bathUsado, { banho: 2 }, 'collectLocal perdeu bathUsado')
  const out = mergeAll(local, {})
  assert.deepEqual(out.invUsado, { racao: 3 }, 'mergeAll perdeu invUsado')
  assert.deepEqual(out.bathUsado, { banho: 2 }, 'mergeAll perdeu bathUsado')
  // E o gasto tem de aparecer como "consumido", nunca como estoque de volta.
  assert.equal(disponivelDe(out.inv, out.invUsado, 'racao'), 2)
  assert.equal(disponivelDe(out.bath, out.bathUsado, 'banho'), 2)
})

caso('gasto na nuvem some do disponivel ao aplicar', () => {
  const local = { inv: { racao: 5 }, invUsado: { racao: 3 } }
  const nuvem = { inv: { racao: 9 }, invUsado: { racao: 3 } }
  const out = mergeAll(local, nuvem)
  assert.equal(out.inv.racao, 9)
  assert.equal(out.invUsado.racao, 3)
  assert.equal(disponivelDe(out.inv, out.invUsado, 'racao'), 6)
})

// ---------------------------------------------------------------------------
// BIBLIOTECA: merges nao podem perder metadado nem duplicar faixa.
// ---------------------------------------------------------------------------
caso('mesma faixa nos dois lados nao duplica', () => {
  const a = [{ sid: 's1', title: 'A', plays: 3, audioBlob: new Blob(['x']) }]
  const b = [{ sid: 's1', title: 'A2', plays: 7 }]
  const out = mergeLibrary(a, b, [])
  assert.equal(out.length, 1)
  assert.equal(out[0].plays, 7)
})

caso('playDays dos dois lados sao unidos', () => {
  const a = [{ sid: 's1', playDays: { '2026-10-01': 1 } }]
  const b = [{ sid: 's1', playDays: { '2026-10-02': 1 } }]
  const out = mergeLibrary(a, b, [])
  assert.deepEqual(Object.keys(out[0].playDays).sort(), ['2026-10-01', '2026-10-02'])
})

caso('favorito marcado num lado nao se perde no outro', () => {
  const a = [{ sid: 's1', fav: true }]
  const b = [{ sid: 's1', fav: false }]
  assert.equal(mergeLibrary(a, b, [])[0].fav, true)
  assert.equal(mergeLibrary(b, a, [])[0].fav, true)
})

caso('capa compartilhada sobrevive ao merge', () => {
  const a = [{ sid: 's1', coverShare: 'data:image/webp;base64,AAA' }]
  const b = [{ sid: 's1' }]
  const out = mergeLibrary(a, b, [])
  assert.equal(out[0].coverShare, 'data:image/webp;base64,AAA')
  assert.equal(out[0].coverRemote, 'data:image/webp;base64,AAA', 'amigo precisa ver a capa')
})

caso('semApagadas ignora entrada invalida', () => {
  assert.deepEqual(semApagadas([{ sid: 'a' }, null], ['a']), [null])
  assert.deepEqual(semApagadas([{ sid: 'a' }], null), [{ sid: 'a' }])
})

// ---------------------------------------------------------------------------
// SID: identificador estavel e sem colisao.
// ---------------------------------------------------------------------------
caso('sid e estavel entre execucoes com os mesmos dados', () => {
  const t = [{ id: 'q', title: 'X', artist: 'Y', album: 'Z', duration: 100 }]
  assert.equal(ensureSids(t)[0].sid, ensureSids(t)[0].sid)
})

caso('tres faixas iguais recebem sids distintos', () => {
  const t = [1, 2, 3].map(() => ({ id: 'r' + Math.random(), title: 'A', artist: 'B', album: '', duration: 5 }))
  const sids = new Set(ensureSids(t).map((r) => r.sid))
  assert.equal(sids.size, 3, `colidiu: ${[...sids].join(',')}`)
})

// ---------------------------------------------------------------------------
// SETTINGS: secao faltando nao pode derrubar o sync.
// ---------------------------------------------------------------------------
caso('settings com metade das secoes nao quebra', () => {
  const out = mergeSettings({ accent: 'violet' }, { userName: 'Ana' }, 1, 2)
  assert.equal(out.accent, 'violet')
  assert.equal(out.userName, 'Ana')
})

caso('settings totalmente vazio devolve objeto', () => {
  const out = mergeSettings(undefined, undefined, 0, 0)
  assert.equal(typeof out, 'object')
  assert.ok(out !== null)
})


// ---------------------------------------------------------------------------
// CONQUISTAS: toda definicao tem que ser alcancavel, e o perfil do amigo
// (que vem do banco) tem que concordar com o perfil local. O comentario no
// arquivo diz exatamente isso; nada testava.
// ---------------------------------------------------------------------------
caso('toda conquista e alcancavel e fecha no numero certo', () => {
  const base = { musicas: 99, plays: 999, favs: 99, dias: 99, touches: 99, buys: 99, toys: 99, baths: 99 }
  const todas = conquistasDoResumo(base)
  assert.ok(todas.length >= 14, `esperava a lista de conquistas, veio ${todas.length}`)
  for (const a of todas) {
    assert.equal(a.done, true, `${a.id} nao fecha mesmo com 99 de tudo`)
    assert.equal(a.shown, a.need, `${a.id} estourou o limite`)
    assert.equal(a.pct, 100, `${a.id} nao fechou a barra`)
  }
})

caso('conquista nao fecha antes do numero', () => {
  const uma = conquistasDoResumo({ baths: 0 }).find((a) => a.id === 'bath1')
  assert.equal(uma.done, false)
  assert.equal(uma.shown, 0)
  assert.equal(uma.pct, 0)
  const quase = conquistasDoResumo({ baths: 2 }).find((a) => a.id === 'bath3')
  assert.equal(quase.done, false)
  assert.equal(quase.shown, 2, 'barra mostra o quanto tem')
  assert.ok(quase.pct > 0 && quase.pct < 100)
})

caso('perfil local e perfil do amigo dao a mesma marca', () => {
  // A biblioteca local tem 12 musicas, 3 favoritas, 40 plays em 5 dias.
  const lib = Array.from({ length: 12 }, (_, i) => ({
    sid: 's' + i,
    plays: i < 2 ? 20 : 0,
    fav: i < 3,
    playDays: { [`2026-10-0${(i%5)+1}`]: 1 },
  }))
  const extra = { buys: 2, toys: 4, baths: 1 }
  const local = getAchievements(lib, 7, extra)
  // O banco devolve o MESMO jogo de numeros.
  const remoto = conquistasDoResumo({
    musicas: 12,
    plays: 40,
    favs: 3,
    dias: 5,
    touches: 7,
    buys: 2,
    toys: 4,
    baths: 1,
  })
  assert.deepEqual(
    local.map((a) => a.id),
    remoto.map((a) => a.id),
    'listas diferentes',
  )
  assert.deepEqual(
    local.map((a) => a.done),
    remoto.map((a) => a.done),
    'marca de concluido discorda entre o perfil e o do amigo',
  )
})

caso('biblioteca vazia ou invalida nao quebra a conquista', () => {
  assert.ok(Array.isArray(getAchievements(null, 0)))
  assert.ok(Array.isArray(getAchievements(undefined, undefined, undefined)))
  assert.ok(Array.isArray(conquistasDoResumo(null)))
  assert.ok(Array.isArray(conquistasDoResumo({ musicas: 'x' })))
})

caso('plays de uma faixa valem para o total de 100/500 plays', () => {
  const lib = [{ sid: 'a', plays: 100, playDays: {} }]
  const lista = getAchievements(lib, 0, { buys: 0, toys: 0, baths: 0 })
  assert.equal(lista.find((a) => a.id === 'plays100').done, true)
  assert.equal(lista.find((a) => a.id === 'plays500').done, false)
})

caso('importar do aparelho: as musicas sao separadas por pasta', () => {
  const faixas = [
    { id: '1', title: 'a', folder: 'Music/Rock/' },
    { id: '2', title: 'b', folder: 'Music/Rock/' },
    { id: '6', title: 'f', folder: 'Music/Rock/' },
    { id: '3', title: 'c', folder: 'Download/WhatsApp Audio Notes' },
    { id: '4', title: 'd', folder: 'Download/WhatsApp Audio Notes/' },
    { id: '5', title: 'e', folder: '' },
  ]
  const { pastas, porPasta, temPasta } = agruparPorPasta(faixas)

  assert.ok(temPasta, 'o aparelho informa as pastas')

  // Barra no fim nao pode criar uma pasta a mais: "Music/Rock/" e "Music/Rock"
  // sao o MESMO lugar.
  assert.equal(pastas.length, 3, `3 pastas (veio ${pastas.map((p) => p.nome).join(', ')})`)
  assert.equal(pastas[0].total, 3, 'a pasta maior primeiro')

  // A pasta com mais musicas vem primeiro: e o que a pessoa quase sempre quer.
  assert.equal(pastas[0].nome, 'Rock', `a pasta com mais musicas vem primeiro (veio "${pastas[0].nome}")`)
  assert.equal(pastas[1].nome, 'WhatsApp Audio Notes', 'e depois a outra')
  assert.equal(porPasta.get('Download/WhatsApp Audio Notes').total, 2, 'a pasta do WhatsApp tem 2 musicas')

  // Mostrar uma pasta mostra SO ela.
  const soRock = faixasDaPasta(faixas, 'Music/Rock')
  assert.equal(soRock.length, 3, 'a pasta escolhida mostra so as musicas dela')
  assert.ok(soRock.every((f) => f.folder.startsWith('Music/Rock')), 'nenhuma musica de fora entra')

  // Todas as musicas: continua dando para importar tudo de uma vez.
  assert.equal(faixasDaPasta(faixas, null).length, 6, 'sem pasta escolhida, vem tudo')
})

caso('importar: APK antigo sem pasta nao quebra', () => {
  // O APK que ainda nao foi recompilado nao devolve `folder`. A tela tem que
  // continuar mostrando tudo junto, como antes - nem erro, nem lista vazia.
  const antigas = [{ id: '1', title: 'a' }, { id: '2', title: 'b' }]
  const { pastas, temPasta } = agruparPorPasta(antigas)
  assert.ok(!temPasta, 'sem pasta, a etapa de escolher pasta nao aparece')
  assert.equal(pastas.length, 0, 'nenhuma pasta inventada')
  assert.equal(faixasDaPasta(antigas, null).length, 2, 'as musicas todas continuam la')
})

console.log(`\n${ok.length} ok, ${falhas} falhando`)
if (falhas) process.exit(1)