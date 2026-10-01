// Teste ao vivo do defeito "o perfil volta para o valor antigo".
//
// A causa era: a sincronização traz a versão antiga para a tela e o app, sem
// conferir, mandava esse valor velho de volta para o banco — apagando a versão
// nova que tinha acabado de chegar. Foi assim que a foto nova voltava a antiga.
//
// Aqui o "valor" é o NOME, porque é o mesmo caminho de gravação da foto
// (mesma função, mesma fila, mesma comparação) e roda fora do navegador. O
// redimensionamento de foto precisa de createImageBitmap, que o Node não tem —
// por isso a foto em si é conferida na mão, no app.
// Uso: node scripts/diag-foto.mjs
// (exige internet e a tabela user_profiles aplicada no Supabase.)
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { signUp, getUserId, authedFetch } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')

const SENHA = 'teste12345'
const pedacos = Math.random().toString(36).slice(2, 8)
const EMAIL = `nt-foto-${pedacos}@mailinator.com`

const checks = []
const check = (nome, ok, extra = '') => {
  checks.push([nome, ok])
  console.log(`   ${ok ? '✅' : '❌'}${nome}${extra ? ` — ${extra}` : ''}`)
}

// Qualquer pessoa logada consegue LER os perfis de todo mundo (é o que faz a
// busca funcionar). Por isso precisa filtrar pelo próprio uid: sem isso o teste
// lê o perfil de outra conta e dá "verde" falso.
const lerMeuPerfil = async (uid) => {
  const r = await authedFetch(`/rest/v1/user_profiles?uid=eq.${uid}&select=name,bio,accent,last_seen_at`)
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null
}

const uid = await (async () => {
  const r = await signUp(EMAIL, SENHA)
  if (!r.ok || r.needsConfirm) {
    check('conta de teste criada e logada', false, r.error || 'precisa confirmar e-mail')
    process.exit(1)
  }
  return getUserId()
})()

console.log(`\nconta de teste: ${EMAIL}\nuid: ${uid}\n`)

// 1) Este aparelho manda o nome "Nome Novo".
const r1 = await amigos.reenviarMeuPerfil({ name: 'Nome Novo', bio: 'bio nova', accent: 'red' })
check('primeiro envio grava', Boolean(r1?.ok), r1?.error || '')
let linha = await lerMeuPerfil(uid)
check('banco tem o nome novo', linha?.name === 'Nome Novo', `nome=${linha?.name}`)

// 2) OUTRO aparelho manda um nome diferente. O banco passa a ter o dele.
await authedFetch(`/rest/v1/user_profiles?uid=eq.${uid}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: { name: 'Nome De Outro Aparelho', bio: 'bio de outro' },
})
linha = await lerMeuPerfil(uid)
check('outro aparelho gravou o nome dele', linha?.name === 'Nome De Outro Aparelho', `nome=${linha?.name}`)

// 3) A tela deste aparelho AINDA tem o valor antigo — a sincronização não voltou
//    ainda. É exatamente nesse instante que a versão velha sobrescrevia a nova.
const r2 = await amigos.reenviarMeuPerfil({ name: 'Nome Novo', bio: 'bio nova', accent: 'red' })
check('tela com valor antigo NÃO é reenviada', r2?.igual === true, JSON.stringify(r2).slice(0, 90))
await new Promise((r) => setTimeout(r, 1200))
linha = await lerMeuPerfil(uid)
check('banco continua com o nome do outro aparelho', linha?.name === 'Nome De Outro Aparelho', `nome=${linha?.name}`)

// 3b) Prova de que este teste tem dentes: o caminho ANTIGO (gravar direto, sem
//     conferir) realmente destrói o valor novo. Se um dia isso deixar de
//     acontecer, o teste está frouxo e não serve para nada.
await amigos.garantirMeuPerfil({ name: 'Nome Novo', bio: 'bio nova', accent: 'red' })
await new Promise((r) => setTimeout(r, 1200))
linha = await lerMeuPerfil(uid)
check(
  'O CAMINHO VELHO sobrescreve mesmo (o teste pega o bug)',
  linha?.name === 'Nome Novo',
  `nome=${linha?.name} <- clobberado pelo valor velho da tela`,
)

// 4) Editar de verdade na tela tem que subir. (A bio também conta.)
const r3 = await amigos.reenviarMeuPerfil({ name: 'Nome Editado', bio: 'bio editada', accent: 'blue' })
check('edição real sobe para o banco', r3?.ok === true && r3?.igual !== true, JSON.stringify(r3).slice(0, 90))
await new Promise((r) => setTimeout(r, 1200))
linha = await lerMeuPerfil(uid)
check('banco tem o nome e a bio editados', linha?.name === 'Nome Editado' && linha?.bio === 'bio editada', `nome=${linha?.name} bio=${linha?.bio}`)

// 5) Duas edições coladas: a última tem que ganhar (ordem da fila).
const editando = amigos
  .reenviarMeuPerfil({ name: 'Segudo 1', bio: 'b', accent: 'red' })
  .then(() => amigos.reenviarMeuPerfil({ name: 'Segundo 2', bio: 'b', accent: 'red' }))
await editando
await new Promise((r) => setTimeout(r, 1500))
linha = await lerMeuPerfil(uid)
check('a última de duas edições seguidas vence', linha?.name === 'Segundo 2', `nome=${linha?.name}`)

// 6) "Viu o app" não pode viajar na gravação do perfil: tem que ser um PATCH só
//    dele, para nunca reescrever nome e bio com o que está na tela.
const antes = await lerMeuPerfil(uid)
await amigos.avisarQueEntrou()
await new Promise((r) => setTimeout(r, 1200))
const depois = await lerMeuPerfil(uid)
check(
  'avisarQueEntrou mexe só no last_seen_at',
  depois?.name === antes?.name && depois?.bio === antes?.bio,
  `antes=${antes?.name} depois=${depois?.name}`,
)
check('avisarQueEntrou grava o last_seen_at', Boolean(depois?.last_seen_at), `visto=${String(depois?.last_seen_at).slice(0, 19)}`)

const ruins = checks.filter(([, ok]) => !ok)
console.log(`\n${checks.length - ruins.length}/${checks.length} verificações passaram`)
if (ruins.length) {
  console.log('\n===== VEREDITO =====\n\n❌ O perfil ainda volta. Não é seguro publicar.')
  process.exit(1)
}
console.log('\n===== VEREDITO =====\n\n✅ O valor antigo não sobrescreve mais o novo. Bug corrigido de verdade.')
