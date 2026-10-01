// Diagnóstico ao vivo das contas: simula o fluxo REAL do app.
// 1) Cria a conta A e coloca coisas nela; 2) cria a conta B e coloca coisas
// diferentes; 3) troca de conta várias vezes, sempre com "aparelho novo" (local
// storage zerado) e confere que CADA conta carrega os DADOS DELA ao logar.
// Ao final, apaga as linhas de teste da nuvem.
// Uso: node scripts/diag-contas.mjs
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
// "Aparelho novo": zera tudo que o app guarda (como um celular recém-comprado).
const trocaDeDispositivo = () => {
  store = new Map()
}

const { signIn, signUp, getUserId, authedFetch } = await import('../src/lib/account.js')
const { syncNow } = await import('../src/lib/sync.js')

const pedacos = Math.random().toString(36).slice(2, 8)
const NETO = `nt-diag-${pedacos}@mailinator.com`
const SENHA = 'teste12345'
const checks = []
const check = (nome, ok, extra = '') => {
  checks.push([nome, ok])
  console.log(`   ${ok ? '✅' : '❌'} ${nome}${extra ? ` — ${extra}` : ''}`)
}

async function criarEpopular(email, nome, accent, coins, toque) {
  trocaDeDispositivo()
  const r = await signUp(email, SENHA)
  if (!r.ok || r.needsConfirm) {
    check(`criar conta ${nome} (login direto)`, false, r.error || 'precisa confirmar e-mail')
    return null
  }
  // "fiz coisas": perfil (nome/cor), moedas e toques do gatinho, um extra.
  store.set('nt.settings', JSON.stringify({ userName: nome, accent }))
  store.set('nt.settingsAt', String(Date.now()))
  store.set('nt.petstats', JSON.stringify({ coins, touches: toque, meows: 1 }))
  store.set('nt.mgGrid', JSON.stringify({ wins: Math.floor(toque * 7) }))
  const s = await syncNow()
  if (!s.ok) throw new Error(`sync falhou ao popular ${nome}: ${s.error}`)
  return email
}

console.log('\n===== 1) CRIA A CONTA A E PÕE COISAS =====')
const A = await criarEpopular(NETO, 'Conta A', 'pink', 12, 3)
check('conta A criada e logada', Boolean(A))
const uidA = await getUserId()

console.log('\n===== 2) CRIA A CONTA B E PÕE COISAS DIFERENTES =====')
const emailB = `nt-diag-b-${pedacos}@mailinator.com`
const B = await criarEpopular(emailB, 'Conta B', 'green', 77, 9)
check('conta B criada e logada', Boolean(B))
const uidB = await getUserId()
if (!A || !B || !uidA || !uidB) {
  console.log('\n❌ Não deu para criar as duas contas — conferir se o cadastro direto está liberado no Supabase.')
  process.exit(1)
}

// Dados diferentes nas duas contas, para saber se houve vazamento.
const dadosA = { settings: { userName: 'Conta A', accent: 'pink' }, coins: 12 }
const dadosB = { settings: { userName: 'Conta B', accent: 'green' }, coins: 77 }

console.log('\n===== 3) LARGA A CONTA A E ENTRA NA B (contas diferentes) =====')
trocaDeDispositivo()
let r = await signIn(emailB, SENHA)
check('login na conta B (aparelho novo)', r.ok)
let s = await syncNow()
const mergedB = s.ok ? s.result.merged : {}
check(
  'conta B carrega o nome/cor DELA (e não da A)',
  mergedB.settings?.userName === dadosB.settings.userName && mergedB.settings?.accent === dadosB.settings.accent,
  `veio: ${mergedB.settings?.userName || '(vazio)'} / ${mergedB.settings?.accent || '(vazio)'}`,
)
check(
  'conta B carrega as moedas DELA',
  (mergedB.petstats?.coins || 0) === dadosB.coins,
  `veio: ${mergedB.petstats?.coins ?? '(vazio)'}`,
)
const ntB = collectExtra(mergedB.extras)
check('conta B carrega o extra DELA', (ntB && ntB.wins) > 0, `veio: wins=${ntB?.wins ?? 0}`)

console.log('\n===== 4) AGORA ENTRA NA CONTA A DE NOVO =====')
trocaDeDispositivo()
r = await signIn(A, SENHA)
check('login na conta A (aparelho novo)', r.ok)
s = await syncNow()
const mergedA = s.ok ? s.result.merged : {}
check(
  'conta A carrega o nome/cor DELA (não da B)',
  mergedA.settings?.userName === dadosA.settings.userName && mergedA.settings?.accent === dadosA.settings.accent,
  `veio: ${mergedA.settings?.userName || '(vazio)'} / ${mergedA.settings?.accent || '(vazio)'}`,
)
check(
  'conta A carrega as moedas DELA',
  (mergedA.petstats?.coins || 0) === dadosA.coins,
  `veio: ${mergedA.petstats?.coins ?? '(vazio)'}`,
)
const ntA = collectExtra(mergedA.extras)
check('conta A carrega o extra DELA', ntA && Number(ntA.wins) === 21, `veio: wins=${ntA?.wins ?? 0}`)

console.log('\n===== 5) CONTA ANTIGA (nuvem sem horário de edição) =====')
// Simula o bug corrigido: conta criada antes da marcação de horário existir.
// Deruba o settingsAt da conta A na nuvem e confere que o nome ainda volta.
const limp = await authedFetch(`/rest/v1/sync_profiles?uid=eq.${uidA}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: {
    data: (() => {
      const d = { ...mergedA }
      d.settingsAt = 0
      return d
    })(),
  },
})
check('nuvem da conta A sem horário (simula conta antiga)', limp.ok)
trocaDeDispositivo()
r = await signIn(A, SENHA)
check('login na conta A de novo', r.ok)
s = await syncNow()
const mergedLegacy = s.ok ? s.result.merged : {}
check(
  'conta antiga SEM carimbo ainda carrega o nome/cor (bug corrigido)',
  mergedLegacy.settings?.userName === dadosA.settings.userName && mergedLegacy.settings?.accent === dadosA.settings.accent,
  `veio: ${mergedLegacy.settings?.userName || '(vazio)'} / ${mergedLegacy.settings?.accent || '(vazio)'}`,
)

function collectExtra(extras) {
  if (!extras || typeof extras !== 'object') return null
  return extras['nt.mgGrid'] ?? null
}

console.log('\n===== 6) TROCAR DE CONTA SEM ZERAR O APARELHO (o caso que você viu) =====')
// O aparelho está com os dados da conta A na tela (seção 5). Agora entra na
// conta B SEM limpar nada: a tela TEM que passar a mostrar os dados da B.
r = await signIn(emailB, SENHA)
check('login na conta B (aparelho com dados da A)', r.ok)
s = await syncNow()
const mergedTroca = s.ok ? s.result.merged : {}
check(
  'trocou pro B: aparece o nome/cor DA B (não o da A que estava no aparelho)',
  mergedTroca.settings?.userName === dadosB.settings.userName && mergedTroca.settings?.accent === dadosB.settings.accent,
  `veio: ${mergedTroca.settings?.userName || '(vazio)'} / ${mergedTroca.settings?.accent || '(vazio)'}`,
)
check(
  'trocou pro B: moedas são as DA B',
  (mergedTroca.petstats?.coins || 0) === dadosB.coins,
  `veio: ${mergedTroca.petstats?.coins ?? '(vazio)'}`,
)
const exTrocaB = collectExtra(mergedTroca.extras)
check(
  'trocou pro B: estatísticas são as DA B (não somou as da A)',
  exTrocaB && Number(exTrocaB.wins) === 63,
  `veio: wins=${exTrocaB?.wins ?? 0} (B tem 63, A tem 21)`,
)
check('troca marcada como substituição (trocar=true)', s.ok && s.result.trocar === true)

console.log('\n===== 7) E DE VOLTA PRA CONTA A, no mesmo aparelho =====')
r = await signIn(A, SENHA)
check('login na conta A de novo', r.ok)
s = await syncNow()
const mergedVolta = s.ok ? s.result.merged : {}
check(
  'voltou pro A: nome/cor DA A de novo',
  mergedVolta.settings?.userName === dadosA.settings.userName && mergedVolta.settings?.accent === dadosA.settings.accent,
  `veio: ${mergedVolta.settings?.userName || '(vazio)'} / ${mergedVolta.settings?.accent || '(vazio)'}`,
)
check(
  'voltou pro A: moedas são as DA A (não ficou a soma)',
  (mergedVolta.petstats?.coins || 0) === dadosA.coins,
  `veio: ${mergedVolta.petstats?.coins ?? '(vazio)'}`,
)
const exVoltaA = collectExtra(mergedVolta.extras)
check(
  'voltou pro A: estatísticas são as DA A (não ficou as da B)',
  exVoltaA && Number(exVoltaA.wins) === 21,
  `veio: wins=${exVoltaA?.wins ?? 0} (A tem 21)`,
)

console.log('\n===== LIMPEZA =====')
const limpeza = async (uid) => {
  const l = await authedFetch(`/rest/v1/sync_profiles?uid=eq.${uid}`, { method: 'DELETE' })
  console.log(`   linha sync_profiles ${uid.slice(0, 8)}…:`, l.ok ? 'apagada' : 'não apagou (pode deixar)')
}
await limpeza(uidA)
await limpeza(uidB)

console.log('\n===== VEREDITO =====')
let ok = true
for (const [, passou] of checks) {
  if (!passou) ok = false
}
console.log(ok ? '\n✅ FUNCIONOU: cada conta carregou os dados dela ao logar.' : '\n❌ Ainda tem coisa errada (veja acima).')
process.exit(ok ? 0 : 1)