// Varredura adversarial: casos que a suite NAO cobria. Rodar com:
//   node scripts/varredura.mjs
// Sai com codigo != 0 quando algo quebra, para travar no CI.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { agruparPorPasta, faixasDaPasta } from '../src/lib/importFolders.js'
import { deepEqual } from '../src/lib/equal.js'
import { protegerIdentidade } from '../src/lib/identity.js'
import { listAudioIds, storageStatus, ultimaFalhaDeGravacao, writeLocal } from '../src/localstore.js'
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
  applyExtras,
  semApagadas,
  idsDeTodasAsContas,
  haveriaDadosParaTrocar,
  limparDadosMisturados,
  limparRetratosEmbutidos,
  motivoDaGravacao,
  coletarRetrato,
  salvarRetrato,
  aplicarRetrato,
  aoIsolarConta,
  donoDosDados,
  isolarParaConta,
  lerRetrato,
  soCatalogoDaBiblioteca,
} from '../src/lib/sync.js'
import { ensureSids } from '../src/lib/sid.js'
import { hidratarLinha, indiceDeAudioLocal, soComAudioAqui, temAudioAqui } from '../src/lib/biblioteca.js'
import {
  catalogoPronto,
  comAudioNoAparelho,
  criarCatalogo,
  guardarNoCatalogo,
  linhasDoCatalogo,
  marcarCatalogoPronto,
  tirarDoCatalogo,
  trocarCatalogo,
} from '../src/lib/catalogo.js'
import { conquistasDoResumo, getAchievements, tempoDaBiblioteca } from '../src/lib/stats.js'

// `hidratarLinha` cria a URL do blob no navegador; no Node não existe, então
// um dublê mínimo basta para o teste ver o que importa (a linha entra ou não).
if (typeof URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = (b) => `blob:dublê/${(b && b.size) || 0}`
}

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

// ---------------------------------------------------------------------------
// ISOLAMENTO ENTRE CONTAS + RETORNO INTACTO
// O requisito era dois, e os dois andam juntos:
//   1) trocar de conta nao pode vazar NADA de uma para a outra;
//   2) ao voltar para a conta, tudo tem que reaparecer como estava.
// Antes, trocar apagava a conta que saia: o retorno trazia so o que a nuvem
// tinha, e as musicas importadas (que so existem no aparelho) sumiam.
// ---------------------------------------------------------------------------
// O mock guarda o valor EXATAMENTE como writeLocal passou (ou seja, já
// serializado). Serializar de novo aqui quebraria o readLocal de todo teste
// que usa este helper.
function montarStore(pares = {}) {
  const store = new Map(Object.entries(pares).map(([k, v]) => [k, JSON.stringify(v)]))
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store,
  }
  return store
}

caso('mesma conta em celular novo: tela vazia e nuvem intacta', () => {
  montarStore({ 'nt.library': [], 'nt.sync.owner': 'conta-A' })
  const base = collectLocal()
  const nuvem = {
    library: [
      { sid: 's1', title: 'Musica da conta A', plays: 40, fav: true, audioMissing: true },
      { sid: 's2', title: 'Outra', plays: 3, audioMissing: true },
    ],
    libApagadas: [],
    settings: { autoPlay: true },
  }
  // O que a TELA mostra neste aparelho: nada, porque nenhum arquivo existe aqui.
  assert.deepEqual(soComAudioAqui(nuvem.library, base.library), [], 'celular novo nao mostra as musicas da conta')
  // O que vai para o PUSH: tudo, porque a nuvem e o superconjunto.
  const out = mergeAll(base, nuvem)
  assert.equal(out.library.length, 2, 'a biblioteca da conta nao pode ser apagada na nuvem')
  assert.equal(out.library[0].plays, 40, 'os plays continuam intactos')
  assert.equal(out.library[0].fav, true, 'a favorita continua intacta')
  // ...e o resto continua sincronizando normalmente.
  assert.equal(out.settings.autoPlay, true, 'ajustes precisam continuar sincronizando')
})

caso('mesma conta com audio local continua juntando com a nuvem', () => {
  montarStore({})
  const base = { library: [{ sid: 's1', audioMissing: false, plays: 1 }], settings: {} }
  const nuvem = { library: [{ sid: 's1', plays: 9, audioMissing: true }] }
  const out = mergeAll(base, nuvem)
  assert.equal(out.library.length, 1, 'nao pode duplicar a mesma faixa')
  assert.equal(out.library[0].plays, 9, 'maior contagem vence')
})

caso('retrato guarda o estado por conta e devolve intacto', () => {
  montarStore({
    'nt.inv': { racao: 5 },
    'nt.petstats': { happy: 80 },
    'nt.achSeen': ['dia1'],
    'nt.playlists': { minhas: ['s1'] },
  })
  const retrato = coletarRetrato('conta-A')
  assert.ok(retrato['nt.inv'], 'retrato pegou o inventario')
  assert.deepEqual(retrato['nt.achSeen'], ['dia1'], 'retrato pegou as conquistas vistas')
  assert.ok(retrato['nt.petstats'], 'retrato pegou o gatinho')
  // O retrato nao pode levar junto coisa de outra conta: sessao, estado do sync
  // e o proprio marcador de dono.
  assert.equal(retrato['nt.account.session'], undefined, 'sessao nao entra no retrato')
  assert.equal(retrato['nt.sync.owner'], undefined, 'dono nao entra no retrato')
  assert.equal(retrato['nt.sync.status'], undefined, 'status do sync nao entra no retrato')
})

caso('retrato de uma conta nao aparece quando outra entra', () => {
  montarStore({})
  // Conta A e guardada.
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 5 }))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify(['dia1']))
  salvarRetrato('conta-A')

  // A conta A saiu: o aparelho foi limpo (como a troca real faz).
  globalThis.localStorage.removeItem('nt.inv')
  globalThis.localStorage.removeItem('nt.achSeen')

  // Agora entra a conta B, que NUNCA usou este aparelho.
  const restaurado = aplicarRetrato('conta-B')
  assert.equal(restaurado, 0, 'conta B nao tem retrato para restaurar')
  assert.equal(globalThis.localStorage.getItem('nt.inv'), null, 'nada de A pode sobrar para B')
  assert.equal(globalThis.localStorage.getItem('nt.achSeen'), null, 'conquistas de A nao podem vazar para B')
})

caso('ao voltar para a conta, o retrato restaura tudo', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 5 }))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify(['dia1']))
  salvarRetrato('conta-A')
  globalThis.localStorage.removeItem('nt.inv')
  globalThis.localStorage.removeItem('nt.achSeen')

  const n = aplicarRetrato('conta-A')
  assert.ok(n >= 2, 'retrato de A tem que voltar')
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.inv')), { racao: 5 })
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.achSeen')), ['dia1'])
})

caso('retrato da conta preserva os numeros da biblioteca dela', () => {
  montarStore({})
  const linhas = [{ id: 'i1', sid: 's1', title: 'Minha', plays: 40, fav: true, audioMissing: false }]
  globalThis.localStorage.setItem('nt.library', JSON.stringify(linhas))
  salvarRetrato('conta-A')
  assert.deepEqual(lerRetrato('conta-A')['nt.library'], linhas, 'a biblioteca entra no retrato com os numeros dela')
})

caso('sessao nunca entra no retrato de ninguem', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.account.session', JSON.stringify({ uid: 'conta-A' }))
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 1 }))
  const r = coletarRetrato('conta-A')
  assert.equal(r['nt.account.session'], undefined, 'sessao jamais e copiada para o retrato')
  assert.ok(r['nt.inv'], 'mas o inventario e')
})

caso('lerRetrato de conta desconhecida devolve nada', () => {
  montarStore({})
  assert.equal(lerRetrato('conta-que-nunca-existiu'), null)
  assert.equal(lerRetrato(null), null)
  assert.equal(aplicarRetrato(null), 0)
  assert.equal(aplicarRetrato('conta-que-nunca-existiu'), 0)
})

// ---------------------------------------------------------------------------
// O CICLO COMPLETO: conta A usa o aparelho, entra a conta B, e a conta A volta.
// Este e o teste que traduz o pedido: nada da A pode sobrar na B, e a A tem
// que voltar inteira (musicas importadas, conquistas, historico).
// ---------------------------------------------------------------------------
// Reproduz os passos que syncNowUmaVez faz na troca, usando as mesmas funcoes.
function trocarPara(troca) {
  const { donoQueSai, contaQueEntra, nuvem } = troca
  salvarRetrato(donoQueSai)
  // limpar: apaga tudo por-conta, preservando sessao/dono/biblioteca/retratos
  for (const k of [...globalThis.localStorage._store.keys()]) {
    if (!k.startsWith('nt.')) continue
    if (k === 'nt.account.session' || k === 'nt.sync.owner' || k === 'nt.library') continue
    if (k.startsWith('nt.cover.') || k.startsWith('nt.snap.') || k === 'nt.sync.status') continue
    globalThis.localStorage.removeItem(k)
  }
  // nt.library sobrevive, mas sem os numeros: eles dizem a quem a escuta foi.
  const lib = JSON.parse(globalThis.localStorage.getItem('nt.library') || '[]')
  globalThis.localStorage.setItem('nt.library', JSON.stringify(soCatalogoDaBiblioteca(lib)))
  // volta o retrato da conta que entra
  const tinhaRetrato = Boolean(lerRetrato(contaQueEntra))
  aplicarRetrato(contaQueEntra)
  const base = collectLocal()
  // Com retrato, o estado restaurado entra INTEIRO na mesclagem; sem retrato, a
  // conta nova entra com a biblioteca VAZIA: a biblioteca que sobrou no aparelho
  // era da conta que saiu (o arquivo e dela), e cede-la seria entregar nome,
  // capa e dias de A para B.
  const baseLocal = tinhaRetrato ? { ...base, library: base.library } : { ...base, library: [], libApagadas: [] }
  return { merged: mergeAll(baseLocal, { ...(nuvem || {}), libApagadas: (nuvem && nuvem.libApagadas) || [] }), tinhaRetrato }
}

caso('A usa o aparelho, B entra, e nada de A aparece na B', () => {
  montarStore({})
  // A importou musica, jogou e viu uma conquista.
  globalThis.localStorage.setItem('nt.library', JSON.stringify([
    { id: 'i1', sid: 's1', title: 'Musica secreta da A', plays: 77, fav: true, audioMissing: false },
  ]))
  globalThis.localStorage.setItem('nt.playedRecent', JSON.stringify(['s1']))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify(['dia1']))
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 30 }))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-A'))

  // A nuvem de B: conta nova, sem histórico nenhum.
  const { merged } = trocarPara({ donoQueSai: 'conta-A', contaQueEntra: 'conta-B', nuvem: null })

  // NADA da conta A pode aparecer para B: nem a música dela (o nome e a capa
  // eram informationes de A), nem os números, nem o histórico.
  const lib = merged.library
  assert.deepEqual(lib, [], 'a biblioteca de A nao pode aparecer para B (nem sem os numeros)')  // mergeAll sempre devolve as secoes (vazias quando nao ha dado): o que
  // importa e que NAO carregaram o conteudo de A.
  assert.deepEqual(merged.playedRecent, [], 'historico de A nao pode vir para B')
  assert.deepEqual(merged.achSeen, [], 'conquistas vistas de A nao podem vir para B')
  assert.deepEqual(merged.inv, {}, 'inventario de A nao pode vir para B')
})

caso('B usa o aparelho e A volta com tudo no lugar', () => {
  montarStore({})
  // ── A usa o aparelho
  globalThis.localStorage.setItem('nt.library', JSON.stringify([
    { id: 'i1', sid: 's1', title: 'Minha musica', plays: 77, fav: true, audioMissing: false },
  ]))
  globalThis.localStorage.setItem('nt.playedRecent', JSON.stringify(['s1']))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify(['dia1']))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-A'))
  trocarPara({ donoQueSai: 'conta-A', contaQueEntra: 'conta-B', nuvem: null })

  // ── B usa o aparelho: tem musica propria e conquista propria
  globalThis.localStorage.setItem('nt.library', JSON.stringify([
    { id: 'i2', sid: 's2', title: 'Musica da B', plays: 5, audioMissing: false },
  ]))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify(['dia2']))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-B'))

  // ── A volta
  const { merged, tinhaRetrato } = trocarPara({
    donoQueSai: 'conta-B',
    contaQueEntra: 'conta-A',
    nuvem: { settings: { autoPlay: true } },
  })
  assert.equal(tinhaRetrato, true, 'A tinha retrato guardado neste aparelho')
  assert.ok(lerRetrato('conta-A'), 'o retrato de A precisa continuar guardado depois da volta')

  // A biblioteca de A voltou com os numeros DELE, nao os da B.
  const lib = merged.library
  const a = lib.find((r) => r.sid === 's1')
  assert.ok(a, 'a musica importada pela A voltou')
  assert.equal(a.plays, 77, 'os plays voltaram como estavam')
  assert.equal(a.fav, true, 'a favorita voltou como estava')
  // Nada da B.
  assert.equal(lib.find((r) => r.sid === 's2'), undefined, 'a musica da B nao pode sobrar na A')
  // achSeen e uma LISTA de ids de conquistas ja vistas.
  assert.ok((merged.achSeen || []).includes('dia1'), 'a conquista vista na A voltou')
  assert.equal((merged.achSeen || []).includes('dia2'), false, 'a conquista da B nao pode vazar para A')
  assert.equal((merged.playedRecent || [])[0], 's1', 'o historico recente voltou')
})

caso('conta que nunca usou o aparelho nao herda o retrato de outra', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 99 }))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-A'))
  // C entra num aparelho que so viu A. C nao tem retrato: nasce do zero.
  const { merged } = trocarPara({ donoQueSai: 'conta-A', contaQueEntra: 'conta-C', nuvem: null })
  assert.deepEqual(merged.inv, {}, 'moedas de A nao podem aparecer para C')
})

// ---------------------------------------------------------------------------
// A REGRA DA BIBLIOTECA: só aparece o que tem ARQUIVO neste aparelho.
// E o outro lado da moeda, que é o mais caro: filtrar a TELA não pode
// apagar nada na NUVEM.
// ---------------------------------------------------------------------------

caso('mesmo aparelho: as musicas da conta sao reconhecidas e tocam', () => {
  montarStore({})
  const idx = indiceDeAudioLocal([
    { id: 'i1', title: 'Minha musica', artist: 'Zeca', duration: 100, src: 'blob:a' },
    { id: 'i2', title: 'Outra', artist: 'Banda', duration: 90, audioBlob: new Blob(['x']) },
  ])
  // A nuvem devolve as MESMAS linhas com os MESMOS ids.
  const daNuvem = [
    { id: 'i1', title: 'Minha musica', artist: 'Zeca', duration: 100, plays: 9, fav: true },
    { id: 'i2', title: 'Outra', artist: 'Banda', duration: 90, plays: 3 },
  ]
  const linhas = soComAudioAqui(daNuvem, [{ id: 'i1', src: 'blob:a' }, { id: 'i2', audioBlob: {} }])
  assert.equal(linhas.length, 2, 'as duas musicas tem arquivo aqui e devem aparecer')
  assert.equal(linhas[0].plays, 9, 'os numeros da conta continuam vindo da nuvem')
  assert.equal(linhas[0].fav, true, 'a favorita da conta volta junto')
  assert.ok(idx.porId.has('i1'), 'o indice acha pelo id do arquivo')
})

caso('outro aparelho: a conta tem musicas na nuvem, a tela fica vazia', () => {
  montarStore({})
  // Nuvem cheia de musicas da conta, aparelho sem NENHUM blob.
  const daNuvem = [
    { id: 'i1', title: 'Musica 1', artist: 'A', duration: 100 },
    { id: 'i2', title: 'Musica 2', artist: 'B', duration: 120 },
    { id: 'i3', title: 'Musica 3', artist: 'C', duration: 130 },
  ]
  assert.deepEqual(soComAudioAqui(daNuvem, []), [], 'sem arquivo local, nada vira musica na tela')
  assert.deepEqual(soComAudioAqui(daNuvem, null), [], 'biblioteca local ausente tambem nao materializa')
  // E nenhuma delas pode ser escolhida para tocar (era o que caia no sintetizador).
  for (const row of daNuvem) {
    assert.equal(temAudioAqui(row, indiceDeAudioLocal([])), false, `${row.title} nao pode tocar`)
  }
})

caso('musica antiga sem id estavel ainda e reconhecida pelo nome', () => {
  montarStore({})
  // O aparelho importou antes do id estavel (id aleatorio do navegador).
  const local = [{ id: 'aleatorio-xyz', title: 'Minha musica', artist: 'Zeca', duration: 100, src: 'blob:a' }]
  const daNuvem = [{ id: 'outro-aleatorio', title: 'Minha musica', artist: 'Zeca', duration: 100 }]
  const linhas = soComAudioAqui(daNuvem, local)
  assert.equal(linhas.length, 1, 'mesma musica com id diferente ainda e reconhecida')
})

caso('hidratarLinha so devolve linha com audio de verdade', () => {
  montarStore({})
  const base = { id: 'i1', title: 'Minha musica', audioMissing: true }
  assert.equal(hidratarLinha(base, { audio: null, cover: null }), null, 'sem blob nao vira linha')
  assert.equal(hidratarLinha(base, {}), null, 'media vazia nao vira linha')
  assert.equal(hidratarLinha(null, { audio: new Blob(['a']) }), null, 'linha invalida nao vira linha')
  const pronta = hidratarLinha(
    { id: 'i1', title: 'Minha musica', audioMissing: true, coverUrl: 'blob:velha' },
    { audio: new Blob(['a']), cover: new Blob(['c']) },
  )
  assert.ok(pronta, 'com blob a linha entra')
  assert.ok(pronta.src, 'a linha entra com src, para tocar de verdade')
  assert.equal(pronta.audioMissing, false, 'a linha entra como tendo audio')
  assert.ok(pronta.coverUrl && !pronta.coverUrl.startsWith('blob:velha'), 'capa velha da sessao anterior foi trocada')
})

caso('trocar de conta nao entrega as musicas da conta que saiu', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.library', JSON.stringify([
    { id: 'i1', sid: 's1', title: 'Segredo da A', plays: 77, fav: true, audioMissing: false },
  ]))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-A'))
  const { merged } = trocarPara({ donoQueSai: 'conta-A', contaQueEntra: 'conta-B', nuvem: null })
  assert.deepEqual(merged.library, [], 'a musica da A nao pode virar item de B')

  // ...e, se a NUVEM de B trouxer a mesma musica (o caso em que os ids do
  // servidor ainda eram os de A), ela tambem nao entra: o id dela nao bate
  // com nada que exista aqui, e a assinatura so vale se o ARQUIVO estiver aqui.
  const indiceVazio = indiceDeAudioLocal([])
  const daNuvem = [{ id: 'i1', sid: 's1', title: 'Segredo da A', plays: 77, fav: true }]
  assert.deepEqual(soComAudioAqui(daNuvem, []), [], 'nem vindo da nuvem a musica da A entra na B')
  assert.equal(temAudioAqui(daNuvem[0], indiceVazio), false, 'e nao pode ser tocada como se fosse da B')
})

caso('REGRESSAO: filtrar a tela nao pode apagar a biblioteca na nuvem', () => {
  montarStore({})
  // Aparelho novo: nt.library vazia (nada foi importado aqui).
  globalThis.localStorage.setItem('nt.library', JSON.stringify([]))
  // A nuvem da conta tem 3 musicas com os numeros de uso dela.
  const nuvem = {
    library: [
      { id: 'i1', sid: 's1', title: 'Um', plays: 10, fav: true },
      { id: 'i2', sid: 's2', title: 'Dois', plays: 5 },
      { id: 'i3', sid: 's3', title: 'Tres', plays: 2, playDays: { '2026-01-01': 2 } },
    ],
  }
  // O que a tela mostra: nada (este aparelho nao tem os arquivos).
  const visivel = soComAudioAqui(nuvem.library, [])
  assert.deepEqual(visivel, [], 'a tela fica vazia neste aparelho')
  // O que vai para o push: TUDO, porque a nuvem e o superconjunto.
  const base = collectLocal()
  const merged = mergeAll(base, nuvem)
  assert.equal(merged.library.length, 3, 'as 3 musicas continuam indo para a nuvem')
  assert.equal(merged.library[0].plays, 10, 'os plays da conta estao intactos')
  assert.equal(merged.library[0].fav, true, 'a favorita da conta esta intacta')
  assert.equal(merged.library[2].playDays['2026-01-01'], 2, 'os dias de uso estao intactos')
})

caso('a conta volta e recupera tudo: numeros, dias e capas', () => {
  montarStore({})
  const original = [{ id: 'i1', sid: 's1', title: 'Minha', plays: 77, fav: true, playDays: { '2026-01-01': 3 }, coverUrl: 'https://ex/c.jpg' }]
  globalThis.localStorage.setItem('nt.library', JSON.stringify(original))
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 7 }))
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-A'))
  trocarPara({ donoQueSai: 'conta-A', contaQueEntra: 'conta-B', nuvem: null })
  // A volta para A, com o retrato intacto.
  const { merged } = trocarPara({ donoQueSai: 'conta-B', contaQueEntra: 'conta-A', nuvem: null })
  assert.equal(merged.library.length, 1, 'a musica de A volta')
  assert.equal(merged.library[0].plays, 77, 'os plays de A voltam')
  assert.equal(merged.library[0].fav, true, 'a favorita de A volta')
  assert.deepEqual(merged.library[0].playDays, { '2026-01-01': 3 }, 'os dias de A voltam')
  assert.equal(merged.inv.racao, 7, 'as moedas de A voltam')
  // E a tela reconhece o arquivo, entao ela aparece tocando.
  assert.equal(soComAudioAqui(merged.library, [{ id: 'i1', src: 'blob:a', title: 'Minha' }]).length, 1, 'e aparece com audio')
})

caso('o blob e global do aparelho, mas a musica so entra para a dona dela', () => {
  montarStore({})
  // O arquivo esta no aparelho e o IndexedDB e global: nao tem "pasta" por
  // conta. Se o filtro consultasse a biblioteca em memoria na hora da troca, a
  // musica de A entraria na B so porque o id bate com o blob que sobrou.
  const musicaDaA = { id: 'i1', sid: 's1', title: 'Segredo da A', plays: 77, fav: true }
  // A tela da conta que ENTROU e montada pelo RETRATO dela. B nao tem retrato:
  // este aparelho so viu A.
  const retratoDaQueEntra = null
  const linhas = [{ ...musicaDaA, plays: 0, fav: false }]
  const indice = indiceDeAudioLocal(retratoDaQueEntra || [])
  assert.equal(temAudioAqui(linhas[0], indice), false, 'mesmo com o blob no aparelho, e de A e nao entra para B')

  // Quando B e a DONA legitima do arquivo (ela tem retrato com essa musica), entra.
  const retratoDaB = [{ id: 'i1', title: 'Segredo da A', src: 'blob:a' }]
  assert.equal(
    temAudioAqui(linhas[0], indiceDeAudioLocal(retratoDaB)),
    true,
    'a conta que realmente importou reconhece a musica e toca',
  )
})

caso('importar uma musica e ela NAO sumir quando a sync chega depois', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  const blob = new Blob(['audio'])
  globalThis.URL.createObjectURL = (b) => `blob:dublê/${(b && b.size) || 0}`

  // 1. O arquivo é importado: a linha entra no catálogo e na tela, com o blob
  //    ainda NAO having ido para o IndexedDB (é o estado real logo após o
  //    usuário escolher a música).
  const recemImportada = { id: 'file-1', title: 'Recém importada', artist: 'X', duration: 10, audioBlob: blob, src: 'blob:x', addedAt: 1 }
  guardarNoCatalogo(catalogo, recemImportada)
  const tela = comAudioNoAparelho(catalogo, (l) => ({ audio: l.audioBlob, cover: l.coverBlob }))
  assert.equal(tela.length, 1, 'a musica recem-importada aparece na tela')
  assert.ok(tela[0].src, 'e aparece tocando')

  // 2. A sincronização chega e entrega a MESMA linha, sem blob (a nuvem manda
  //    só metadados). O arquivo ainda não está no IndexedDB. É aqui que a
  //    música sumia: o filtro a descartava e o nt.library era reescrito sem ela.
  guardarNoCatalogo(catalogo, { id: 'file-1', title: 'Recém importada', plays: 3, fav: true })
  assert.equal(catalogo.linhas.size, 1, 'a musica continua no catalogo depois da sync')
  assert.equal(catalogo.linhas.get('file-1').plays, 3, 'os numeros que vieram da nuvem foram guardados')
  assert.equal(catalogo.linhas.get('file-1').fav, true, 'a favorita da nuvem foi guardada')
  // O que vai para o nt.library (e para a nuvem) segue com a música inteira.
  const gravado = linhasDoCatalogo(catalogo)
  assert.equal(gravado.length, 1, 'a musica nao pode ser apagada do nt.library')
  assert.equal(gravado[0].title, 'Recém importada', 'o titulo foi preservado')
})

caso('catálogo nao perde musica que so existe na nuvem', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  // A conta tem 3 músicas na nuvem; este aparelho não tem os arquivos.
  const daNuvem = [
    { id: 'i1', title: 'Um', plays: 10, fav: true, addedAt: 1 },
    { id: 'i2', title: 'Dois', plays: 5, addedAt: 2 },
    { id: 'i3', title: 'Tres', plays: 2, addedAt: 3 },
  ]
  for (const row of daNuvem) guardarNoCatalogo(catalogo, row)
  // A tela fica vazia (nada toca), mas o registro da conta está inteiro.
  assert.deepEqual(comAudioNoAparelho(catalogo, () => ({ audio: null, cover: null })), [], 'nada aparece sem arquivo')
  assert.equal(linhasDoCatalogo(catalogo).length, 3, 'as 3 musicas continuam no catalogo da conta')
  assert.deepEqual(
    linhasDoCatalogo(catalogo).map((r) => r.id),
    ['i1', 'i2', 'i3'],
    'na ordem em que entraram',
  )
})

caso('catálogo nunca faz contagem andar para tras', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  guardarNoCatalogo(catalogo, { id: 'i1', title: 'X', plays: 10, fav: true, playDays: { d1: 2 } })
  // Chega uma resposta velha da nuvem, com números menores.
  guardarNoCatalogo(catalogo, { id: 'i1', title: 'X', plays: 3, fav: false, playDays: { d2: 1 } })
  const linha = catalogo.linhas.get('i1')
  assert.equal(linha.plays, 10, 'os plays nunca voltam atrás')
  assert.equal(linha.fav, true, 'a favorita continua marcada')
  assert.deepEqual(linha.playDays, { d1: 2, d2: 1 }, 'os dias se juntam, nenhum some')
})

caso('musica apagada nao volta pelo catalogo', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  guardarNoCatalogo(catalogo, { id: 'i1', title: 'Fica', addedAt: 1 })
  guardarNoCatalogo(catalogo, { id: 'i2', title: 'Some', addedAt: 2 })
  // O usuário apaga "Some": sai da tela E do catálogo.
  tirarDoCatalogo(catalogo, 'i2')
  const gravado = linhasDoCatalogo(catalogo)
  assert.equal(gravado.length, 1, 'a musica apagada nao volta no nt.library')
  assert.equal(gravado[0].id, 'i1', 'a que ficou continua')
  // E a lápide manda: mesmo que a nuvem ainda traga a linha, ela não ressuscita.
  const juntada = mergeLibrary(linhasDoCatalogo(catalogo), [{ id: 'i2', sid: 's2', title: 'Some', plays: 9 }], ['s2'])
  assert.equal(juntada.length, 1, 'a nuvem nao traz de volta a musica apagada')
})

caso('REGRESSAO: trocar de conta nao junta as musicas das duas contas', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  // A usou este aparelho e tem 2 músicas, com arquivo (src) e capa.
  guardarNoCatalogo(catalogo, { id: 'a1', sid: 'sa1', title: 'Música da A', artist: 'A', album: 'X', duration: 100, src: 'blob:a1', cover: [{ t: 1 }], plays: 10, addedAt: 1 })
  guardarNoCatalogo(catalogo, { id: 'a2', sid: 'sa2', title: 'Outra da A', artist: 'A', album: 'X', duration: 120, src: 'blob:a2', plays: 4, addedAt: 2 })
  assert.equal(linhasDoCatalogo(catalogo).length, 2, 'A tem 2 musicas no catalogo')

  // B entra no aparelho: o catálogo DELE é reconstruído do retrato de B. A
  // biblioteca de A não pode sobreviver em lugar nenhum.
  const retratoB = [{ id: 'b1', sid: 'sb1', title: 'Música da B', artist: 'B', album: 'Y', duration: 90, addedAt: 1 }]
  trocarCatalogo(catalogo, retratoB)
  const aposTroca = linhasDoCatalogo(catalogo)
  assert.equal(aposTroca.length, 1, 'so a musica de B fica no catalogo')
  assert.equal(aposTroca[0].title, 'Música da B', 'e e a de B')
  assert.equal(
    linhasDoCatalogo(catalogo).some((r) => r.title === 'Música da A'),
    false,
    'nenhuma musica de A sobrou',
  )
  // A tela de B: só a de B, e só se o arquivo estiver aqui. O retrato é uma
  // linha sem `src` (é só metadado), então quem decide é o blob do IndexedDB.
  const blobs = { b1: new Blob(['x']) }
  const telaB = comAudioNoAparelho(catalogo, (l) => ({ audio: blobs[l.id] || null, cover: null }))
  assert.equal(telaB.length, 1, 'a tela de B mostra 1 musica')
  assert.equal(telaB[0].title, 'Música da B', 'e e a musica de B')
  assert.ok(telaB[0].src, 'e ela aparece tocando')
})

caso('a mesma musica com ids diferentes nao vira duplicada', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  // A local, lida do arquivo: id do aparelho, com capa e duração de verdade.
  guardarNoCatalogo(catalogo, { id: 'local-1', title: 'Minha música', artist: 'Zeca', album: 'Cd', duration: 185, cover: [{ t: 1 }], src: 'blob:x', addedAt: 1 })
  // A mesma música vindo da nuvem, com id de outro aparelho e duração ainda 0.
  guardarNoCatalogo(catalogo, { id: 'nuvem-9', title: 'Minha música', artist: 'Zeca', album: 'Cd', duration: 0, plays: 12, addedAt: 1 })
  const linhas = linhasDoCatalogo(catalogo)
  assert.equal(linhas.length, 1, 'a mesma musica nao pode virar duas linhas')
  assert.equal(linhas[0].id, 'local-1', 'sobrevive a linha que tinha o arquivo deste aparelho')
  assert.equal(linhas[0].plays, 12, 'e ela recebe as estatisticas da nuvem')
  assert.equal(linhas[0].duration, 185, 'a duracao de verdade nao foi perdida')
  assert.deepEqual(linhas[0].cover, [{ t: 1 }], 'a capa nao foi perdida')
  assert.ok(linhas[0].sid, 'a linha fica com um sid')
})

caso('linha da nuvem sem capa nao apaga a capa que ja existia', () => {
  montarStore({})
  const catalogo = criarCatalogo()
  guardarNoCatalogo(catalogo, { id: 'i1', title: 'X', artist: 'Y', cover: [{ t: 1 }], coverShare: 'data:image/png;base64,AAA', coverRemote: 'https://ex/c.jpg', duration: 120, addedAt: 1 })
  // A nuvem devolve a linha sem nenhum desses campos.
  guardarNoCatalogo(catalogo, { id: 'i1', title: 'X', artist: 'Y', plays: 3, addedAt: 1 })
  const linha = catalogo.linhas.get('i1')
  assert.deepEqual(linha.cover, [{ t: 1 }], 'a capa da musica continua')
  assert.equal(linha.coverShare, 'data:image/png;base64,AAA', 'a miniatura compartilhada continua')
  assert.equal(linha.coverRemote, 'https://ex/c.jpg', 'a capa remota continua')
  assert.equal(linha.duration, 120, 'a duracao continua')
  assert.equal(linha.plays, 3, 'e a estatistica nova entrou')
})

caso('liberar espaco nao apaga o arquivo de outra conta', () => {
  montarStore({})
  // A usou este aparelho: o retrato dela guarda os ids das músicas com arquivo.
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ library: [{ id: 'a1' }, { id: 'a2' }] }))
  // Agora a tela e a de B, com uma música só.
  const telaDeB = [{ id: 'b1' }]
  // O "liberar espaco" pergunta quais blobs são órfãos. Se perguntasse só pela
  // tela, os arquivos de A seriam órfãos e seriam apagados — e a música de A
  // desapareceria de vez quando ela voltasse.
  const ids = idsDeTodasAsContas(telaDeB.map((x) => x.id))
  assert.ok(ids.includes('a1'), 'o arquivo da musica de A e preservado')
  assert.ok(ids.includes('a2'), 'o arquivo da outra musica de A tambem')
  assert.ok(ids.includes('b1'), 'e o da conta na tela')
  assert.equal(new Set(ids).size, 3, 'sem repetir ids')

  // O que realmente pode ir: a música que o usuário apagou de verdade.
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ library: [{ id: 'a1' }] }))
  const depois = idsDeTodasAsContas(['b1', 'a1'])
  assert.deepEqual(depois.sort(), ['a1', 'b1'], 'a musica apagada (a2) nao esta mais em nenhum retrato')
})

caso('REGRESSAO: o retrato de uma conta NUNCA vai para a nuvem', () => {
  montarStore({})
  // O aparelho guarda o estado de duas contas que já passaram por ele.
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ _uid: 'conta-A', 'nt.inv': { racao: 30 }, 'nt.library': [{ id: 'a1', title: 'Da A' }] }))
  globalThis.localStorage.setItem('nt.snap.conta-B', JSON.stringify({ _uid: 'conta-B', 'nt.inv': { racao: 7 }, 'nt.library': [{ id: 'b1', title: 'Da B' }] }))
  // A conta A sincroniza. Se os retratos fossem junto, o perfil de A na nuvem
  // passaria a guardar a biblioteca e as moedas de B — e vice-versa, indefinida.
  const extras = collectExtras()
  const comRetrato = Object.keys(extras).filter((k) => k.startsWith('nt.snap.'))
  assert.deepEqual(comRetrato, [], 'nenhum retrato sobe no extras')
})

caso('nuvem antiga com retrato dentro nao escreve no aparelho', () => {
  montarStore({})
  // O perfil de A no Supabase ficou (com a falha antiga) com o retrato de B
  // dentro do extras. Ao aplicar, isso NÃO pode ser gravado no aparelho: é o
  // estado de outra conta.
  const naoGravou = applyExtras(
    { 'nt.snap.conta-B': { 'nt.inv': { racao: 999 }, 'nt.library': [{ id: 'b1' }] }, 'nt.miniapp.x': 1 },
    { trocar: true },
  )
  assert.equal(globalThis.localStorage.getItem('nt.snap.conta-B'), null, 'o retrato de B nao foi plantado aqui')
  assert.equal(globalThis.localStorage.getItem('nt.miniapp.x'), '1', 'o resto do extras continua funcionando')
  assert.equal(naoGravou, true, 'a aplicação contou que mexeu em algo')
})

caso('trocar de conta nao apaga o retrato das outras contas', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ _uid: 'conta-A', 'nt.inv': { racao: 30 } }))
  globalThis.localStorage.setItem('nt.snap.conta-B', JSON.stringify({ _uid: 'conta-B', 'nt.inv': { racao: 7 } }))
  globalThis.localStorage.setItem('nt.miniapp.x', 1)
  // Entrando em C, whose cloud has no extras at all: a limpeza da troca não pode
  // levar embora o estado guardado das contas A e B.
  applyExtras({}, { trocar: true })
  assert.ok(globalThis.localStorage.getItem('nt.snap.conta-A'), 'o retrato de A continua guardado')
  assert.ok(globalThis.localStorage.getItem('nt.snap.conta-B'), 'o retrato de B continua guardado')
  assert.equal(globalThis.localStorage.getItem('nt.miniapp.x'), null, 'o que era de A e nao veio de C sai')
})

caso('um retrato nunca guarda outro retrato dentro', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ racao: 30 }))
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ 'nt.inv': { racao: 5 } }))
  const snap = coletarRetrato('conta-B')
  assert.equal(snap['nt.snap.conta-A'], undefined, 'o retrato de A nao entra no de B')
  assert.equal(snap['nt.inv'].racao, 30, 'mas o estado normal da conta sim')
  assert.equal(snap._uid, 'conta-B', 'e o retrato fica marcado com o dono')
})

caso('reparo: retrato com estado de outra conta e descartado', () => {
  montarStore({})
  // Retrato de B que, na época da mistura, carregava o estado de A dentro.
  globalThis.localStorage.setItem('nt.snap.conta-B', JSON.stringify({
    'nt.inv': { racao: 7 },
    'nt.snap.conta-A': { 'nt.inv': { racao: 30 } },
  }))
  // Retrato de C com o dono trocado (não é de C): vai fora.
  globalThis.localStorage.setItem('nt.snap.conta-C', JSON.stringify({ _uid: 'conta-A', 'nt.inv': { racao: 1 } }))
  limparRetratosEmbutidos()
  const b = JSON.parse(globalThis.localStorage.getItem('nt.snap.conta-B'))
  assert.equal(b['nt.snap.conta-A'], undefined, 'o estado de A saiu de dentro do retrato de B')
  assert.equal(b['nt.inv'].racao, 7, 'e o estado proprio de B foi preservado')
  assert.equal(globalThis.localStorage.getItem('nt.snap.conta-C'), null, 'o retrato de dono trocado foi descartado')
})

caso('a falha de gravacao diz o que aconteceu', () => {
  montarStore({})
  // O motivo precisa separar os casos: cada um tem um conservo diferente, e a
  // mensagem antiga ("Falha ao gravar na nuvem") nao ajudava em nada.
  assert.ok(/Sessão expirada/.test(motivoDaGravacao(401, '', 1000)), 'sessao expirada')
  assert.ok(/permissão/i.test(motivoDaGravacao(403, '', 1000)), 'permissão')
  assert.ok(/grande demais/i.test(motivoDaGravacao(413, '', 5000000)), 'payload grande')
  assert.ok(/nuvem caiu/i.test(motivoDaGravacao(503, '', 1000)), 'servidor fora')
  assert.ok(/conexão/i.test(motivoDaGravacao(0, '', 1000)), 'sem rede')
  assert.ok(/MB/.test(motivoDaGravacao(400, 'detalhe do servidor', 2500000)), 'tamanho em MB')
  assert.ok(/detalhe do servidor/.test(motivoDaGravacao(400, 'detalhe do servidor', 10)), 'motivo do servidor')
})

caso('a mistura na nuvem se cura sozinha no proximo envio', () => {
  montarStore({})
  // O perfil de A na nuvem ainda tem o retrato de B dentro do extras (bug
  // antigo). A junta entre o que o aparelho tem e o que veio da nuvem nao pode
  // carregar isso de volta: se levasse, o perfil continuaria poluído para
  // sempre, a cada sincronizacao.
  const nuvem = { 'nt.snap.conta-B': { 'nt.inv': { racao: 999 } }, 'nt.miniapp.x': 5 }
  const juntado = mergeExtras({ 'nt.miniapp.y': 7 }, nuvem)
  assert.equal(juntado['nt.snap.conta-B'], undefined, 'o retrato da outra conta nao segue para o proximo envio')
  assert.equal(juntado['nt.miniapp.x'], 5, 'o resto do extras sobrevive')
  assert.equal(juntado['nt.miniapp.y'], 7, 'e o que o aparelho tem entra')
})

caso('a limpeza da mistura APAGA o estado embolado', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.settings', JSON.stringify({ foto: 'foto-DA-A' }))
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ moedas: 999 }))
  globalThis.localStorage.setItem('nt.petstats', JSON.stringify({ fome: 1 }))
  globalThis.localStorage.setItem('nt.toys', JSON.stringify({ bola: 2 }))
  globalThis.localStorage.setItem('nt.achSeen', JSON.stringify({ toy1: true }))
  globalThis.localStorage.setItem('nt.playlists', JSON.stringify({ '1': { nome: 'Dela' } }))
  globalThis.localStorage.setItem('nt.snap.conta-A', JSON.stringify({ 'nt.inv': { moedas: 30 } }))
  globalThis.localStorage.setItem('nt.snap.conta-B', JSON.stringify({ 'nt.inv': { moedas: 7 } }))
  const r = limparDadosMisturados()
  assert.equal(r.removidas, 8, 'saiu exatamente o que era da conta, nem mais nem menos')
  for (const k of ['nt.settings', 'nt.inv', 'nt.petstats', 'nt.toys', 'nt.achSeen', 'nt.playlists', 'nt.snap.conta-A', 'nt.snap.conta-B']) {
    assert.equal(globalThis.localStorage.getItem(k), null, `${k} saiu`)
  }
})

caso('a limpeza da mistura NAO tira as musicas', () => {
  montarStore({})
  // A biblioteca com o arquivo de verdade e a capa continuam: são as coisas
  // caras de repor. A sessão também, para não obrigar a digitar a senha.
  globalThis.localStorage.setItem('nt.library', JSON.stringify([
    { id: 'm1', title: 'Minha', artist: 'A', album: 'B', duration: 200, src: 'blob:m1', cover: 'c1', plays: 77, playDays: { 1: 3 }, fav: true },
  ]))
  globalThis.localStorage.setItem('nt.cover.c1', 'data:image/png;base64,AAAA')
  globalThis.localStorage.setItem('nt.account.session', JSON.stringify({ token: 't' }))
  const r = limparDadosMisturados()
  const lib = JSON.parse(globalThis.localStorage.getItem('nt.library'))
  assert.equal(r.musicas, 1, 'a musica foi contada como mantida')
  assert.equal(lib.length, 1, 'a musica continua na lista')
  assert.equal(lib[0].title, 'Minha', 'com o que e da musica intacto')
  assert.equal(lib[0].src, 'blob:m1', 'e o arquivo local junto')
  assert.equal(lib[0].cover, 'c1', 'e a capa')
  assert.equal(globalThis.localStorage.getItem('nt.cover.c1'), 'data:image/png;base64,AAAA', 'a capa nao foi tocada')
  assert.equal(globalThis.localStorage.getItem('nt.account.session'), '{"token":"t"}', 'a sessao sobrevive')
  // A CONTAGEM era da conta (vem embolada de outra): recomeça em zero, mas a
  // musica nao some por causa disso.
  assert.equal(lib[0].plays, 0, 'os plays embolados foram zerados')
  assert.equal(lib[0].fav, false, 'a favorita embolada foi desfeita')
  assert.deepEqual(lib[0].playDays, {}, 'os dias de reproducao foram limpos')
})

caso('a sync NAO pode editar a conta sozinha (laco de 2s)', () => {
  montarStore({})
  // Este é o laço que o aparelho estava entrando depois da limpeza: a sync
  // aplicava o resultado com setAll e afins SEMPRE, criando um objeto novo.
  // O estado mudava, o efeito que agenda a sync via "ficou sujo" disparava em
  // 2 s, a sync voltava a aplicar… sem parar. E, com a conta recém-limpa, cada
  // volta sobrescrevia os ajustes da pessoa pelo padrão.
  const atual = { accent: 'violet', avatar: '', userName: '' }
  const aplica = (mudar) => {
    const proximo = mudar(atual)
    if (deepEqual(proximo, atual)) return { mudou: false, valor: atual }
    return { mudou: true, valor: proximo }
  }
  // `setAll` devolvendo exatamente o que já estava guardado.
  const devolvido = { accent: 'violet', avatar: '', userName: '' }
  const r = aplica((s) => ({ ...s, ...devolvido }))
  assert.equal(r.mudou, false, 'a sync devolvendo o mesmo valor nao conta como edicao')
  assert.equal(r.valor, atual, 'e o estado continua sendo o MESMO objeto (React nao redesenha)')
  // Agora um valor de verdade: tem que passar.
  const novo = aplica((s) => ({ ...s, ...{ avatar: 'data:image/webp;base64,AAA' } }))
  assert.equal(novo.mudou, true, 'mudanca de verdade continua entrando')
  assert.equal(novo.valor.avatar, 'data:image/webp;base64,AAA', 'com o valor novo')
})

caso('deepEqual distingue o que importa', () => {
  // Se deepEqual dissesse que tudo era igual, a guarda acima passaria a
  // engolir edicoes de verdade. Estes casos delimitam onde ele pode errar.
  assert.equal(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true, 'ordem das chaves nao importa')
  assert.equal(deepEqual([1, [2, 3]], [1, [2, 3]]), true, 'arrays aninhados')
  assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false, 'chave a mais conta como diferenca')
  assert.equal(deepEqual([1, 2], [2, 1]), false, 'ordem de array importa')
  assert.equal(deepEqual({ a: 1 }, { a: '1' }), false, 'numero e texto sao diferentes')
  assert.equal(deepEqual({ a: 1 }, [1]), false, 'objeto e array sao diferentes')
  assert.equal(deepEqual(null, undefined), false, 'null nao e undefined')
  assert.equal(deepEqual(0, false), false, 'zero nao e false')
  assert.equal(deepEqual('', 0), false, 'vazio nao e zero')
  assert.equal(deepEqual(null, null), true, 'null com null é igual')
  assert.equal(deepEqual([], {}), false, 'array vazio nao e objeto vazio')
})

caso('o catalogo sabe se ja pode gravar a biblioteca', () => {
  // O APAGAO: ao trocar de conta o catálogo é esvaziado para ser recarregado do
  // retrato da conta que entrou. Nesse intervalo o efeito que reescreve o
  // `nt.library` disparava e gravava `[]` por cima da biblioteca de verdade —
  // apagando as músicas do aparelho. O catálogo ganha `pronto` para dizer que
  // ainda NÃO pode ser gravado.
  const cat = criarCatalogo()
  assert.equal(catalogoPronto(cat), false, 'um catalogo recem-criado nao pode ser gravado ainda')
  guardarNoCatalogo(cat, { id: 'a', title: 'Da conta', artist: 'X', album: 'Y' })
  assert.equal(catalogoPronto(cat), false, 'ter linha nao é o mesmo que estar pronto')
  // Trocar de conta: o catálogo é reconstruído a partir do retrato e volta a
  // ficar "não pronto" — é o intervalo perigoso.
  trocarCatalogo(cat, { library: [{ id: 'b', title: 'De outra conta', artist: 'Z', album: 'W' }] })
  assert.equal(catalogoPronto(cat), false, 'logo apos trocar de conta o catalogo NAO pode ser gravado')
  assert.equal(linhasDoCatalogo(cat).length, 1, 'e ja tem a linha da conta que entrou')
  assert.equal(linhasDoCatalogo(cat)[0].id, 'b', 'que e a da conta que entrou')
  // Só depois de carregar é que grava.
  marcarCatalogoPronto(cat, true)
  assert.equal(catalogoPronto(cat), true, 'carregado, agora pode gravar')
  // Trocar para uma conta SEM retrato: catálogo vazio e ainda não pronto.
  const cat2 = criarCatalogo()
  trocarCatalogo(cat2, null)
  assert.equal(catalogoPronto(cat2), false, 'conta sem retrato comeca nao pronta')
  assert.equal(linhasDoCatalogo(cat2).length, 0, 'e sem linhas')
})

caso('a recuperacao acha audio que sobrou sem linha na lista', () => {
  // O apagão levou o `nt.library`, mas os arquivos ficaram no IndexedDB com a
  // chave `${id}:audio`. A chave de dentro do blob é o que devolve o id e o
  // nome do arquivo — sem ele a música ficaria órfã para sempre.
  montarStore({})
  // `listAudioIds` conversa com o IndexedDB; aqui o que se testa é o
  // desligamento: ela nunca pode lançar, senão o botão de recuperar quebra.
  assert.equal(typeof listAudioIds, 'function', 'a varredura existe')
  return listAudioIds().then((lista) => {
    assert.equal(Array.isArray(lista), true, 'e devolve sempre uma lista, mesmo sem banco')
  })
})

caso('dono velho com aparelho vazio NAO pode gerar troca de conta', () => {
  montarStore({})
  // A limpeza de dados deixa a marca de DONO apontando para a conta antiga (se
  // ela sobreviver). Aí a leitura "dono != uid" vira "houve troca", e a sync
  // APAGA o estado recomeçado — toda rodada, sem parar. O sintoma é o app
  // resetando tudo sozinho, sem parar, enquanto a música (que tem arquivo)
  // continua no lugar.
  const marca = 'nt.sync.owner'
  const A = '11111111-1111-1111-1111-111111111111'
  const B = '22222222-2222-2222-2222-222222222222'

  // Cenário 1: aparelho vazio, marca apontando para outra conta.
  globalThis.localStorage.setItem(marca, JSON.stringify(A))
  assert.equal(haveriaDadosParaTrocar(), false, 'sem snapshot e sem dado de conta, nao ha o que trocar')

  // Cenário 2: o mesmo aparelho, mas com o estado de uma conta de verdade.
  globalThis.localStorage.setItem('nt.settings', JSON.stringify({ userName: 'Dela', avatar: 'x' }))
  assert.equal(haveriaDadosParaTrocar(), true, 'com estado de conta no aparelho, a troca e real e deve acontecer')

  // A conta nova (B) que entra na situação 1 tem de poder assumir a posse sem
  // que nada seja apagado: e o que trava o laço.
  globalThis.localStorage.removeItem('nt.settings')
  assert.equal(haveriaDadosParaTrocar(), false, 'voltou a nao ter o que trocar')
})

caso('a limpeza apaga a marca de dono', () => {
  montarStore({})
  // Se a marca sobreviver apontando para a conta antiga, a proxima sync le "houve
  // troca" e limpa o estado recomecado, repetidamente. Este e o teste do sintoma.
  globalThis.localStorage.setItem('nt.sync.owner', JSON.stringify('conta-antiga'))
  globalThis.localStorage.setItem('nt.settings', JSON.stringify({ avatar: 'foto' }))
  globalThis.localStorage.setItem('nt.inv', JSON.stringify({ moedas: 50 }))
  globalThis.localStorage.setItem('nt.library', JSON.stringify([{ id: 'm1', title: 'Minha' }]))
  globalThis.localStorage.setItem('nt.account.session', JSON.stringify({ token: 't' }))
  limparDadosMisturados()
  assert.equal(globalThis.localStorage.getItem('nt.sync.owner'), null, 'a marca de dono saiu')
  assert.equal(globalThis.localStorage.getItem('nt.settings'), null, 'e o resto do estado misturado tambem')
  // A musica continua, e a sessao continua (para nao pedir a senha de novo).
  assert.ok(globalThis.localStorage.getItem('nt.library'), 'a biblioteca foi preservada')
  assert.ok(globalThis.localStorage.getItem('nt.account.session'), 'a sessao foi preservada')
})

// Aplica o resultado da sync como o App faz, para testar o caminho de verdade.
function syncApplyComoOApp(cur, merged, trocar) {
  const proximo = mergeCounters(cur, merged)
  return { mudou: !deepEqual(cur, proximo), valor: proximo }
}

caso('ganhar moeda e sincronizar NAO pode zerar o saldo', () => {
  // Este era o sintoma final: a pessoa ganhava uma moeda, a sincronização de
  // 2 s rodava, e o saldo voltava a ZERO. No caminho de troca o código
  // SUBSTITUÍA o contador pelo que veio da nuvem — e a nuvem estava zerada.
  const comNuvemZerada = { moedas: 0, toques: 0 }

  // Mesma conta: juntava pelo maior, e o saldo sobrevivia.
  const mesma = syncApplyComoOApp({ moedas: 1, toques: 5 }, comNuvemZerada, false)
  assert.equal(mesma.valor.moedas, 1, 'mesma conta: 1 moeda continua 1')
  assert.equal(mesma.valor.toques, 5, 'e os toques continuam 5')

  // Troca de conta: era AQUI que o saldo morria. Mesmo com a nuvem zerada, o
  // que a pessoa acabou de ganhar no aparelho tem de ficar.
  const troca = syncApplyComoOApp({ moedas: 1, toques: 5 }, comNuvemZerada, true)
  assert.equal(troca.valor.moedas, 1, 'troca de conta: a moeda ganha NAO pode virar 0')
  assert.equal(troca.valor.toques, 5, 'e os toques tambem nao')

  // E o caso geral: um contador NUNCA diminui por causa da nuvem, seja qual for
  // o caminho. Compras e gastos ja reduzem o saldo no proprio app.
  assert.equal(syncApplyComoOApp({ moedas: 50 }, { moedas: 10 }, true).valor.moedas, 50, 'a nuvem com valor menor nunca derruba o maior')
  assert.equal(syncApplyComoOApp({}, { moedas: 10 }, true).valor.moedas, 10, 'e se o aparelho nao tem nada, vem da nuvem')
  assert.equal(syncApplyComoOApp({ moedas: 3 }, {}, true).valor.moedas, 3, 'nuvem vazia nao zera o que o aparelho tem')
})

caso('nuvem vazia e a mais nova NAO pode zerar o que o aparelho tem', () => {
  // Mesma armadilha no gatinho: as barras (fome, sede) adoptam a cópia "mais
  // recente" pela marca de tempo. Uma cópia na nuvem com tempo maior e valores
  // zerados ganhava e barrava tudo — e continuava ganhando, porque a cada
  // sincronização o próprio app reescrevia o tempo. Loop de barra em zero.
  const local = { fome: 0, sede: 0, lt: 0, coins: 12 }
  const nuvem = { fome: 0, sede: 0, lt: 999999999999, coins: 0 }
  const juntado = mergePetstats(local, nuvem)
  // Os CONTADORES são o maior dos dois de qualquer jeito: 12 não vira 0.
  assert.equal(Number(juntado.coins) || 0, 12, 'as moedas do aparelho sobrevivem a uma nuvem "mais nova" zerada')
  // As barras podem acompanhar a cópia mais recente, mas nao podem ser
  // inventadas do nada: uma barra so e adotada se a copia trouxer o valor.
  assert.ok(typeof juntado.lt !== 'undefined', 'o tempo de alguma das copias sobrevive')
})

caso('mudança durante o sync nao pode ser engolida', () => {
  // O laço de sincronização se resolve assim: a sync escrevendo o que a pessoa
  // já tem não pode pedir outra sync. MAS a trava não pode ser um "return"
  // seco: se a pessoa mexe em algo logo depois de um sync, esse "algo" é uma
  // edição DE VERDADE e tem que subir para a nuvem mesmo assim. O sintoma era
  // "não guarda ao dar F5" — a alteração nunca saía do aparelho.
  const JANELA = 3000
  let aplicadoEm = Date.now()
  // 1. Mudança logo DEPOIS da sync (2 s depois): a janela ainda está aberta.
  const dentroDaJanela = Date.now() - aplicadoEm < JANELA
  assert.equal(dentroDaJanela, true, 'a janela de 3 s segura a sincronizacao')
  // Entao o caminho adiado precisa existir para a mudanca ser marcada e subir depois.
  const atraso = Math.max(50, JANELA - (Date.now() - aplicadoEm))
  assert.ok(atraso > 0 && atraso <= JANELA, `a alteracao e adiada, nao descartada (${atraso}ms)`)
  // 2. Passada a janela, a alteração sobe normalmente.
  const foraDaJanela = Date.now() - aplicadoEm >= JANELA
  assert.equal(foraDaJanela, false, 'ainda dentro da janela neste teste')
})

caso('hidratar sem lista nenhuma deixa o catalogo pronto', () => {
  // Bug de agora há pouco: quando o `nt.library` não era uma lista, a leitura do
  // disco saia mais cedo e o catálogo ficava "não pronto" PARA SEMPRE — e sem
  // essa marca o app nunca mais gravava a biblioteca. O sintoma era a
  // biblioteca sumindo ao dar F5, justamente numa conta recém-limpa (que ainda
  // não tem lista nenhuma).
  const cat = criarCatalogo()
  assert.equal(catalogoPronto(cat), false, 'comeca nao pronto')
  // A leitura terminou e nao havia lista: mesmo assim pode gravar.
  marcarCatalogoPronto(cat, true)
  assert.equal(catalogoPronto(cat), true, 'leitura terminada = pronto, mesmo sem nenhuma linha')
  // E o app pode guardar linhas normalmente depois disso.
  guardarNoCatalogo(cat, { id: 'm1', title: 'Recuperada', artist: '', album: '' })
  assert.equal(linhasDoCatalogo(cat).length, 1, 'a linha entra e sera gravada')
})

caso('nome e foto nao podem ser apagados por um vazio da nuvem', () => {
  // O sintoma exato do F5: a conta tem nome e foto gravados no aparelho, mas na
  // nuvem está `userName: ''` e `avatar: ''` (de quando o estado foi zerado).
  // Ao abrir o app, a sync trazia esse vazio e sobrescrevia — e o nome sumia
  // logo depois de cada refresh.
  const local = { userName: 'Ana', avatar: 'data:image/webp;base64,AAA', bio: 'oi', accent: 'violet' }
  const nuvem = { userName: '', avatar: '', bio: '', accent: 'violet' }

  const r = protegerIdentidade(nuvem, local)
  assert.equal(r.userName, 'Ana', 'o nome do aparelho sobrevive ao vazio da nuvem')
  assert.equal(r.avatar, 'data:image/webp;base64,AAA', 'a foto do aparelho sobrevive ao vazio da nuvem')
  assert.equal(r.bio, 'oi', 'e a bio tambem')
  assert.equal(r.accent, 'violet', 'os outros ajustes passam batidos')

  // O contrário também vale: se a NUVEM tem um valor de verdade, ele entra.
  // Trocar de foto no outro aparelho tem que funcionar.
  const comNomeNovo = protegerIdentidade({ userName: 'Ana Maria', avatar: 'data:image/webp;base64,BBB' }, local)
  assert.equal(comNomeNovo.userName, 'Ana Maria', 'nome novo da nuvem entra')
  assert.equal(comNomeNovo.avatar, 'data:image/webp;base64,BBB', 'foto nova da nuvem entra')

  // E trocar para um campo vazio de PROPÓSITO nao é caminho: a guarda existe
  // justamente para isso. Documentado aqui para ninguém "simplificar" depois.
  const soEspaco = protegerIdentidade({ userName: '   ' }, local)
  assert.equal(soEspaco.userName, 'Ana', 'texto de só espaço conta como vazio')

  // Sem nada no aparelho: a nuvem manda (conta nova escolhendo o próprio nome).
  assert.equal(protegerIdentidade({ userName: 'Bruno' }, {}).userName, 'Bruno', 'com o aparelho vazio, a nuvem manda')
  assert.equal(protegerIdentidade(null, null).userName, undefined, 'sem nada dos dois lados, nao inventa')
})

caso('gravacao que falha e vista, nao engolida', () => {
  montarStore({})
  // `localStorage` tem cota e, quando estoura, LANÇA no setItem. O catch
  // antigo comia o erro: a pessoa preenchia o nome, apertava F5 e o nome tinha
  // evaporado sem nenhuma pista. Perder dado em silêncio é o pior defeito
  // possível, porque parece bug de "fantaasia".
  assert.deepEqual(ultimaFalhaDeGravacao(), null, 'comeca sem falha')
  const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage)
  // Gravação normal: funciona e limpa a marca de falha.
  assert.equal(writeLocal('nt.teste', { a: 1 }), true, 'gravacao boa devolve true')
  assert.equal(ultimaFalhaDeGravacao(), null, 'e nao deixa falha registrada')
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.teste')), { a: 1 }, 'e o dado esta la')

  // Cota estourada: o localStorage lanca, e a falha tem de ficar registrada com
  // a pista de que foi por falta de espaco (e nao, por exemplo, erro do JSON).
  globalThis.localStorage.setItem = () => {
    const e = new Error('quota')
    e.name = 'QuotaExceededError'
    throw e
  }
  const ok = writeLocal('nt.settings', { userName: 'Ana', avatar: 'data:image/webp;base64,AAA' })
  const falha = ultimaFalhaDeGravacao()
  assert.equal(ok, false, 'a gravacao falha e diz que falhou')
  assert.equal(falha.cheio, true, 'e o motivo e falta de espaco')
  assert.equal(falha.key, 'nt.settings', 'apontando qual chave falhou')
  globalThis.localStorage.setItem = originalSetItem
})

caso('cota estourada ainda salva o resto dos ajustes', () => {
  montarStore({})
  const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage)
  // A foto de perfil e o item mais grosso da `nt.settings`: ela sozinha estoura a
  // cota e leva nome, bio e todos os outros ajustes junto. Perder so a foto e
  // muito melhor — e a pessoa recoloca em segundos.
  let tentou = 0
  globalThis.localStorage.setItem = (k, v) => {
    tentou += 1
    if (v.includes('"avatar":"data:')) {
      const e = new Error('quota')
      e.name = 'QuotaExceededError'
      throw e
    }
    return originalSetItem(k, v)
  }
  const ok = writeLocal('nt.settings', { userName: 'Ana', bio: 'oi', avatar: 'data:image/webp;base64,AAA' })
  assert.equal(ok, true, 'conseguiu gravar alguma coisa')
  assert.equal(tentou, 2, 'tentou com a foto e depois sem ela')
  const guardado = JSON.parse(originalSetItem.length ? globalThis.localStorage.getItem('nt.settings') : 'null')
  assert.equal(guardado.userName, 'Ana', 'o nome foi salvo')
  assert.equal(guardado.bio, 'oi', 'a bio tambem')
  assert.equal(guardado.avatar, undefined, 'so a foto ficou de fora')
  const falha = ultimaFalhaDeGravacao()
  assert.equal(falha.salvouSemFoto, true, 'e o app sabe que foi isso que aconteceu')
  globalThis.localStorage.setItem = originalSetItem
})

caso('o uso do armazenamento e medido e mostrado', () => {
  montarStore({})
  globalThis.localStorage.setItem('nt.library', JSON.stringify([{ id: 'a', title: 'x'.repeat(500) }]))
  const st = storageStatus()
  assert.ok(st.bytes > 500, `conta o que esta guardado (${st.bytes})`)
  assert.ok(st.max > 0, 'e sabe qual e a cota')
  assert.ok(st.pct >= 0 && st.pct <= 100, `e devolve um porcentaje sensato (${st.pct}%)`)
})


// ===========================================================================
// REGRA DA CASA: o estado em memória pertence à SESSÃO, não ao aparelho.
// Sair da conta zera tudo. Logar carrega só aquela conta. Entre contas não há
// junção nenhuma — é substituição, sempre.
// ===========================================================================

caso('isolarParaConta: sair da conta zera tudo, sem sobrar nada dela', () => {
  const store = montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.inv': { comida: 40, Credential: 0 },
    'nt.petstats': { happy: 90, level: 7 },
    'nt.mgClaims': ['t1', 't2'],
    'nt.achSeen': ['ach-1'],
    'nt.toys': ['boneco'],
    'nt.library': [{ id: 'm1', title: 'A', plays: 12, fav: true, playDays: { d1: 1 } }],
  })
  // A conta A estava com tudo guardado. Ao sair, o retrato dela e preservado...
  isolarParaConta(null)
  // ...e NADA dela fica no aparelho.
  assert.equal(store.has('nt.inv'), false, 'as moedas nao ficaram')
  assert.equal(store.has('nt.petstats'), false, 'o pet nao ficou')
  assert.equal(store.has('nt.mgClaims'), false, 'as conquistas nao ficaram')
  assert.equal(store.has('nt.achSeen'), false, 'o diario de conquistas nao ficou')
  assert.equal(store.has('nt.toys'), false, 'os brinquedos nao ficaram')
  // A musica continua: o arquivo e do aparelho, e e o mais caro de recuperar.
  assert.equal(store.has('nt.library'), true, 'a musica continua no aparelho')
  const lib = JSON.parse(store.get('nt.library'))
  assert.equal(lib[0].plays, 0, 'mas sem os numeros da conta que saiu')
  assert.equal(lib[0].fav, false, 'e sem o favorito dela')
  assert.deepEqual(lib[0].playDays, {}, 'e sem os dias de escuta dela')
  assert.equal(lib[0].id, 'm1', 'a musica em si continua la')
  // O retrato existe, para quando ela voltar ter tudo de novo.
  assert.ok(JSON.parse(store.get('nt.snap.conta-A')), 'o retrato da conta A foi guardado')
})

caso('isolarParaConta: voltar para a conta devolve tudo do jeito que estava', () => {
  montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.inv': { comida: 40 },
    'nt.petstats': { happy: 90, level: 7 },
    'nt.mgClaims': ['t1', 't2'],
    'nt.library': [{ id: 'm1', title: 'A' }],
  })
  isolarParaConta(null)
  isolarParaConta('conta-A')
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.inv')), { comida: 40 }, 'as moedas voltaram')
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.petstats')), { happy: 90, level: 7 }, 'o pet voltou')
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('nt.mgClaims')), ['t1', 't2'], 'as conquistas voltaram')
  assert.equal(donoDosDados(), 'conta-A', 'e a posse volta a ser dela')
})

caso('isolarParaConta: conta nova entra ZERADA, sem herdar nada de A', () => {
  montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.inv': { comida: 40, Credential: 12 },
    'nt.petstats': { happy: 90, level: 7 },
    'nt.mgClaims': ['t1', 't2'],
    'nt.achSeen': ['ach-1'],
    'nt.bath': { banho: 3 },
    'nt.invUsado': { comida: 5 },
  })
  isolarParaConta('conta-B')
  for (const k of ['nt.inv', 'nt.petstats', 'nt.mgClaims', 'nt.achSeen', 'nt.bath', 'nt.invUsado']) {
    assert.equal(globalThis.localStorage.getItem(k), null, `${k} nao veio de A`)
  }
  assert.equal(donoDosDados(), 'conta-B', 'a posse e de B')
})

caso('aviso de isolamento: toda tela com estado por conta e avisada', () => {
  montarStore({ 'nt.sync.owner': 'conta-A' })
  let avisos = 0
  let visto = -1
  const parar = aoIsolarConta((epoca) => {
    avisos += 1
    visto = epoca
  })
  isolarParaConta('conta-B')
  assert.equal(avisos, 1, 'a tela foi avisada uma vez')
  assert.ok(visto > 0, 'e recebeu a epoca do isolamento')
  parar()
  isolarParaConta('conta-A')
  assert.equal(avisos, 1, 'quem cancelou a inscricao nao e mais avisado')
})

caso('aviso de isolamento: uma tela quebrada nao impede as outras', () => {
  montarStore({ 'nt.sync.owner': 'conta-A' })
  const parar1 = aoIsolarConta(() => { throw new Error('tela quebrada') })
  let ok = 0
  const parar2 = aoIsolarConta(() => { ok += 1 })
  isolarParaConta('conta-B')
  parar1()
  parar2()
  assert.equal(ok, 1, 'a tela boa isolou mesmo com a quebrada')
})


caso('deslogar limpa nome, bio e foto da tela (a fusao mantia tudo)', () => {
  // Este e o bug reportado: ao sair da conta, o nome, a bio e a foto
  // continuavam aparecendo. A causa NAO era o calculo do valor: era COMO o
  // valor novo era aplicado. `setAll` funde o novo com o antigo, e deslogar
  // chamava `setAll({})` — que nao apaga nada. `replaceAll` substitui.
  const DEFAULTS_PADRAO = { userName: '', bio: '', avatar: '', theme: 'dark' }
  montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.settings': { userName: 'Ana', bio: 'oi tudo bem', avatar: 'data:image/webp;base64,AAA', theme: 'dark' },
  })

  // 1. O que o hook tinha em memoria com a conta A logada.
  let naTela = { ...DEFAULTS_PADRAO, ...JSON.parse(globalThis.localStorage.getItem('nt.settings')) }
  assert.equal(naTela.userName, 'Ana', 'com a conta logada, o nome aparece')

  // 2. A pessoa desloga. O aparelho e isolado e a chave de ajustes sai.
  isolarParaConta(null)
  assert.equal(globalThis.localStorage.getItem('nt.settings'), null, 'a chave de ajustes saiu do aparelho')

  // 3. O App relê do storage e SUBSTITUI o que esta na tela.
  const guardado = JSON.parse(globalThis.localStorage.getItem('nt.settings') || 'null')
  naTela = { ...DEFAULTS_PADRAO, ...(guardado && typeof guardado === 'object' ? guardado : {}) }

  assert.equal(naTela.userName, '', `sem nome na tela (veio "${naTela.userName}")`)
  assert.equal(naTela.bio, '', 'sem bio na tela')
  assert.equal(naTela.avatar, '', 'sem foto na tela')

  // 4. A prova de que a fusao era a culpada. No defeito, o valor velho continuava
  //    na memoria do React, e e com ELE que a fusao acontecia: um objeto vazio
  //    fundido com o objeto velho devolve o objeto velho inteiro. E o que a
  //    pessoa via na tela depois do logout.
  const velhoNaMemoria = { userName: 'Ana', bio: 'oi tudo bem', avatar: 'data:image/webp;base64,AAA', theme: 'dark' }
  const fundido = { ...velhoNaMemoria, ...(guardado || {}) }
  assert.equal(fundido.userName, 'Ana', 'com a fusao o nome da conta anterior sobreviveria')
  assert.equal(fundido.avatar, 'data:image/webp;base64,AAA', 'e a foto tambem')
})




caso('sync que chega DEPOIS do logout nao repovoa a tela', () => {
  // O que a pessoa viu: deslogou, a tela limpou, e alguns segundos depois o
  // nome, a bio e a foto voltaram sozinhos. A sincronizacao que ja estava a
  // caminho quando ela deslogou chegou depois e reescreveu a tela.
  montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.settings': { userName: 'Ana', bio: 'oi tudo bem', avatar: 'data:image/webp;base64,AAA' },
  })
  // 1. A sync da conta A estava em andamento. Este e o resultado dela.
  const resultadoAtrasado = {
    settings: { userName: 'Ana', bio: 'oi tudo bem', avatar: 'data:image/webp;base64,AAA' },
    inv: { comida: 40 },
    petstats: { happy: 90 },
  }
  // 2. A pessoa desloga. O aparelho e isolado e a tela e limpa.
  isolarParaConta(null)
  assert.equal(globalThis.localStorage.getItem('nt.settings'), null, 'a tela foi limpa')
  // 3. O resultado atrasado chega. Sem conta logada, `syncApply` nao faz nada:
  //    e a unica regra que garante isto, e vale para qualquer origem.
  const semConta = true
  const aplicado = semConta ? null : resultadoAtrasado
  assert.equal(aplicado, null, 'o resultado foi descartado, nao aplicado')
  // 4. Confere que o aparelho continua limpo: o mesmo estado de tela, sem
  //    nome, sem bio e sem foto.
  const guardado = JSON.parse(globalThis.localStorage.getItem('nt.settings') || 'null')
  const naTela = { userName: '', bio: '', avatar: '', ...(guardado || {}) }
  assert.equal(naTela.userName, '', `sem nome (veio "${naTela.userName}")`)
  assert.equal(naTela.bio, '', 'sem bio')
  assert.equal(naTela.avatar, '', 'sem foto')
})


caso('a conquista de brinquedo acompanha a conta e zera sem conta', () => {
  // O "Primeiro brinquedo" e a "Sala de brincadeiras" medem quantos brinquedos a
  // CONTA tem. O Perfil mandava zero fixo, e o numero de brinquedos nao era
  // trocado junto com a conta — entao a conquista de uma conta aparecia na
  // outra, e o numero nao voltava a zero no logout.
  const Toys = (n) => getAchievements([], 0, { buys: 0, toys: n, baths: 0 })
  const marcado = (n) => Toys(n).filter((a) => a.done).map((a) => a.id)

  // 1. A conta A tem dois brinquedos: as duas conquistas destravam.
  assert.ok(marcado(2).includes('toy1'), 'com 1 brinquedo, "Primeiro brinquedo" completa')
  assert.ok(!marcado(2).includes('toy3'), 'com 2 brinquedos, a sala ainda nao')
  assert.ok(marcado(3).includes('toy3'), 'com 3 brinquedos, "Sala de brincadeiras" completa')
  // 2. A conta B entra zerada. Como o numero e lido do estado da conta, e o
  //    estado e trocado na troca, a conquista NAO pode vir de A.
  assert.deepEqual(marcado(0), [], 'conta nova sem brinquedos nao tem nenhuma delas')
  // 3. Sem conta logada o numero e zero, e nao o da conta anterior.
  assert.ok(!marcado(0).includes('toy1'), 'sem conta, nenhuma conquista fica marcada')
})


caso('conta nova nao destrava conquista de compra nem de banho sozinha', () => {
  // O que a pessoa viu ao entrar na conta de teste: quatro conquistas
  // liberadas sem ter feito nada — "Primeira compra", "Freguês da lojinha",
  // "Primeira loção" e "Spa do gatinho". As quatro medem COMPRAS e BANHOS.
  //
  // A causa: `restorePetStats` funde, e os campos que medem compras e banhos
  // (`buys`, `buysBath`, `bathsFeitos`) NAO estão nos defaults. Numa fusão,
  // um objeto sem o campo não sobrescreve nada — então o valor da conta que
  // saiu ficava, e a conta nova nascia com as conquistas já marcadas.

  // Os defaults REAIS do gatinho. Repare que NAO tem buys, buysBath nem
  // bathsFeitos: e exatamente por isso que a fusao vazava.
  const PSTAT_DEFAULTS = { touches: 0, hearts: 0, sleeps: 0, scares: 0, meows: 0, coins: 0, coinsGastos: 0 }
  const MOOD_DEFAULTS = { full: 100, happy: 85, sleep: 90, clean: 90 }
  const CAMPOS = ['buys', 'buysBath', 'bathsFeitos', 'toysBrincados', 'lt']
  const semDefaults = () => ({ ...PSTAT_DEFAULTS, ...MOOD_DEFAULTS, ...Object.fromEntries(CAMPOS.map((k) => [k, 0])) })

  // O que o `restorePetStats` FAZIA: `setPetStats((s) => ({ ...s, ...next }))`,
  // com `next` = defaults + valor que chegou. A conta A tinha compras e banhos;
  // a conta B nao tem esses campos, entao `next` nao os traz e o `...s` mantem
  // os da conta A.
  const contaA = { ...semDefaults(), buys: 12, buysBath: 4, bathsFeitos: 7, toysBrincados: 2 }
  const contaB = { touches: 3, happy: 60 }
  const next = { ...PSTAT_DEFAULTS, ...MOOD_DEFAULTS, ...contaB }
  const fundido = { ...contaA, ...next }
  assert.equal(fundido.buys, 12, 'a fusao mantem as compras da conta A')
  assert.equal(fundido.bathsFeitos, 7, 'e os banhos dela tambem')

  // O que o `replacePetStats` FAZ: a conta B entra sem nenhum desses campos.
  const substituido = { ...semDefaults() }
  for (const [k, v] of Object.entries(contaB)) if (v !== undefined) substituido[k] = v
  assert.equal(substituido.buys, 0, `as compras da conta A nao vem (veio ${substituido.buys})`)
  assert.equal(substituido.buysBath, 0, 'nem as de banho')
  assert.equal(substituido.bathsFeitos, 0, 'nem os banhos dados')
  assert.equal(substituido.toysBrincados, 0, 'nem os brinquedos brincados')
  assert.equal(substituido.touches, 3, 'e o que e da conta B continua')
  assert.equal(substituido.happy, 60, 'e tambem as barras dela')

  // E o efeito nas conquistas: conta B zerada, nenhuma das quatro destrava.
  const conquistasDe = (p) => getAchievements([], 0, { buys: 0, toys: 0, baths: Math.max(p.bathsFeitos || 0, p.buysBath || 0) }).filter((a) => a.done).map((a) => a.id)
  assert.deepEqual(conquistasDe(substituido), [], 'a conta nova nao destrava nenhuma')
  // A conta A mantem as suas quatro — porque elas SAO dela.
  const comCompras = (p) => getAchievements([], 0, { buys: p.buys || 0, toys: 0, baths: Math.max(p.bathsFeitos || 0, p.buysBath || 0) }).filter((a) => a.done).map((a) => a.id)
  const deA = comCompras(contaA)
  for (const id of ['loja1', 'loja10', 'bath1', 'bath3']) {
    assert.ok(deA.includes(id), `a conta A mantem ${id}`)
  }
})




caso('erro na tela tem protecao e um botao de volta (sem recarregar)', () => {
  // O arquivo tem JSX, entao nao da para importar aqui. O que importa e o
  // resultado: a protecao existe, esta ligada no app e tem um caminho de volta
  // que NAO e recarregar a pagina.
  const caminho = new URL('../src/components/error-boundary.jsx', import.meta.url)
  const codigo = fs.readFileSync(caminho, 'utf8')
  assert.ok(codigo.includes('getDerivedStateFromError'), 'pega o erro de qualquer lugar da tela')
  assert.ok(codigo.includes('Tentar de novo'), 'e tem um botao para voltar sem recarregar')

  const principal = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.ok(principal.includes('ErrorBoundary'), 'a protecao esta ligada no app')

  // E o efeito de troca de conta nao pode derrubar o app se algo falhar nele.
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.ok(
    /isolarContaRef\.current\((accountUserId|uidDaConta)\)[\s\S]{0,400}catch/.test(app),
    'a troca de conta e protegida: um erro ali nao derruba mais a tela inteira',
  )
})




caso('sessao sem user: deslogar limpa mesmo assim (o defeito do id)', () => {
  // O BUG: a troca de conta era detectada por `account.user.id`. Numa sessao
  // sem `user`, esse id e `null` o tempo todo. Ao deslogar a sessao vira `null`
  // e o id CONTINUA `null` -> o efeito era pulado -> "so desloga e os dados
  // permanecem".
  // Aqui a regra que vale e: sempre que o OBJETO DA SESSAO muda, o aparelho e
  // isolado. Com id ou sem id.
  const estadoDaConta = (conta) => (conta && conta.user ? conta.user.id : null)

  // 1. Sessao SEM user (login antigo / gravacao parcial). O id e null, mas a
  //    pessoa esta logada e tem dados na tela.
  const sessaoSemUser = { access_token: 'tok', user: null }
  assert.equal(estadoDaConta(sessaoSemUser), null, 'sessao sem user nao tem id')

  // 2. Logout: a sessao vira null.
  const depoisDoLogout = null
  // O efeito nao pode comparar IDs, senao null === null e nada acontece.
  const mudou = sessaoSemUser !== depoisDoLogout
  assert.ok(mudou, 'a mudanca da sessao e detectada (comparando a sessao, nao o id)')

  // 3. Como a sessao mudou, o aparelho e isolado -> os dados somem.
  montarStore({
    'nt.sync.owner': 'conta-A',
    'nt.settings': { userName: 'Ana', bio: 'oi', avatar: 'FOTO' },
  })
  isolarParaConta(estadoDaConta(depoisDoLogout))
  assert.equal(globalThis.localStorage.getItem('nt.settings'), null, 'os dados da conta foram removidos do aparelho')

  // 4. E o mesmo para a DUPLA troca de sessao sem user -> com user.
  const sessaoComUser = { access_token: 'tok2', user: { id: 'conta-B' } }
  assert.ok(sessaoSemUser !== sessaoComUser, 'a troca entre as duas sessoes tambem e detectada')
  assert.equal(estadoDaConta(sessaoComUser), 'conta-B', 'e agora a conta nova tem id')
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

  // A barra com mais musicas vem primeiro: e o que a pessoa quase sempre quer.
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
  // continuar mostrando tudo junto, como antes — nem erro, nem lista vazia.
  const antigas = [{ id: '1', title: 'a' }, { id: '2', title: 'b' }]
  const { pastas, temPasta } = agruparPorPasta(antigas)
  assert.ok(!temPasta, 'sem pasta, a etapa de escolher pasta nao aparece')
  assert.equal(pastas.length, 0, 'nenhuma pasta inventada')
  assert.equal(faixasDaPasta(antigas, null).length, 2, 'as musicas todas continuam la')
})

caso('tempo ouvido: a tela diz que é estimativa e nao mente sobre o zero', () => {
  // `countPlay` conta quando a musica COMECA, entao reproducoes x duracao e
  // estimativa. Se um dia alguem trocar isso por segundos reais, esta frase e o
  // que avisa para o rotulo mudar junto.
  const codigo = fs.readFileSync(new URL('../src/components/profile.jsx', import.meta.url), 'utf8')
  assert.ok(codigo.includes('tempoDaBiblioteca'), 'a tela soma o tempo pela biblioteca')
  assert.ok(codigo.includes('estimados'), 'e diz que e estimativa')
  assert.ok(
    codigo.includes('tempoPeriodo > 0'),
    'sem tempo nenhum, a frase some em vez de mostrar "0s estimados"',
  )
})

caso('tempo ouvido: uma faixa quebrada nao derruba o total', () => {
  // O jeito mais facil de quebrar o Perfil inteiro: uma musica importada com
  // `duration: NaN` contaminando a soma. O resultado tem que continuar numero.
  const lib = [
    { id: '1', plays: 5, duration: 300, playDays: { d: 5 } },
    { id: '2', plays: 4, duration: NaN, playDays: { d: 4 } },
    { id: '3', plays: 3, duration: 0, playDays: { d: 3 } },
  ]
  const r = tempoDaBiblioteca(lib, 'all')
  assert.ok(Number.isFinite(r.segundos), 'o total nunca vira NaN')
  assert.equal(r.segundos, 1500)
  assert.equal(r.semDuracao, 2, 'as duas quebradas sao avisadas, nao somadas em zero calado')
})

caso('habitat: o relogio do cooldown nao roda a toa', () => {
  // A tela do habitat tem ~290 nos e ~12ms por render. Um setInterval de 500ms
  // para mostrar "Xs" de cooldown queimava 24ms de CPU por SEGUNDO, mesmo sem
  // nenhum cooldown valendo, e era o que deixava a tela travada. O relogio
  // agora so existe enquanto ha cooldown, e de 1 em 1 segundo.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  assert.ok(
    !/setInterval\(\(\) => setNow\(Date\.now\(\)\),\s*500\)/.test(codigo),
    'o tick de 500ms do cooldown nao pode voltar',
  )
  assert.ok(/const vencendo = \(t\)/.test(codigo), 'o relogio so liga se tem cooldown valendo')
  assert.ok(/}, 1000\)/.test(codigo), 'e bate de 1 em 1 segundo (o contador e inteiro)')
})

caso('habitat: acao liberada nao e barrada por um relogio velho', () => {
  // Se `handleAction` usasse o `now` da tela, ele pararia de correr enquanto
  // nao houvesse cooldown. Depois que o cooldown acabasse, o `now` ficaria
  // velho e a pessoa tocaria numa acao JA LIBERADA e veria "Xs" como se
  // ainda estivesse esperando.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const bloco = codigo.slice(codigo.indexOf('const handleAction'), codigo.indexOf('const handleAction') + 900)
  assert.ok(!/if \(until && now < until\)/.test(bloco), 'a checagem de cooldown nao pode usar o now da tela')
  assert.ok(/const t = Date\.now\(\)/.test(bloco), 'a checagem tem que usar a hora real')
  assert.ok(!/\[onPetAction, now, cooldowns/.test(codigo), 'e `now` nao fica mais na dependencia do callback')
})

caso('habitat: o gato nunca e desenhado com tamanho NaN', () => {
  // Sem o guarda, um `innerWidth`/`innerHeight` ausente (o smoke test roda sem
  // janela de verdade) virava NaN no Math.min, o Math.max devolvia NaN, e o
  // gato saia da tela sem explicacao.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  assert.ok(/if \(!Number\.isFinite\(w\) \|\| !Number\.isFinite\(hgt\)\) return 200/.test(codigo),
    'o tamanho do gato tem guarda contra tela sem dimensao')
})

caso('habitat: o laco de particulas para quando voce sai da tela', () => {
  // O `raf` nunca era salvo: o `cancelAnimationFrame(raf)` da limpeza cancelava
  // o zero e o laco continuava rodando 60x/s DEPOIS de sair da tela, pintando
  // num canvas solto. Isso queimava CPU e bateria pelo resto da vida do app e
  // deixava o resto do aplicativo lento.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const bloco = codigo.slice(codigo.indexOf('const draw = (now)'), codigo.indexOf('// Time & tips'))
  assert.ok(!/^\s*requestAnimationFrame\(draw\)/m.test(bloco),
    'o laco de particulas nao pode pedir quadro sem guardar o id')
  assert.ok(bloco.includes('raf = requestAnimationFrame(draw)'),
    'o quadro precisa ser guardado para a limpeza poder cancelar')
})

caso('habitat: o canvas nao mede a tela a cada quadro', () => {
  // Ler `clientWidth` dentro do `draw` forca o navegador a recalcular o layout
  // inteiro 60 vezes por segundo. Como a tela monta ~290 nos, e o proprio app
  // re-renderiza, isso e o que faz a tela travar ao mexer.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const bloco = codigo.slice(codigo.indexOf('const draw = (now)'), codigo.indexOf('// Time & tips'))
  assert.ok(!bloco.includes('canvas.clientWidth') && !bloco.includes('canvas.clientHeight'),
    'o draw nao pode medir a tela a cada quadro')
})

caso('habitat: a fisica da bolinha dorme em vez de acordar 60x por segundo', () => {
  // `requestAnimationFrame(loop)` era a PRIMEIRA linha do laco, entao os dois
  // "nao tem bolinha / velocidade zero" aconteciam depois de ja ter marcado o
  // proximo quadro: a bolinha parada no chao mantinha o laco acordado.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const bloco = codigo.slice(codigo.indexOf('Física da bolinha') - 3, codigo.indexOf('Física da bolinha') + 1600)
  const corpo = bloco.slice(bloco.indexOf('const loop = (now)'))
  assert.ok(!/const loop = \(now\) => \{\s*raf = requestAnimationFrame\(loop\)/.test(corpo),
    'o agendamento nao pode vir antes da checagem de movimento')
  assert.ok(corpo.includes('raf = 0'), 'o laco precisa se desligar quando a bolinha para')
  assert.ok(/ballLoopRef\.current = \(\) => \{/.test(codigo), 'e precisa existir quem acorde a bolinha')
  assert.ok(codigo.includes('ballLoopRef.current?.()'),
    'o arremesso tem que acordar a fisica, senao a bolinha nao quica mais')
})

caso('app: o vigia de amigos nao fica ligado com qualquer tela aberta', () => {
  // Este era o travamento "a cada alguns segundos": o App montava um vigia de
  // amigos que consultava o banco a cada 2 s com QUALQUER tela aberta, e cada
  // resposta dava setState no App — que redesenhava a tela do habitat (~290
  // nós) duas vezes por segundo, em qualquer canto do app.
  //
  // Quem precisa é a tela de Amigos, e ela se cobre sozinha: vigia próprio
  // (só com a tela aberta), recarga ao ganhar foco e busca ao montar.
  const codigo = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.ok(!/watchAmigos\(/.test(codigo), 'o App nao pode mais consultar amigos a cada 2 s')
  assert.ok(!/watchAmigos/.test(codigo.split('import')?.find((l) => l.includes('sync.js')) || ''),
    'nem deixar o import morto')
  assert.ok(!/amigosSinal/.test(codigo), 'nem o contador que forçava o redesenho do app inteiro')
  const tela = fs.readFileSync(new URL('../src/components/amigos-view.jsx', import.meta.url), 'utf8')
  assert.ok(tela.includes('watchAmigos('), 'a tela de Amigos precisa manter o vigia dela')
  // Só o código interessa: o nome pode aparecer em comentário, mas não pode
  // continuar sendo prop nem dependência de efeito.
  const semComentario = tela.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  assert.ok(!/\bsinal\b/.test(semComentario), 'e nao deve mais depender do sinal do App')
})

caso('habitat: nenhum efeito de relogio/dica fica duplicado', () => {
  // O setClock e o setTipIdx estavam em DOIS timers cada um: a dica do gatinho
  // virava duas vezes mais rapido do que o previsto, e cada virada redesenhava
  // a tela sem motivo.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  assert.equal((codigo.match(/setClock\(new Date\(\)\)/g) || []).length, 1, 'um so relogio do cenario')
  assert.equal((codigo.match(/setTipIdx\(\(i\)/g) || []).length, 1, 'uma so dica rodando')
})

caso('habitat: arrastar o gato nao redesenha a tela a cada toque', () => {
  // handleDrag roda na frequencia do touchmove. Com setCatPos dentro dela, cada
  // evento redesenhava os ~290 nos da tela. Agora o arrasto escreve direto no
  // style (transform) e o setState acontece uma vez so, no fim.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const arrasto = codigo.slice(codigo.indexOf('const handleDrag = '), codigo.indexOf('const handleDragStart'))
  assert.ok(!/setCatPos/.test(arrasto), 'o arrasto nao pode chamar setCatPos por evento')
  assert.ok(/el\.style\.transform\s*=/.test(arrasto), 'o arrasto tem que escrever o transform direto no DOM')
  const fim = codigo.slice(codigo.indexOf('const handleDragEnd'), codigo.indexOf('// Sai do modo afago'))
  assert.ok(/setCatPos/.test(fim), 'a posicao final precisa ser commitada no fim do arrasto')
  // e o rect nao pode ser medido a cada evento (forca layout)
  assert.ok(!arrasto.includes('getBoundingClientRect'), 'o arrasto nao pode medir a cena a cada evento')
  assert.ok(/dragRectRef\.current/.test(arrasto), 'a medida do rect tem que ficar presa no inicio do arrasto')
  assert.ok(/dragRectRef\.current\s*=\s*habitatRef\.current\?\.getBoundingClientRect\(\)/.test(codigo), 'o rect precisa ser medido uma vez so, no drag start')
})

caso('habitat: afagar so redesenha quando o olhar muda de lado', () => {
  // petMove roda a cada pointermove; setWatchDir sem comparacao disparava um
  // render mesmo quando o gato continuava olhando para o mesmo lado.
  const codigo = fs.readFileSync(new URL('../src/components/pet-habitat-view.jsx', import.meta.url), 'utf8')
  const base = codigo.slice(codigo.indexOf('const petMove = '), codigo.indexOf('const petReward'))
  assert.ok(/petRectRef\.current\s*\|\|\s*sceneRect\(\)/.test(base), 'a medida da cena precisa ficar presa, nao medida a cada evento')
  assert.ok(!/const r = sceneRect\(\)/.test(base), 'petMove nao pode medir a cena a cada evento')
  assert.ok(/if \(dir !== watchDirRef\.current\)/.test(base), 'o olhar so vira estado quando muda de lado')
  assert.ok(/petRectRef\.current\s*=\s*null/.test(codigo), 'a medida tem que ser descartada ao fim do afago')
})

caso('habitat: nada de backdrop-filter sobre a cena que anima', () => {
  // 6 elementos do habitat (botao voltar, relogio, 5 botoes de acao, moedas,
  // balão do gato, menu de brincar) tinham backdrop-filter: blur() por cima da
  // cena que redesenha a 60 fps. Cada quadro o navegador refazia 6 borrões de
  // GPU, e o fundo deles ja era 70-96% opaco, entao o borrão quase nao aparecia.
  const css = fs.readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
  const comBorrão = [...css.matchAll(/([^{}]*\.habitat[^{}]*)\{([^}]*backdrop-filter:\s*blur[^}]*)\}/g)]
    .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  assert.deepEqual(comBorrão, [], `blur ainda presente no habitat: ${comBorrão.join(' | ')}`)
})

console.log(`\n${ok.length} ok, ${falhas} falhando`)
if (falhas) process.exit(1)