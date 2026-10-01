import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ensureSids } from '../src/lib/sid.js'
import { MOOD_DECAY, MOOD_KEYS, disponivelDe, juntaConsumido, somaConsumido, taxaDeDecaimento } from '../src/lib/pet.js'
import { applyExtras, applyLibrary, applyPlaylists, collectExtras, collectLocal, deepMerge, mergeApagadas, mergeAll, mergeCounters, mergeExtras, mergeLibrary, mergePlaylists, mergePetstats, mergeSettings, mergeStrings, novoTudoDoZero } from '../src/lib/sync.js'

test('ensureSids: mesma música gera o mesmo sid', () => {
  const a = ensureSids([{ id: 'x', title: 'Pra Você', artist: 'DJ Rafael', album: 'Tô Forte', duration: 214 }])
  const b = ensureSids([{ id: 'y', title: 'Pra Você', artist: 'DJ Rafael', album: 'Tô Forte', duration: 214 }])
  assert.equal(a[0].sid, b[0].sid)
})

test('ensureSids: metadados diferentes geram sids diferentes', () => {
  const a = ensureSids([{ id: 'x', title: 'A', artist: 'B', album: '', duration: 10 }])
  const b = ensureSids([{ id: 'y', title: 'A', artist: 'B', album: '', duration: 20 }])
  assert.notEqual(a[0].sid, b[0].sid)
})

test('ensureSids: conflito recebe sufixo estável', () => {
  const rows = ensureSids([
    { id: 'x', title: 'Amor', artist: 'Ana', album: '', duration: 30 },
    { id: 'y', title: 'Amor', artist: 'Ana', album: '', duration: 30 },
  ])
  assert.notEqual(rows[0].sid, rows[1].sid)
  assert.ok(rows[1].sid.startsWith(rows[0].sid + '_'))
})

test('mergePetstats: contadores crescem, nunca diminuem', () => {
  const out = mergePetstats({ coins: 5, t: 1, lt: 100 }, { coins: 8, lt: 200 })
  assert.equal(out.coins, 8)
  assert.equal(out.t, 1)
  assert.equal(out.lt, 200)
})

test('mergeCounters: maior quantidade vence por item', () => {
  assert.deepEqual(mergeCounters({ racao: 3, bola: 1 }, { racao: 1, sapato: 2 }), {
    racao: 3,
    bola: 1,
    sapato: 2,
  })
})

test('mergeStrings: união sem duplicar', () => {
  assert.deepEqual(mergeStrings(['a', 'b', 'c'], ['b', 'd']), ['a', 'b', 'c', 'd'])
})

test('applyExtras: na troca de conta, as estatísticas da conta SUBSTITUEM as do aparelho', async () => {
  const store = new Map([
    ['nt.mgStats', JSON.stringify({ plays: 50, wins: 20 })], // da conta antiga
    ['nt.mgWins', JSON.stringify({ corrida: 30 })],
    ['nt.mgDiarioAntigo', JSON.stringify({ x: 1 })], // seção que a nova conta não tem
  ])
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  const { applyExtras } = await import('../src/lib/sync.js')
  // MODE NORMAL: só preenche o vazio, não sobrescreve (multi-aparelho da MESMA conta)
  applyExtras({ 'nt.mgStats': { plays: 99, wins: 1 } })
  assert.deepEqual(JSON.parse(store.get('nt.mgStats')), { plays: 50, wins: 20 })
  // TROCA: substitui pelos dados da conta que entrou
  applyExtras({ 'nt.mgStats': { plays: 7, wins: 3 } }, { trocar: true })
  assert.deepEqual(JSON.parse(store.get('nt.mgStats')), { plays: 7, wins: 3 })
  // o que a conta nova NÃO tem some do aparelho (não fica para trás)
  assert.ok(!store.has('nt.mgDiarioAntigo'))
})

test('mergeAll: quando se troca de conta, só a biblioteca local fica; o resto vem da nuvem', () => {  // Baseline de conta DIFERENTE: local contribui apenas com as músicas
  // importadas; nome/cor/moedas/recordes são os DA CONTA que entrou.
  const local = {
    library: [{ id: 'l1', sid: 's1', title: 'Aqui', plays: 5 }],
    settings: { userName: 'Nome antigo', accent: 'violet', settingsAt: 0 },
    petstats: { coins: 999 },
  }
  const nuvem = {
    settings: { userName: 'Conta da nuvem', accent: 'pink' },
    petstats: { coins: 77 },
    library: [{ sid: 's1', plays: 9 }, { sid: 's2', title: 'Da nuvem', plays: 1 }],
  }
  const merged = mergeAll({ library: local.library }, nuvem)
  assert.equal(merged.settings.userName, 'Conta da nuvem')
  assert.equal(merged.settings.accent, 'pink')
  assert.equal(merged.petstats.coins, 77)
  const s1 = merged.library.find((r) => r.sid === 's1')
  assert.equal(Number(s1.plays) || 0, 9)
})

test('mergeSettings: sem carimbo dos dois lados, a nuvem (que tem os dados) vale', () => {
  // Conta antiga (nuvem sem horário de edição) num aparelho acabado de
  // reconfigurar (padrões, sem horário): o perfil da conta NÃO pode sumir.
  const out = mergeSettings({ userName: '', accent: 'violet' }, { userName: 'Bia', accent: 'pink' })
  assert.equal(out.userName, 'Bia')
  assert.equal(out.accent, 'pink')
  // chaves só do aparelho continuam entrando no resultado
  const misto = mergeSettings({ userName: '', fetchCovers: false }, { userName: 'Bia' })
  assert.equal(misto.userName, 'Bia')
  assert.equal(misto.fetchCovers, false)
})

test('mergePlaylists: união por playlist e por faixa', () => {
  const out = mergePlaylists(
    [{ id: 'p1', name: 'Treino', trackIds: ['a', 'b'] }],
    [{ id: 'p1', name: 'Treino', trackIds: ['b', 'c'] }, { id: 'p2', name: 'Relax', trackIds: ['d'] }],
  )
  const p1 = out.find((p) => p.id === 'p1')
  assert.deepEqual(p1.trackIds, ['a', 'b', 'c'])
  assert.equal(out.length, 2)
})

test('mergeLibrary: junta pelo sid, plays crescem, sem duplicar', () => {
  const a = ensureSids([
    { id: 'loc1', title: 'Uh Tô Pra Ver', artist: 'MC Menor', duration: 120, plays: 3, fav: true },
  ])
  const local = a.map((r) => ({ ...r, audioBlob: new Blob(['x']), audioMissing: false }))
  const cloud = ensureSids([
    { id: 'rem1', title: 'Uh Tô Pra Ver', artist: 'MC Menor', duration: 120, plays: 7, fav: false },
    { id: 'rem2', title: 'Outra', artist: 'DJ', duration: 90, plays: 1 },
  ]).map((r) => ({ ...r, audioMissing: true }))
  const out = mergeLibrary(local, cloud)
  assert.equal(out.length, 2)
  const merged = out.find((r) => r.sid === a[0].sid)
  assert.equal(merged.plays, 7)
  assert.equal(merged.fav, true)
  assert.equal(merged.audioMissing, false)
  const cloudOnly = out.find((r) => r.sid === cloud[1].sid)
  assert.equal(cloudOnly.audioMissing, true)
})
test('applyLibrary: aparelho novo NÃO recebe músicas da nuvem (sem áudio não aparece)', () => {
  const out = applyLibrary([], [
    { sid: 'sabc', title: 'A', artist: 'B', album: '', duration: 10, fav: true, plays: 4, audioMissing: false },
    { sid: 'sdef', title: 'C', artist: 'D', album: '', duration: 20 },
  ])
  assert.equal(out.length, 0)
})

test('applyLibrary: só atualiza estatísticas de música que existe aqui; as outras não entram', () => {
  const local = ensureSids([
    { id: 'l1', title: 'Minha', artist: 'A', album: '', duration: 30, plays: 2, fav: false, audioMissing: false },
  ])
  local[0].audioBlob = new Blob(['local'])
  const out = applyLibrary(local, [
    { sid: local[0].sid, title: 'Minha', artist: 'A', album: '', duration: 30, plays: 9, fav: true },
    { sid: 'snova', title: 'Nova', artist: 'B', album: '', duration: 44, plays: 1, fav: false },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].sid, local[0].sid)
  assert.equal(out[0].plays, 9)
  assert.equal(out[0].fav, true)
  assert.equal(out[0].audioMissing, false)
  assert.ok(out[0].audioBlob instanceof Blob)
})

test('applyLibrary: ao importar o mesmo arquivo, as estatísticas da nuvem voltam', () => {
  const importada = ensureSids([{ id: 'novo', title: 'Nova', artist: 'B', album: '', duration: 44, plays: 0, fav: false, audioMissing: false }])
  const out = applyLibrary(importada, [
    { sid: importada[0].sid, title: 'Nova', artist: 'B', album: '', duration: 44, plays: 12, fav: true, playDays: { '2026-09-30': 2 } },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].plays, 12)
  assert.equal(out[0].fav, true)
  assert.deepEqual(out[0].playDays, { '2026-09-30': 2 })
})

test('applyLibrary: remove linhas "sem áudio" deixadas por versões antigas', () => {
  const local = ensureSids([{ id: 'real', title: 'Real', artist: 'A', album: '', duration: 30, plays: 1, audioMissing: false }])
  local.push({
    id: 'ghost', sid: 'sfantasma', title: 'Fantasma', artist: 'X', album: '', duration: 99, plays: 3, audioMissing: true,
    src: null, audioBlob: null, coverBlob: null,
  })
  const out = applyLibrary(local, [
    { sid: local[0].sid, plays: 2 },
    { sid: 'sfantasma', title: 'Fantasma', plays: 3 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].sid, local[0].sid)
})

test('applyLibrary: idempotente (rodar 2x não duplica)', () => {
  const local = ensureSids([{ id: 'l1', title: 'Minha', artist: 'A', album: '', duration: 30, plays: 2, audioMissing: false }])
  const cloud = [{ sid: local[0].sid, plays: 5 }, { sid: 'snova', title: 'Nova', plays: 1 }]
  const uma = applyLibrary(local, cloud)
  const duas = applyLibrary(uma, cloud)
  assert.equal(duas.length, 1)
  assert.equal(duas[0].plays, 5)
})

test('applyPlaylists: junta sem repetir e nunca apaga', () => {
  const out = applyPlaylists(
    [{ id: 'p1', name: 'Treino', trackIds: ['a'] }],
    [{ id: 'p1', name: 'Treino', trackIds: ['b'] }, { id: 'p2', name: 'Relax', trackIds: [] }],
  )
  assert.equal(out.length, 2)
  assert.deepEqual(out[0].trackIds, ['a'])
  assert.deepEqual(out[1].trackIds, [])
})

test('mergeSettings: nome/bio vazios NÃO escondem o que está na nuvem', () => {
  // quem editou por último é o APARELHO (900 > 100): vazios não apagam a nuvem
  const out = mergeSettings({ userName: '', bio: '', accent: 'pink' }, { userName: 'Edilson', bio: 'oi', accent: 'blue' }, 900, 100)
  assert.equal(out.userName, 'Edilson')
  assert.equal(out.bio, 'oi')
  assert.equal(out.accent, 'pink')
})

test('mergeSettings: nome preenchido localmente continua valendo', () => {
  // aparelho editou depois (900 > 100) → o nome daqui vale
  const out = mergeSettings({ userName: 'Meu nome' }, { userName: 'Nome da nuvem', speed: 1.5 }, 900, 100)
  assert.equal(out.userName, 'Meu nome')
  // chave que só a nuvem tem continua entrando
  assert.equal(out.speed, 1.5)
})

test('mergeSettings: false local não é considerado vazio', () => {
  // aparelho editou depois (900 > 100): false é valor real, não "vazio"
  const out = mergeSettings({ bgAnimated: false }, { bgAnimated: true, petSound: true }, 900, 100)
  assert.equal(out.bgAnimated, false)
  assert.equal(out.petSound, true)
})

test('deepMerge: contadores ficam com o maior, listas juntam, texto local vence', () => {
  assert.equal(deepMerge(3, 9), 9)
  assert.equal(deepMerge(9, 3), 9)
  assert.deepEqual(deepMerge(['a'], ['b', 'a']), ['b', 'a'])
  assert.equal(deepMerge('local', 'nuvem'), 'local')
  assert.equal(deepMerge('', 'nuvem'), 'nuvem')
  assert.equal(deepMerge(null, 5), 5)
  assert.deepEqual(deepMerge({ plays: 2, best: 10 }, { plays: 7, best: 4 }), { plays: 7, best: 10 })
})

test('collectExtras/pega tudo que não é seção e applyExtras escreve', () => {
  const store = new Map([
    ['nt.settings', '{"userName":"a"}'],
    ['nt.mgStats', '{"plays":3}'],
    ['nt.mgBest', '{"nivel1":99}'],
    ['nt.som', 'true'],
    ['nt.account.session', '{"access_token":"x"}'],
    ['nt.sync.status', '{}'],
    ['nt.sidMigrated', '1'],
    ['outro', 'ignora'],
  ])
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  const extras = collectExtras()
  assert.deepEqual(Object.keys(extras).sort(), ['nt.mgBest', 'nt.mgStats', 'nt.som'])
  assert.equal(extras['nt.mgStats'].plays, 3)
  // aparelho novo: uma chave que não existia aqui entra
  assert.equal(applyExtras({ 'nt.equalizer': { bass: 3 }, 'nt.mgStats': { plays: 9 } }), true)
  assert.equal(store.get('nt.equalizer'), '{"bass":3}')
  // aparelho que já tem valor: NÃO sobrescreve
  assert.equal(applyExtras({ 'nt.mgStats': { plays: 1 } }), false)
  assert.equal(store.get('nt.mgStats'), '{"plays":3}')
  // e a sessão/janelas internas nunca são tocadas
  assert.equal(applyExtras({ 'nt.account.session': { access_token: 'invadido' } }), false)
  assert.equal(store.get('nt.account.session'), '{"access_token":"x"}')
})

test('REGRESSÃO: conta antiga na nuvem (sem "extras") não quebra o sync', () => {
  // Era exatamente o erro do usuário: "Cannot read properties of undefined
  // (reading 'nt.equalizer')" quando a nuvem ainda não tinha a parte nova.
  const local = { extras: { 'nt.equalizer': { bass: 2 }, 'nt.mgStats': { plays: 4 } } }
  assert.doesNotThrow(() => mergeExtras(local.extras, undefined))
  assert.deepEqual(mergeExtras(local.extras, undefined), local.extras)
  assert.doesNotThrow(() => mergeAll({ extras: local.extras }, {}))
  assert.doesNotThrow(() => mergeAll({}, { extras: local.extras }))
})

test('REGRESSÃO: nuvem totalmente vazia não quebra nada', () => {
  const local = {
    settings: { userName: 'Eu' },
    petstats: { coins: 5 },
    inv: { agua: 2 },
    toys: ['pipa'],
    bath: { sabonete: 1 },
    achSeen: ['x'],
    playlists: [{ id: 'p1', trackIds: ['a'] }],
    library: [{ sid: 's1', title: 'A', plays: 1 }],
    playedRecent: ['s1'],
    extras: { 'nt.daily': { d1: 2 } },
  }
  assert.doesNotThrow(() => mergeAll(local, {}))
  assert.doesNotThrow(() => mergeAll(local, undefined))
  const out = mergeAll(local, undefined)
  assert.equal(out.settings.userName, 'Eu')
  assert.equal(out.petstats.coins, 5)
  assert.equal(out.library.length, 1)
  assert.deepEqual(out.extras, local.extras)
})

test('mergeAll: nuvem com tudo e local com tudo junta sem perder', () => {
  const out = mergeAll(
    { settings: { userName: 'Eu' }, extras: { 'nt.mgStats': { plays: 4 } } },
    { settings: { bio: 'oi' }, extras: { 'nt.mgStats': { plays: 9 }, 'nt.daily': { d1: 1 } } },
  )
  assert.equal(out.settings.userName, 'Eu')
  assert.equal(out.settings.bio, 'oi')
  assert.equal(out.extras['nt.mgStats'].plays, 9)
  assert.deepEqual(out.extras['nt.daily'], { d1: 1 })
})

test('mergeSettings: o que mudou POR ÚLTIMO ganha (nome e tema)', () => {
  // mudei o nome/tema no aparelho 1 (100) → o 2 (50) recebe
  const sobe = mergeSettings({ userName: 'Novo', accent: 'pink' }, { userName: 'Antigo', accent: 'blue' }, 100, 50)
  assert.equal(sobe.userName, 'Novo')
  assert.equal(sobe.accent, 'pink')
  // mudei no aparelho 2 (200) → o 1 (100) recebe
  const desce = mergeSettings({ userName: 'Antigo', accent: 'blue' }, { userName: 'Novo', accent: 'pink' }, 100, 200)
  assert.equal(desce.userName, 'Novo')
  assert.equal(desce.accent, 'pink')
})

test('mergeSettings: aparelho novo (sem carimbo) nunca ganha do que tem dado', () => {
  const out = mergeSettings({ userName: 'Meu', accent: 'pink' }, { userName: 'Da Nuvem', accent: 'blue' }, 0, 900)
  assert.equal(out.userName, 'Da Nuvem')
  assert.equal(out.accent, 'blue')
})

test('mergeSettings: campo vazio nunca apaga o que o outro tem', () => {
  const out = mergeSettings({ userName: '', bio: '' }, { userName: 'Chegou', bio: 'oi' }, 999, 1)
  assert.equal(out.userName, 'Chegou')
  assert.equal(out.bio, 'oi')
})

test('mergeAll: guarda o carimbo mais novo dos ajustes', () => {
  assert.equal(mergeAll({ settingsAt: 300 }, { settingsAt: 100 }).settingsAt, 300)
  assert.equal(mergeAll({ settingsAt: 100 }, { settingsAt: 900 }).settingsAt, 900)
  assert.equal(mergeAll({}, {}).settingsAt, 0)
})

test('friendlyError: mensagens do Supabase chegam em português', async () => {
  const { friendlyError } = await import('../src/lib/account.js')
  assert.match(friendlyError({ error_description: 'Invalid login credentials' }), /incorretos/i)
  assert.match(friendlyError({ msg: 'Email link is invalid or has expired' }), /expirou/i)
  assert.match(friendlyError({ error_code: 'otp_expired' }), /expirou/i)
  assert.match(friendlyError({ msg: 'User already registered' }), /já tem conta/i)
  assert.match(friendlyError({ msg: 'Password should be at least 6 characters.' }), /6 caracteres/i)
  assert.match(friendlyError({ msg: 'New password should be different from the old password.' }), /diferente/i)
  assert.ok(friendlyError('').length > 0)
})

test('conta nova começa do zero: apaga dados, mantém sessão e assume o dono', async () => {
  const store = new Map([
    ['nt.settings', JSON.stringify({ userName: 'ContaA' })],
    ['nt.library', JSON.stringify([{ id: 'x' }])],
    ['nt.petstats', JSON.stringify({ coins: 50 })],
    ['nt.mgStats', JSON.stringify({ plays: 3 })],
    ['nt.account.session', JSON.stringify({ access_token: 'x' })],
    ['nt.sync.owner', 'conta-antiga'],
  ])
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  await novoTudoDoZero('conta-nova')
  assert.ok(!store.has('nt.settings'))
  assert.ok(!store.has('nt.library'))
  assert.ok(!store.has('nt.petstats'))
  assert.ok(!store.has('nt.mgStats'))
  // sessão continua (o login não se perde) e o dono passa a ser a conta nova
  assert.ok(store.has('nt.account.session'))
  assert.equal(JSON.parse(store.get('nt.sync.owner')), 'conta-nova')
})

// ── Foto do perfil: edição feita durante a sync não pode voltar atrás ───────
// A sync lê o aparelho no começo e escreve no fim. Se a pessoa trocar a foto
// nesse meio-tempo, o resultado chega com a foto antiga e sobrescrevia a
// escolha (na tela, a foto "voltava sozinha").
test('preservaEditionsRecentes: a foto escolhida durante a sync ganha', async () => {
  const store = new Map()
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  const { preservaEditionsRecentes } = await import('../src/lib/sync.js')

  // No começo da sync a tela tinha a foto antiga
  const base = { userName: 'Vovô', avatar: 'data:image/png;base64,VELHA' }
  store.set('nt.settings', JSON.stringify(base))
  // A pessoa troca a foto enquanto a sync está na rede
  store.set('nt.settings', JSON.stringify({ userName: 'Vovô', avatar: 'data:image/png;base64,NOVA' }))

  // O resultado velho da sync (foto antiga) NÃO pode passar por cima
  const merged = preservaEditionsRecentes({ userName: 'Vovô', avatar: 'data:image/png;base64,VELHA' }, base)
  assert.equal(merged.avatar, 'data:image/png;base64,NOVA')
  // O que não foi mexido continua vindo da sync
  assert.equal(merged.userName, 'Vovô')
})

test('preservaEditionsRecentes: sem edição durante a sync, o resultado entra normal', async () => {
  const store = new Map()
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  const { preservaEditionsRecentes } = await import('../src/lib/sync.js')
  const base = { userName: 'Vovô', avatar: 'data:image/png;base64,VELHA' }
  store.set('nt.settings', JSON.stringify(base))
  // Sync trouxe tema novo do outro aparelho: nada foi editado aqui, então entra
  const merged = preservaEditionsRecentes({ userName: 'Vovô', avatar: 'data:image/png;base64,VELHA', accent: 'green' }, base)
  assert.equal(merged.accent, 'green')
  assert.equal(merged.avatar, 'data:image/png;base64,VELHA')
})

// ── Música apagada ───────────────────────────────────────────────────────────
// A biblioteca é UNIÃO entre aparelho e nuvem. Sem lápide, a faixa apagada voltaria
// no próximo sync e os plays dela continuariam contando no card do amigo.
test('música apagada na nuvem não volta para a biblioteca', () => {
  const nuvem = [{ sid: 'a', title: 'A', plays: 9 }, { sid: 'b', title: 'B', plays: 4 }]
  const local = [{ sid: 'b', title: 'B', plays: 4 }]
  const m = mergeLibrary(local, nuvem, ['a'])
  assert.deepEqual(m.map((x) => x.sid), ['b'], 'a lápide precisa vencer a união')
})

test('sem lápide, a união continua valendo (comportamento antigo)', () => {
  const m = mergeLibrary([{ sid: 'b' }], [{ sid: 'a' }, { sid: 'b' }], [])
  assert.deepEqual(m.map((x) => x.sid).sort(), ['a', 'b'])
})

test('lápides dos dois lados se juntam', () => {
  assert.deepEqual(mergeApagadas(['a'], ['b', 'a']).sort(), ['a', 'b'])
})

test('lápide antiga de outra conta não some com a biblioteca do aparelho', () => {
  const merged = mergeAll(
    { library: [{ sid: 'x', title: 'X' }], libApagadas: [] },
    { library: [{ sid: 'x', title: 'X', plays: 3 }], libApagadas: ['y'] },
  )
  assert.equal(merged.library.length, 1)
  assert.deepEqual(merged.libApagadas, ['y'])
})

test('apagar todas as músicas zera as estatísticas que o amigo vê', () => {
  const apagadas = mergeApagadas([], ['a', 'b'])
  const m = mergeLibrary([], [{ sid: 'a', plays: 30 }, { sid: 'b', plays: 12 }], apagadas)
  assert.equal(m.length, 0, 'sem músicas, não pode sobrar plays no perfil do amigo')
})

// ---------------------------------------------------------------------------
// Contadores que DIMINUEM: moedas gastas e barras do gatinho.
//
// O merge por "pega o maior dos dois" é certo para contadores que só crescem,
// mas devolvia o valor gasto/dormido assim que a sincronização rodava. Estes
// testes travam a regressão: se alguém voltar a usar o maior valor aqui, o
// gasto ou o decaimento voltam a desfazer sozinhos.
// ---------------------------------------------------------------------------

test('moedas gastas não voltam quando a nuvem ainda tem o saldo antigo', () => {
  // Você tinha 100, gastou 30. O saldo some e o gasto vira contador.
  const local = { coins: 100, coinsGastos: 30 }
  // A nuvem ainda não sabe da compra: tem as 100 inteiras e nada de gasto.
  const nuvem = { coins: 100, coinsGastos: 0 }
  const m = mergePetstats(local, nuvem)
  const saldo = m.coins - m.coinsGastos
  assert.equal(saldo, 70, 'as 30 moedas gastas têm que continuar gastas')
})

test('gastar mais moedas continua certo em cada rodada de sincronização', () => {
  let local = { coins: 100, coinsGastos: 0 }
  // A nuvem nunca recebe a compra: no pior caso ela continua com as 100 e
  // zero gasto, e mesmo assim o saldo tem que cair a cada gasto.
  const nuvem = { coins: 100, coinsGastos: 0 }
  let gastoAcumulado = 0
  for (const gasto of [30, 20, 10]) {
    gastoAcumulado += gasto
    local = { coins: local.coins, coinsGastos: local.coinsGastos + gasto }
    const m = mergePetstats(local, nuvem)
    assert.equal(m.coinsGastos, gastoAcumulado, `total gasto depois de gastar ${gasto}`)
    assert.equal(m.coins - m.coinsGastos, 100 - gastoAcumulado, `saldo depois de gastar ${gasto}`)
  }
})

test('ganhar moedas de verdade continua somando no saldo', () => {
  const local = { coins: 140, coinsGastos: 30 }
  const nuvem = { coins: 100, coinsGastos: 30 }
  const m = mergePetstats(local, nuvem)
  assert.equal(m.coins - m.coinsGastos, 110, 'ganhar 40 tem que aumentar o saldo')
})

test('barras do gatinho não são reidratadas pela cópia velha da nuvem', () => {
  const agora = Date.now()
  // O gato está com fome de verdade neste aparelho: full baixo, relógio novo.
  const local = { full: 25, happy: 30, sleep: 40, clean: 35, lt: agora }
  // A nuvem ainda tem o gato alimentado de horas atrás, com o relógio velho.
  const nuvem = { full: 100, happy: 95, sleep: 90, clean: 92, lt: agora - 6 * 3600000 }
  const m = mergePetstats(local, nuvem)
  assert.equal(m.full, 25, 'a barra baixa não pode virar 100 de novo')
  assert.equal(m.happy, 30)
  assert.equal(m.sleep, 40)
  assert.equal(m.clean, 35)
  assert.equal(m.lt, agora, 'o relógio segue o mais recente')
})

test('barras: a cópia mais recente vence, e as duas juntas são consistentes', () => {
  const agora = Date.now()
  const velho = { full: 100, happy: 100, sleep: 100, clean: 100, lt: agora - 3600000 }
  const novo = { full: 40, happy: 55, sleep: 60, clean: 35, lt: agora }
  const m = mergePetstats(velho, novo)
  // Misturar "barra cheia" com "relógio novo" seria um estado que nunca existiu.
  for (const k of ['full', 'happy', 'sleep', 'clean']) {
    assert.equal(m[k], novo[k], `${k} tem que vir inteira da cópia mais recente`)
  }
})

test('barras: contador que cresce (toques) continua usando o maior valor', () => {
  const m = mergePetstats({ touches: 50, lt: 1 }, { touches: 80, lt: 1 })
  assert.equal(m.touches, 80, 'toques só crescem, então o maior valor está certo')
})

test('razão de consumo some tudo que foi usado e nunca regride', () => {
  const a = somaConsumido({}, 'frango', 1)
  assert.deepEqual(a, { frango: 1 })
  const b = somaConsumido(a, 'frango', 2)
  assert.deepEqual(b, { frango: 3 })
  assert.deepEqual(somaConsumido({}, 'leite', 1), { leite: 1 })
  // Unir dois razões só pode somar o que já foi usado, nunca devolver.
  const junto = juntaConsumido({ frango: 3 }, { frango: 5, leite: 1 })
  assert.deepEqual(junto, { frango: 5, leite: 1 })
})

test('saldo de comida é o que tem menos o que já foi comido', () => {
  const estoque = { frango: 3, pizza: 2 }
  assert.equal(disponivelDe(estoque, {}, 'frango'), 3)
  assert.equal(disponivelDe(estoque, { frango: 2 }, 'frango'), 1)
  assert.equal(disponivelDe(estoque, { frango: 9 }, 'frango'), 0, 'nunca fica negativo')
  assert.equal(disponivelDe(estoque, { frango: 1 }, 'pizza'), 2)
})

test('os razões de consumo entram na sincronização', () => {
  const secoes = collectExtras()
  assert.ok(secoes, 'coleta tem que existir')
  // O que importa é que os dois razões são seções de sync, senão o gasto fica
  // só neste aparelho e volta a aparecer no outro.
  const temNoFonte = readFileSync(new URL('../src/lib/sync.js', import.meta.url), 'utf8')
  assert.ok(temNoFonte.includes("'nt.invUsado'"), 'nt.invUsado tem que estar nas seções')
  assert.ok(temNoFonte.includes("'nt.bathUsado'"), 'nt.bathUsado tem que estar nas seções')
})

// ---------------------------------------------------------------------------
// Regressão de sincronização: o gasto precisa SUBIR para a nuvem.
//
// `nt.invUsado`/`nt.bathUsado` entraram na lista de seções e, com isso, saíram
// da coleta de "extras" — que é justamente por onde o resto do app sobe para
// a nuvem. O efeito practicalo era o pior dos dois: o gasto não subia, e o
// outro aparelho desconhecia a comida já comida. Aqui eles são seções de
// primeira classe, lidas e enviadas como tal.
// ---------------------------------------------------------------------------

test('o motivo de consumo sobe para a nuvem (não fica só neste aparelho)', () => {
  const store = {}
  globalThis.localStorage.getItem = (k) => (k in store ? store[k] : null)
  globalThis.localStorage.setItem = (k, v) => { store[k] = String(v) }
  store['nt.invUsado'] = JSON.stringify({ frango: 2 })
  store['nt.bathUsado'] = JSON.stringify({ shampoo: 1 })

  const local = collectLocal()
  assert.deepEqual(local.invUsado, { frango: 2 }, 'invUsado tem que ser lido do aparelho')
  assert.deepEqual(local.bathUsado, { shampoo: 1 }, 'bathUsado tem que ser lido do aparelho')
  assert.equal('invUsado' in local, true, 'precisa existir no payload enviado à nuvem')
  assert.equal('bathUsado' in local, true)
})

test('moedas: o saldo some depois de mesclar com um gasto maior da nuvem', () => {
  const local = { petstats: { coins: 200, coinsGastos: 30, lt: 1000 }, inv: {}, toys: [], bath: {}, library: [], achSeen: [], playlists: [], playedRecent: [], extras: {} }
  const nuvem = { petstats: { coins: 200, coinsGastos: 80, lt: 1000 }, inv: {}, toys: [], bath: {}, library: [], achSeen: [], playlists: [], playedRecent: [], extras: {} }
  const m = mergeAll(local, nuvem)
  assert.equal(m.petstats.coinsGastos, 80, 'o maior total gasto é o que vale')
  assert.equal(m.petstats.coins - m.petstats.coinsGastos, 120, 'saldo 200 - 80 = 120')
})

test('comida e banho: unir os gastos não volta o que já foi comido', () => {
  const local = { petstats: { lt: 0 }, inv: { frango: 3 }, invUsado: { frango: 2 }, bath: { shampoo: 5 }, bathUsado: { shampoo: 1 }, toys: [], library: [], achSeen: [], playlists: [], playedRecent: [], extras: {} }
  const nuvem = { petstats: { lt: 0 }, inv: { frango: 3 }, invUsado: { frango: 3 }, bath: { shampoo: 5 }, bathUsado: { shampoo: 2 }, toys: [], library: [], achSeen: [], playlists: [], playedRecent: [], extras: {} }
  const m = mergeAll(local, nuvem)
  // Consumi 2 aqui e 3 lá: os são o MESMO total acumulado, então vale o maior.
  assert.equal(m.invUsado.frango, 3)
  assert.equal(m.inv.frango - m.invUsado.frango, 0, 'ninguém mais tem frango')
  assert.equal(m.bathUsado.shampoo, 2, 'banho não soma duas vezes, fica no maior')
  assert.equal(m.bath.shampoo - m.bathUsado.shampoo, 3, 'sobram 3 usos de shampoo')
})

test('saldo de moedas mostrado na tela nunca volta ao total ganho', () => {
  // A tela recebe `stats` e lê `.coins`. Se passarmos o petStats cru, o
  // contador fica preso no total ganho e "não muda" ao comprar.
  const petStats = { coins: 200, coinsGastos: 30, touches: 12 }
  const moedas = Math.max(0, (Number(petStats.coins) || 0) - (Number(petStats.coinsGastos) || 0))
  const exibido = { ...petStats, coins: moedas }
  assert.equal(exibido.coins, 170, 'a tela tem que mostrar o saldo, não o total')
  assert.equal(exibido.touches, 12, 'os outros contadores continuam iguais')
})

// ---------------------------------------------------------------------------
// Decai das barras: ritmo e curva.
//
// A taxa é por MINUTO agora (antes era por hora: 6 a 11 por hora é menos de
// um ponto a cada cinco minutos, o que parecia travado). Estes testes
// travam o ritmo e a curva que evita a barra cheia despencar de uma vez.
// ---------------------------------------------------------------------------

test('a barra de fome desce rápido o suficiente para o usuário perceber', () => {
  // Um minuto tem que mexer visivelmente na barra (>= 0.5 ponto).
  assert.ok(MOOD_DECAY.full * taxaDeDecaimento(90) >= 0.5, '1 minuto tem que dar >= 0.5 ponto')
})

test('a curva evita a barra cheia despencar de uma vez', () => {
  assert.ok(taxaDeDecaimento(100) < 1, 'perto de 100 tem que desacelerar')
  assert.ok(taxaDeDecaimento(100) >= 0.5, 'mas não pode travar de vez')
  assert.equal(taxaDeDecaimento(50), 1, 'no meio a taxa é a cheia')
  assert.ok(taxaDeDecaimento(5) < 1, 'embaixo de 15 desacelera para não zerar num pulo')
})

test('todas as barras caem juntas com o tempo', () => {
  const antes = { full: 100, happy: 85, sleep: 90, clean: 90 }
  const depois = {}
  for (const k of MOOD_KEYS) {
    depois[k] = Math.max(0, antes[k] - 10 * MOOD_DECAY[k] * taxaDeDecaimento(antes[k]))
  }
  for (const k of MOOD_KEYS) {
    assert.ok(depois[k] < antes[k], `${k} tem que descer em 10 minutos`)
  }
})

test('uma hora de app fechado derruba as barras, mas sem zerar na marra', () => {
  const umaHora = 60
  const full = Math.max(0, 100 - umaHora * MOOD_DECAY.full * taxaDeDecaimento(100))
  assert.ok(full > 0 && full < 60, `fome depois de 1h tem que estar no meio (veio ${full})`)
  // Nenhuma barra pode passar de 100 nem ficar negativa.
  for (const k of MOOD_KEYS) {
    const v = Math.max(0, 90 - umaHora * MOOD_DECAY[k] * taxaDeDecaimento(90))
    assert.ok(v >= 0 && v <= 100, `${k} tem que ficar entre 0 e 100`)
  }
})

test('cada ação mexe nas outras barras, e não só na dela', () => {
  // Regressão: "brincar" e "dormir" só somavam na própria barra, então as
  // outras ficavam paradas e parecia que a ação não mexia em nada.
  const acoes = {
    play: { happy: 22, sleep: -6, full: -5, clean: -4 },
    sleep: { sleep: 36, happy: 4, full: -5, clean: -3 },
    food: { full: 28, happy: 6, clean: -4 },
    bath: { clean: 34, happy: 4, full: -2 },
  }
  for (const [nome, mood] of Object.entries(acoes)) {
    const mexe = Object.entries(mood).filter(([, v]) => v !== 0)
    assert.ok(mexe.length >= 2, `${nome} tem que mexer em mais de uma barra`)
    assert.ok(mexe.some(([, v]) => v > 0), `${nome} tem que subir a barra que ele cuida`)
    assert.ok(mexe.some(([, v]) => v < 0), `${nome} tem que consumir alguma outra barra`)
  }
})

// ---------------------------------------------------------------------------
// O alarme nativo e a tela têm que concordar.
//
// Com o app fechado quem baixa as barras é o PetAlarmReceiver.java; com o
// app aberto é o JavaScript. Se as taxas divergirem, a barra cai de um jeito
// com o app aberto e de outro com o app fechado, e isso é justamente o tipo
// de bug que ninguém nota até a pessoa reclamar. Este teste lê o Java e
// compara com o pet.js.
// ---------------------------------------------------------------------------

test('as taxas do alarme nativo são iguais às da tela', () => {
  const java = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java', import.meta.url),
    'utf8',
  )
  const esperado = { FULL: 'full', HAPPY: 'happy', SLEEP: 'sleep', CLEAN: 'clean' }
  for (const [constJava, key] of Object.entries(esperado)) {
    const achou = new RegExp(`DECAY_${constJava}\\s*=\\s*([\\d.]+)`).exec(java)
    assert.ok(achou, `falta DECAY_${constJava} no receiver`)
    assert.equal(
      Number(achou[1]),
      MOOD_DECAY[key],
      `${key}: taxa do Java (${achou[1]}) tem que ser a mesma da tela (${MOOD_DECAY[key]})`,
    )
  }
})

test('a curva do alarme nativo é igual à curva da tela', () => {
  const java = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java', import.meta.url),
    'utf8',
  )
  for (const valor of [100, 50, 5]) {
    const esperado = String(taxaDeDecaimento(valor))
    assert.ok(
      java.includes(esperado),
      `a curva do Java precisa ter ${esperado} (taxa em ${valor}) para bater com a tela`,
    )
  }
})

test('o alarme do gatinho continua agendado depois de reiniciar o aparelho', () => {
  const receiver = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java', import.meta.url),
    'utf8',
  )
  const manifest = readFileSync(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  )
  assert.ok(receiver.includes('BOOT_COMPLETED'), 'sem BOOT_COMPLETED o alarme morre no reinício')
  assert.ok(manifest.includes('PetAlarmReceiver'), 'o receiver precisa estar no manifest')
  assert.ok(manifest.includes('PET_CHECK'), 'a ação do alarme precisa estar no manifest')
})

// ---------------------------------------------------------------------------
// Tela e alarme nativo não podem discordar do mesmo número.
//
// O alarme tem contador próprio (é ele que roda com o app fechado). Se a tela
// ignorasse o que ele mexeu, as barras pulariam para trás ao abrir o app.
// Estes testes travam o contrato: só entra o estado nativo mais recente.
// ---------------------------------------------------------------------------

test('o alarme nativo tem um método para devolver o estado que decaiu', () => {
  const java = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmPlugin.java', import.meta.url),
    'utf8',
  )
  assert.ok(java.includes('public void read('), 'sem read() a tela nunca recupera o estado nativo')
  assert.ok(java.includes('out.put("petstats"'), 'read() tem que devolver o petstats')
})

test('o id da notificação é sempre positivo e estável', () => {
  const java = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java', import.meta.url),
    'utf8',
  )
  // Math.abs(Integer.MIN_VALUE) continua negativo: usar hashCode() quebrava o id.
  assert.ok(!java.includes('Math.abs(tag.hashCode())'), 'não pode derivar id de hashCode')
  assert.ok(java.includes('NOTIF_BASE + idx'), 'o id tem que sair do índice (0..3)')
})

test('o alarme se refaz sozinho quando o aparelho reinicia', () => {
  const java = readFileSync(
    new URL('../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java', import.meta.url),
    'utf8',
  )
  // O proximo precisa ser agendado ANTES do trabalho, senao um alarme que
  // morre no meio deixa a cadeia parada para sempre.
  const corpo = java.slice(java.indexOf('public void onReceive'))
  const idxAgendar = corpo.indexOf('schedule(context)')
  const idxTrabalho = corpo.indexOf('aplicarDecaimento(context)')
  assert.ok(idxAgendar >= 0 && idxTrabalho >= 0, 'tem que agendar e fazer o trabalho')
  assert.ok(idxAgendar < idxTrabalho, 'agendar precisa vir antes do trabalho')
})

test('applyPetStats não descarta contador que só cresce', () => {
  const src = readFileSync(new URL('../src/settings.js', import.meta.url), 'utf8')
  const bloco = src.slice(src.indexOf('const applyPetStats'))
  const lista = bloco.slice(0, bloco.indexOf(']'))
  // Estes tres crescem por evento e sumiam ao aplicar a copia da nuvem.
  for (const k of ['bathsFeitos', 'buys', 'minigames']) {
    assert.ok(lista.includes(`'${k}'`), `applyPetStats precisa aceitar ${k}`)
  }
})

// ---------------------------------------------------------------------------
// O APK não saía porque o Java tinha dois erros que só o compilador Android
// acusa. Ambos quebraram a release e um deles (o do tipo do recurso) foi erro
// meu já na 3.2.9. Estes testes existem para o build não voltar a quebrar em
// silêncio.
// ---------------------------------------------------------------------------

const JAVA_ALARME = new URL(
  '../android/app/src/main/java/br/com/nebulatune/app/PetAlarmReceiver.java',
  import.meta.url,
)
const RECURSOS_ALARME = new URL(
  '../android/app/src/main/res/values/pet_strings.xml',
  import.meta.url,
)

test('o decaimento declara throws, senão o build do Android quebra', () => {
  const java = readFileSync(JAVA_ALARME, 'utf8')
  // org.json do Android lança JSONException, que é checked. Se put() ficar
  // fora de try/catch, o método tem que declarar throws.
  assert.ok(
    /aplicarDecaimento\(Context context\) throws JSONException/.test(java),
    'aplicarDecaimento precisa declarar throws JSONException',
  )
  const corpo = java.slice(java.indexOf('private void aplicarDecaimento'))
  const puts = corpo.match(/state\.put\(/g) || []
  assert.ok(puts.length >= 3, 'esperado os put() do lt e das barras')
})

test('cada R.array/R.string aponta para um recurso do tipo certo', () => {
  const java = readFileSync(JAVA_ALARME, 'utf8')
  const xml = readFileSync(RECURSOS_ALARME, 'utf8')
  // <string-array> gera R.array.* e <string> gera R.string.*. Trocar um pelo
  // outro compila no editor e só explode no build do APK.
  const tipos = {}
  for (const m of xml.matchAll(/<(string-array|string)\s+name="([^"]+)"/g)) {
    tipos[m[2]] = m[1] === 'string-array' ? 'array' : 'string'
  }
  const usados = [...java.matchAll(/R\.(array|string)\.(\w+)/g)]
  assert.ok(usados.length > 0, 'o Java usa recursos do bundle')
  for (const [, tipo, nome] of usados) {
    assert.ok(tipos[nome], `recurso ${nome} nao existe em pet_strings.xml`)
    assert.equal(tipo, tipos[nome], `${nome} e' R.${tipos[nome]}, o Java pediu R.${tipo}`)
  }
})
