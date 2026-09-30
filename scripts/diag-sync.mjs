// Teste automático da sincronização: simula DOIS aparelhos (armazenamentos
// locais separados) usando a MESMA conta e confere o que sobe e o que desce.
// Uso: pnpm node scripts/diag-sync.mjs   (precisa de internet)
// Conta de teste descartável. A senha vem do ambiente para não ficar
// gravada no repositório:
//   NT_TEST_EMAIL=... NT_TEST_PASS=... node scripts/diag-sync.mjs
const EMAIL = process.env.NT_TEST_EMAIL || ''
const PASS = process.env.NT_TEST_PASS || ''
if (!EMAIL || !PASS) {
  console.error('Faltou a conta de teste. Use: NT_TEST_EMAIL=... NT_TEST_PASS=... node scripts/diag-sync.mjs')
  process.exit(1)
}

let store = new Map()
const instalar = () => {
  globalThis.localStorage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
instalar()
const trocarArmazenamento = () => {
  store = new Map()
  instalar()
}

const { signIn, getUserId } = await import('../src/lib/account.js')
const { syncNow, getSyncStatus, collectLocal, applyExtras, applyLibrary, applyPlaylists, mergeCounters, mergeStrings } = await import('../src/lib/sync.js')

const tracks = [
  { id: 'f-1', sid: 'smus1', title: 'Minha Música', artist: 'Artista', album: '', duration: 200, plays: 5, fav: true, playDays: {}, audioMissing: false },
  { id: 'f-2', sid: 'smus2', title: 'Outra Música', artist: 'Banda', album: '', duration: 180, plays: 1, fav: false, playDays: {}, audioMissing: false },
]

function seed() {
  store.set('nt.settings', JSON.stringify({ userName: 'Aparelho1', bio: 'meu bio', accent: 'pink' }))
  store.set('nt.library', JSON.stringify(tracks))
  store.set('nt.petstats', JSON.stringify({ coins: 30, touches: 12 }))
  store.set('nt.playedRecent', JSON.stringify(['smus1']))
  // dados "de verdade" que também têm que ir
  store.set('nt.mgStats', JSON.stringify({ plays: 12, wins: 5 }))
  store.set('nt.mgBest', JSON.stringify({ nivel1: 220 }))
  store.set('nt.mgWins', JSON.stringify({ nivel1: 3 }))
  store.set('nt.daily', JSON.stringify({ '2026-09-29': 4 }))
  store.set('nt.equalizer', JSON.stringify({ bass: 2, treble: -1 }))
}

async function device(n, comDados) {
  trocarArmazenamento()
  console.log(`\n===== APARELHO ${n} =====`)
  if (comDados) seed()
  const r = await signIn(EMAIL, PASS)
  console.log('  login:', r.ok ? 'ok' : `FALHOU (${r.error})`)
  if (!r.ok) return null
  const uid = await getUserId()
  console.log('  uid:', uid ? 'ok' : 'AUSENTE')
  const res = await syncNow()
  console.log('  sync:', res.ok ? 'ok' : `FALHOU (${res.reason} ${res.error || ''})`)
  console.log('  status:', getSyncStatus()?.message)
  if (!res.ok) return null

  // O app aplica o resultado no estado; aqui fazemos o mesmo para conferir.
  const atual = collectLocal()
  const m = res.result.merged
  applyExtras(m.extras)
  const depois = {
    settings: { ...(m.settings || {}), ...(atual.settings || {}) },
    petstats: mergeCounters(m.petstats, atual.petstats),
    library: applyLibrary(atual.library || [], m.library),
    playlists: applyPlaylists(atual.playlists || [], m.playlists),
    playedRecent: mergeStrings(atual.playedRecent || [], m.playedRecent || []).slice(0, 10),
  }
  const musicas = depois.library
  const ler = (k) => {
    try {
      return JSON.parse(store.get(k) || 'null')
    } catch {
      return null
    }
  }
  console.log('  => depois do sync:')
  console.log('     músicas:', musicas.length, '| favoritas:', musicas.filter((t) => t.fav).map((t) => t.title).join(', ') || 'nenhuma')
  console.log('     plays:', musicas.map((t) => `${t.title}=${t.plays}`).join(' '))
  console.log('     sem áudio:', musicas.filter((t) => t.audioMissing).map((t) => t.title).join(', ') || 'nenhuma')
  console.log('     moedas:', depois.petstats?.coins, '| recentes:', (depois.playedRecent || []).join(','))
  console.log('     NOME DO PERFIL:', JSON.stringify(depois.settings.userName), '| bio:', JSON.stringify(depois.settings.bio), '| cor:', depois.settings.accent)
  console.log('     minijogos:', JSON.stringify(ler('nt.mgStats')), '| recordes:', JSON.stringify(ler('nt.mgBest')), '| diário:', JSON.stringify(ler('nt.daily')), '| equalizador:', JSON.stringify(ler('nt.equalizer')))
  return { ...depois, extras: ler('nt.mgStats') }
}

trocarArmazenamento()
const a = await device(1, true)
const b = await device(2, false)

console.log('\n===== VEREDITO =====')
const libA = a?.library || []
const libB = b?.library || []
const checks = [
  ['o APARELHO 2 não ganhou lista fantasma (sem áudio não aparece)', libB.length === 0],
  ['no aparelho 1 o áudio das músicas importadas NÃO foi perdido', ['smus1', 'smus2'].every((s) => libA.find((t) => t.sid === s)?.audioMissing === false)],
  ['as moedas do 1 chegaram no 2', (b?.petstats?.coins || 0) === (a?.petstats?.coins || 0) && (a?.petstats?.coins || 0) > 0],
  ['o NOME do perfil do 1 chegou no 2', b?.settings?.userName === 'Aparelho1'],
  ['a bio do 1 chegou no 2', b?.settings?.bio === 'meu bio'],
  ['a cor escolhida no 1 chegou no 2', b?.settings?.accent === 'pink'],
  ['as recentes do 1 chegaram no 2', (b?.playedRecent || []).includes('smus1')],
]
for (const [nome, passou] of checks) console.log(`  ${passou ? '✅' : '❌'} ${nome}`)
const tudoOk = checks.every(([, p]) => p)
console.log(tudoOk ? '\n✅ TUDO CERTO: entra, sai e nunca apaga.' : '\n❌ Ainda falta algo (veja as linhas acima).')

// Ida e volta: o aparelho 2 importa o MESMO arquivo (mesmo sid) e precisa
// receber as estatísticas que o 1 acumulou na nuvem.
console.log('\n===== IDA E VOLTA (estatísticas seguem ao importar o arquivo) =====')
trocarArmazenamento()
if (a) {
  store.set('nt.petstats', JSON.stringify(a.petstats))
}
store.set('nt.library', JSON.stringify([{
  id: 'nova-imp', sid: 'smus1', title: 'Minha Música', artist: 'Artista', album: '', duration: 200, plays: 0, fav: false, playDays: {}, audioMissing: false,
}]))
const r1 = await signIn(EMAIL, PASS)
console.log('  aparelho 2 login:', r1.ok)
const s1 = await syncNow()
console.log('  aparelho 2 sync:', s1.ok ? 'ok' : `FALHOU (${s1.reason})`)
const voltou = applyLibrary(collectLocal().library || [], s1.result.merged.library)
const m1 = voltou.find((t) => t.sid === 'smus1')
console.log('  plays do smus1 no 2 após importar:', m1?.plays, m1?.plays === 5 ? '✅' : '❌ (era 5 no aparelho 1)')
console.log('  favorita no 2 após importar:', m1?.fav ? 'SIM ✅' : 'NÃO ❌')
console.log('  música do 1 que o 2 não tem continua de fora da lista:', voltou.some((t) => t.sid === 'smus2') ? 'NÃO ❌' : 'SIM ✅')
const conta = m1?.plays === 5 && m1?.fav === true && !voltou.some((t) => t.sid === 'smus2')
console.log(conta ? '\n✅ IDA E VOLTA CERTA: arquivo importado local recupera as estatísticas.' : '\n❌ Ainda falta algo (veja as linhas acima).')
console.log('  plays somados da nuvem (5 + 0 = 5):', voltou.find((t) => t.sid === 'smus1')?.plays)

// Limpeza: apaga a linha de teste na nuvem.
const { authedFetch } = await import('../src/lib/account.js')
const uid = await getUserId()
if (uid) {
  const del = await authedFetch(`/rest/v1/sync_profiles?uid=eq.${uid}`, { method: 'DELETE' })
  console.log('\n  limpeza da nuvem:', del.ok ? 'ok' : 'falhou')
}
