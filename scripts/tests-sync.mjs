import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSids } from '../src/lib/sid.js'
import { applyExtras, applyLibrary, applyPlaylists, collectExtras, deepMerge, mergeApagadas, mergeAll, mergeCounters, mergeExtras, mergeLibrary, mergePlaylists, mergePetstats, mergeSettings, mergeStrings, novoTudoDoZero } from '../src/lib/sync.js'

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
