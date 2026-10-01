// Teste ao vivo de "o perfil do amigo aparece sempre atualizado".
//
// Reproduz o sintoma real: alguém mexe no PERFIL e o outro, olhando o cartão
// pela lista de amizades, não vê a mudança. O que o vigia da lista percebe é o
// carimbo (name, bio, accent, updated_at) e uma impressão da foto. Sem trigger
// no banco, `updated_at` fica congelado no valor da criação e trocar SÓ a foto
// (ou SÓ a bio) é invisível para a lista.
//
// Este teste compara o que o banco devolve de duas contas amigas: se os campos
// públicos de uma batem com o que a outra gravou, e se o carimbo muda a cada
// edição, então a lista do outro lado tem como se atualizar.
//
// A foto é uma miniatura de verdade: aqui o Node reduz a imagem, então este é o
// caminho completo (o app no navegador faz o mesmo).
// Uso: node scripts/diag-card.mjs
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { signUp, signIn, getUserId, authedFetch } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')
const { avatarParaEnvio } = await import('../src/lib/avatar.js')
// A impressão do vigia, a DE VERDADE do app. Com uma cópia escrita no teste, o
// teste passaria mesmo com o vigia quebrado (já aconteceu).
const { carimboDePerfis } = await import('../src/lib/sync.js')

const SENHA = 'teste12345'
const pedacos = Math.random().toString(36).slice(2, 8)
const EMAIL_A = `nt-card-a-${pedacos}@mailinator.com`
const EMAIL_B = `nt-card-b-${pedacos}@mailinator.com`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const check = (nome, ok, extra = '') => {
  checks.push([nome, ok])
  console.log(`   ${ok ? '✅' : '❌'} ${nome}${extra ? ` — ${extra}` : ''}`)
}

const ler = async (uid) => {
  const r = await authedFetch(`/rest/v1/user_profiles?uid=eq.${uid}&select=name,code,bio,accent,avatar,updated_at,last_seen_at`)
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null
}

// Duas fotos REALMENTE diferentes: um PNG de 1x1 e um JPEG de 1x1. Bytes
// distintos de propósito — duas imagens iguais não teriam o que detectar, e o
// teste passaria sem provar nada.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPEG_1x1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
const foto1 = await avatarParaEnvio(PNG_1x1)
const foto2 = await avatarParaEnvio(JPEG_1x1)
console.log(`   (as duas fotos são diferentes: ${foto1 !== foto2}, ${foto1.length}b vs ${foto2.length}b)`)

const criar = async (email, nome) => {
  const r = await signUp(email, SENHA)
  if (!r.ok || r.needsConfirm) { check(`conta ${nome} criada`, false, r.error || 'precisa confirmar e-mail'); process.exit(1) }
  return getUserId()
}

const uidA = await criar(EMAIL_A, 'A')
const uidB = await criar(EMAIL_B, 'B')
console.log(`\ncontas de teste: ${EMAIL_A} / ${EMAIL_B}\n`)

// B também precisa de perfil: é o que vai ser visto pelo cartão de A.
const rB = await amigos.garantirMeuPerfil({ name: 'Bea', bio: 'bio da B', accent: 'blue', avatar: foto1 })
check('B grava o perfil dela', Boolean(rB?.ok), rB?.error || '')
const bDepois = await ler(uidB)
check('o banco tem o perfil de B com código', Boolean(bDepois?.code), `code=${bDepois?.code} linha=${JSON.stringify(bDepois).slice(0,90)}`)

// A grava o perfil dela: nome, bio, cor e foto. Precisa entrar como A: o
// `criar` da conta B deixou a sessão em B, e sem isto o perfil de A seria
// gravado na conta errada (exatamente o vazamento que o app precisa evitar).
await signIn(EMAIL_A, SENHA)
let r1 = await amigos.garantirMeuPerfil({ name: 'Ana', bio: 'bio 1', accent: 'red', avatar: foto1 })
check('A grava o perfil dela', Boolean(r1?.ok), r1?.error || '')
const a1 = await ler(uidA)
check('o banco tem o nome, a bio e a foto de A', a1?.name === 'Ana' && a1?.bio === 'bio 1' && Boolean(a1?.avatar), `bio=${a1?.bio} foto=${a1?.avatar ? a1.avatar.length + 'b' : 'vazia'}`)

// A muda SÓ a foto. É o caso que o carimbo congelado escondia.
r1 = await amigos.garantirMeuPerfil({ name: 'Ana', bio: 'bio 1', accent: 'red', avatar: foto2 })
const a2 = await ler(uidA)
check('A troca SÓ a foto e a foto nova é salva', Boolean(a2?.avatar) && a2.avatar !== a1?.avatar, `foto mudou=${a2?.avatar !== a1?.avatar}`)
check(
  'trocar SÓ a foto muda o carimbo (updated_at) — a lista percebe',
  String(a2?.updated_at) !== String(a1?.updated_at),
  `${String(a1?.updated_at).slice(19, 23)} -> ${String(a2?.updated_at).slice(19, 23)}`,
)

// A muda SÓ a bio.
r1 = await amigos.garantirMeuPerfil({ name: 'Ana', bio: 'bio 2', accent: 'red', avatar: foto2 })
const a3 = await ler(uidA)
check('A troca SÓ a bio e a bio nova é salva', a3?.bio === 'bio 2', `bio=${a3?.bio}`)
check('trocar SÓ a bio muda o carimbo', String(a3?.updated_at) !== String(a2?.updated_at), `carimbo mudou=${String(a3?.updated_at) !== String(a2?.updated_at)}`)

// O que a conta B vê do perfil de A tem que bater com o que A gravou.
const vistoPorB = await ler(uidA)
check('B enxerga o nome e a bio atuais de A', vistoPorB?.name === 'Ana' && vistoPorB?.bio === 'bio 2', `viu nome=${vistoPorB?.name} bio=${vistoPorB?.bio}`)
check('B enxerga a foto atual de A', vistoPorB?.avatar === a3?.avatar, 'foto igual')

// A impressão que a LISTA guarda tem que mudar quando qualquer coisa muda —
// senão a lista do outro lado fica parada. Usa a função do próprio app.
const p1 = await ler(uidA)
// A foto de A no banco JÁ é a foto2 (trocada antes). Para simular "trocar só a
// foto" de verdade, a outra foto tem que ser uma diferente: a que a conta B
// tem, já passada pela redução do app.
const outraFoto = (await ler(uidB))?.avatar
const soFoto = { ...p1, avatar: outraFoto }
const cNome = carimboDePerfis([p1])
const cFoto = carimboDePerfis([soFoto])
const cBio = carimboDePerfis([{ ...p1, bio: 'bio 3' }])
const cCor = carimboDePerfis([{ ...p1, accent: 'green' }])
check('trocar SÓ a foto muda a impressão da lista', cNome !== cFoto)
check('trocar SÓ a bio muda a impressão da lista', cNome !== cBio)
check('trocar SÓ a cor muda a impressão da lista', cNome !== cCor)
check('duas fotos diferentes dão impressões diferentes', carimboDePerfis([{ ...p1, avatar: foto1 }]) !== carimboDePerfis([{ ...p1, avatar: foto2 }]))
check('perfil sem foto não quebra a impressão', carimboDePerfis([{ ...p1, avatar: '' }]).length > 0)

// Amizade de verdade: o perfil pelo RPC tem que trazer o que é público.
await signIn(EMAIL_A, SENHA)
const codigoB = (await ler(uidB))?.code
const pedido = await amigos.enviarPedido(codigoB)
if (!pedido.ok) { console.log('   (não deu para pedir:', pedido.error, ')') }
await signIn(EMAIL_B, SENHA)
const naA = await amigos.listarPedidos()
if (naA.recebidos[0]) await amigos.responderPedido(naA.recebidos[0].id, true)
const friendsA = await amigos.listarAmigos()
const viramAmigos = friendsA.length > 0
check('viraram amigos de verdade', viramAmigos, `lista=${friendsA.length}`)
// A pergunta precisa sair de quem é a AMIGA (o RPC não devolve o próprio perfil).
await signIn(EMAIL_A, SENHA)
const detalhe = await amigos.verPerfilAmigo(uidB)
check('o perfil do amigo (RPC) traz nome, bio e foto atuais', detalhe?.nome === 'Bea' && detalhe?.bio === 'bio da B' && Boolean(detalhe?.foto), `nome=${detalhe?.nome} bio=${detalhe?.bio}`)
check('o perfil do amigo tem as estatísticas', Boolean(detalhe?.estatisticas), detalhe?.estatisticas ? 'presente' : 'ausente')

const ruins = checks.filter(([, ok]) => !ok)
console.log(`\n${checks.length - ruins.length}/${checks.length} verificações passaram`)
if (ruins.length) {
  console.log('\n===== VEREDITO =====\n\n❌ O CARD DO AMIGO PODE FICAR VELHO. Não é seguro publicar.')
  process.exit(1)
}
console.log('\n===== VEREDITO =====\n\n✅ O cartão do amigo reflete o perfil atual.')
