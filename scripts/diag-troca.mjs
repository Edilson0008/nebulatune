// Teste ao vivo do vazamento ENTRE CONTAS no MESMO aparelho.
//
// O defeito: quando entrava uma conta nova, a sincronização não reconhecia a
// troca (só reconhecia se a conta nova já tivesse nuvem) e acabava enviando os
// DADOS DA CONTA ANTIGA para a conta nova. Na prática, as músicas, as
// estatísticas e as conquistas de uma apareciam na outra.
// Uso: node scripts/diag-troca.mjs
// (exige internet e as tabelas user_profiles/sync_profiles aplicadas.)
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { signIn, signUp, getUserId, authedFetch } = await import('../src/lib/account.js')
const { syncNow, collectLocal } = await import('../src/lib/sync.js')

const SENHA = 'teste12345'
const pedacos = Math.random().toString(36).slice(2, 8)
const EMAIL_A = `nt-troca-a-${pedacos}@mailinator.com`
const EMAIL_B = `nt-troca-b-${pedacos}@mailinator.com`

const checks = []
const check = (nome, ok, extra = '') => {
  checks.push([nome, ok])
  console.log(`   ${ok ? '✅' : '❌'} ${nome}${extra ? ` — ${extra}` : ''}`)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const musica = (sid, titulo, plays, fav) => ({
  sid,
  title: titulo,
  artist: 'Teste',
  album: 'Teste',
  plays,
  fav,
  playDays: { '2026-01-01': plays },
})

const lerNuvem = async (uid) => {
  const r = await authedFetch(`/rest/v1/sync_profiles?uid=eq.${uid}&select=data`)
  const d = Array.isArray(r.data) && r.data[0] ? r.data[0].data : null
  return d && typeof d === 'object' ? d : null
}

const escreverLocal = (k, v) => store.set(k, JSON.stringify(v))

// --- Conta A: uma música, tocada 9 vezes e favorita.
const rA = await signUp(EMAIL_A, SENHA)
if (!rA.ok || rA.needsConfirm) { console.log('falha ao criar A:', rA.error); process.exit(1) }
const uidA = await getUserId()
escreverLocal('nt.inv', { coins: 111 })
escreverLocal('nt.library', [musica('sid-A', 'Musica da Conta A', 9, true)])
escreverLocal('nt.toys', ['urso'])
escreverLocal('nt.achSeen', ['conquista-x'])
await syncNow()
const nuvemA = await lerNuvem(uidA)
check('conta A gravou osplays dela na nuvem', Number(nuvemA?.library?.[0]?.plays) === 9, `plays=${nuvemA?.library?.[0]?.plays}`)
check('conta A tem a música dela', nuvemA?.library?.[0]?.title === 'Musica da Conta A', `titulo=${nuvemA?.library?.[0]?.title}`)

// --- Troca para a conta B SEM nuvem nenhuma (conta recém-criada, ainda vazia).
const rB = await signUp(EMAIL_B, SENHA)
if (!rB.ok || rB.needsConfirm) { console.log('falha ao criar B:', rB.error); process.exit(1) }
const uidB = await getUserId()
const resTroca = await syncNow()
if (!resTroca?.ok) console.log('   (syncNow da troca:', JSON.stringify(resTroca), ')')
check('a troca de conta foi reconhecida', resTroca?.result?.trocar === true, `trocar=${resTroca?.result?.trocar}`)

const nuvemB = await lerNuvem(uidB)
const musicasB = Array.isArray(nuvemB?.library) ? nuvemB.library : []
const playsB = musicasB.map((m) => Number(m.plays) || 0)
const totalPlaysB = playsB.reduce((a, b) => a + b, 0)
const msA = collectLocal().library.find((m) => m.sid === 'sid-A')

check(
  'conta B NÃO herdou os plays da conta A',
  totalPlaysB === 0,
  `plays na conta B=${totalPlaysB} (vem de A=9)`,
)
check(
  'conta B NÃO herdou a música favoritada de A',
  !musicasB.some((m) => m.fav === true),
  `favoritas=${JSON.stringify(musicasB.map((m) => m.fav))}`,
)
check(
  'conta B NÃO herdou os playDays de A',
  musicasB.every((m) => Object.keys(m.playDays || {}).length === 0),
  `playDays=${JSON.stringify(musicasB.map((m) => Object.keys(m.playDays || {}).length))}`,
)
check(
  'conta B NÃO herdou moedas/inventário de A',
  Number(nuvemB?.inv?.coins) !== 111,
  `coins=${nuvemB?.inv?.coins}`,
)
check(
  'conta B NÃO herdou as conquistas vistas de A',
  !JSON.stringify(nuvemB?.achSeen || []).includes('conquista-x'),
  `achSeen=${JSON.stringify(nuvemB?.achSeen)}`,
)
// Só dá para conferir a nuvem de A logado como A: o RLS esconde o bloco de
// dados de uma conta para as outras. Logo abaixo, ao voltar para A, é que
// verificamos se ela continua inteira.
check('a nuvem de A não pode ser lida pela conta B (RLS)', (await lerNuvem(uidA)) === null, 'RLS protege o bloco de dados')
check('o aparelho guardou o áudio da música de A (é do aparelho)', Boolean(msA), msA ? 'sid-A segue no aparelho' : 'sid-A sumiu')

// --- A conta nova conta a partir do zero: tocar 1 vez tem que dar 1, não 10.
escreverLocal('nt.library', [{ ...musicasB[0], plays: 1, fav: false, playDays: { '2026-02-02': 1 } }])
await syncNow()
await wait(500)
const nuvemB2 = await lerNuvem(uidB)
check('conta B contou a reprodução do zero', Number(nuvemB2?.library?.[0]?.plays) === 1, `plays=${nuvemB2?.library?.[0]?.plays}`)

// --- Voltar para A: os 9 plays dela têm que voltar, e B não pode mais ver.
await signIn(EMAIL_A, SENHA)
const resVolta = await syncNow()
check('a volta para A também foi reconhecida como troca', resVolta?.result?.trocar === true, `trocar=${resVolta?.result?.trocar}`)
const nuvemA2 = await lerNuvem(uidA)
check('A recuperou os 9 plays dela', Number(nuvemA2?.library?.[0]?.plays) === 9, `plays=${nuvemA2?.library?.[0]?.plays} uid=${uidA.slice(0,6)}`)
check('A recuperou a favorita dela', nuvemA2?.library?.[0]?.fav === true, `fav=${nuvemA2?.library?.[0]?.fav}`)

const ruins = checks.filter(([, ok]) => !ok)
console.log(`\n${checks.length - ruins.length}/${checks.length} verificações passaram`)
console.log(`contas de teste: ${EMAIL_A} / ${EMAIL_B}`)
if (ruins.length) {
  console.log('\n===== VEREDITO =====\n\n❌ DADOS DA CONTA ANTIGA VÃO PARA A CONTA NOVA. Não é seguro publicar.')
  process.exit(1)
}
console.log('\n===== VEREDITO =====\n\n✅ Cada conta carrega só o que é dela.')
