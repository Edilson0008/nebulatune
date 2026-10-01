// Teste ao vivo do sistema de amigos com DUAS contas reais (descartáveis,
// criadas aqui mesmo). Percorre o caminho inteiro: código → busca → pedido →
// aceite → lista, e confere os bloqueios e as travas de segurança.
// Uso: node scripts/diag-amigos.mjs
// (exige internet e as tabelas user_profiles/friendships aplicadas no Supabase.)
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
// Cada conta "usa" o mesmo aparelho: só troca a sessão.
const trocaDeSessao = () => {
  for (const k of [...store.keys()]) {
    if (k !== 'nt.sync.owner') store.delete(k)
  }
}

const { signIn, signUp, getUserId, authedFetch } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')

const SENHA = 'teste12345'
const pedacos = Math.random().toString(36).slice(2, 8)
const EMAIL_A = `nt-amig-a-${pedacos}@mailinator.com`
const EMAIL_B = `nt-amig-b-${pedacos}@mailinator.com`

const checks = []
const check = (nome, ok, extra = '') => {
  checks.push([nome, ok])
  console.log(`   ${ok ? '✅' : '❌'} ${nome}${extra ? ` — ${extra}` : ''}`)
}

async function criar(email, userName) {
  trocaDeSessao()
  const r = await signUp(email, SENHA)
  if (!r.ok || r.needsConfirm) {
    check(`conta ${userName} criada e logada`, false, r.error || 'precisa confirmar e-mail')
    return null
  }
  const uid = await getUserId()
  // O pedaço aleatório vai no nome de propósito: cada execução cria um nome
  // único, então a busca por nome do fim não esbarra nos perfis deixados pelas
  // execuções anteriores (que continuam no banco — o app não apaga login).
  const nomeUnico = `${userName} ${pedacos}`
  const perfil = await amigos.garantirMeuPerfil({ name: nomeUnico, bio: `bio do ${userName}`, accent: 'pink' })
  const codigo = perfil.perfil?.code
  console.log(`   conta ${userName} (${email}) uid=${uid?.slice(0, 8)}… código=${codigo || 'FALHOU'}`)
  return { uid, codigo, ok: perfil.ok === true && Boolean(codigo) }
}

console.log('\n===== 1) CRIAR AS DUAS CONTAS E OS PERFIS =====')
// Nomes únicos por execução (o app não apaga login, então cada rodada deixa
// duas contas no banco; nomes fixos fariam a busca do fim esbarrar nelas).
const NA = `Conta A ${pedacos}`
const NB = `Conta B ${pedacos}`
const A = await criar(EMAIL_A, 'Conta A')
const B = await criar(EMAIL_B, 'Conta B')
check('perfil da conta A criado com código', Boolean(A?.ok))
check('perfil da conta B criado com código', Boolean(B?.ok))
if (!A?.ok || !B?.ok) {
  console.log('\n❌ Sem contas/perfis: o SQL das tabelas user_profiles/friendships está aplicado no Supabase?')
  process.exit(1)
}
// A partir daqui o aparelho está na conta A (criar() termina na conta B).
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
check('conta A é a sessão ativa', (await getUserId()) === A.uid)

console.log('\n===== 2) CÓDIGOS E BUSCA =====')
// O código é derivado do uid, então tem que bater com o que está na tabela.
const esperadoA = A.codigo
check('código da conta A tem o formato NEBU-XXXXX', /^NEBU-[A-Z2-9]{5}$/.test(esperadoA), esperadoA)
const buscaB = await amigos.buscarPerfilPorCodigo(B.codigo.toLowerCase())
check('acha a conta B pelo código (sem traço e minúsculo)', buscaB?.uid === B.uid)
check('perfil público mostra só nome/bio (sem dado privado)', buscaB && !('data' in buscaB) && !('petstats' in buscaB))
const inexistente = await amigos.buscarPerfilPorCodigo('NEBU-00000')
check('código de ninguém não acha nada', inexistente === null)

console.log('\n===== 3) BLOQUEIOS ANTES DE PEDIR =====')
const paraSi = await amigos.enviarPedido(A.codigo)
check('não pede amizade a si mesmo', paraSi.ok === false, paraSi.error)
const codigoVazio = await amigos.enviarPedido('')
check('código vazio é recusado', codigoVazio.ok === false, codigoVazio.error)

console.log('\n===== 4) A MANDA PEDIDO PARA B =====')
const pedido = await amigos.enviarPedido(B.codigo)
check('pedido enviado', pedido.ok === true, pedido.nome ? `para ${pedido.nome}` : pedido.error)
const dupe = await amigos.enviarPedido(B.codigo)
check('não deixa pedir duas vezes', dupe.ok === false, dupe.error)
const enviadosA = await amigos.listarPedidos()
check(
  'A vê 1 pedido enviado',
  enviadosA.enviados.length === 1 && enviadosA.enviados[0]?.perfil?.uid === B.uid,
  `enviados: ${enviadosA.enviados.length}`,
)
check('A não tem pedido recebido', enviadosA.recebidos.length === 0)

console.log('\n===== 5) TRAVAS DE SEGURANÇA (o pedido está A → B) =====')
const idDoPedido = enviadosA.enviados[0]?.id
const statusDaLinha = async () => {
  const r = await authedFetch(`/rest/v1/friendships?id=eq.${idDoPedido}&select=status`, { method: 'GET' })
  return Array.isArray(r.data) && r.data[0]?.status
}
// Atenção: quando o RLS barra, o PostgREST devolve 204/200 com NENHUMA linha —
// ou seja, o código HTTP sozinho não prova nada. O que prova é a linha voltar
// vazia (ou com erro) e o status continuar o mesmo.
const autoAceitar = await authedFetch(`/rest/v1/friendships?id=eq.${idDoPedido}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=representation' },
  body: { status: 'ativo' },
})
check(
  'A (pedinte) NÃO consegue ativar a amizade sozinho',
  autoAceitar.ok === false || (Array.isArray(autoAceitar.data) && autoAceitar.data.length === 0),
  `HTTP ${autoAceitar.status}, linhas afetadas: ${Array.isArray(autoAceitar.data) ? autoAceitar.data.length : 0}`,
)
const sequestro = await authedFetch(`/rest/v1/friendships?id=eq.${idDoPedido}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=representation' },
  body: { requester_id: B.uid, addressee_id: A.uid, status: 'ativo' },
})
check(
  'A NÃO consegue reescrever os envolvidos da linha',
  sequestro.ok === false || (Array.isArray(sequestro.data) && sequestro.data.length === 0),
  `HTTP ${sequestro.status}`,
)
const forjarAtivo = await authedFetch(`/rest/v1/${'friendships'}`, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: { requester_id: A.uid, addressee_id: B.uid, status: 'ativo' },
})
check(
  'ninguém insere amizade já ativa (sem passar pelo aceite)',
  forjarAtivo.ok === false || (Array.isArray(forjarAtivo.data) && forjarAtivo.data.length === 0),
  `HTTP ${forjarAtivo.status}`,
)
check('o pedido continua pendente depois das tentativas', (await statusDaLinha()) === 'pendente')

// Só o PEDINTE cancela (delete). B é o addressee: não pode desfazer.
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
await authedFetch(`/rest/v1/friendships?id=eq.${idDoPedido}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
const continuaAli = await authedFetch(`/rest/v1/friendships?id=eq.${idDoPedido}&select=status`, { method: 'GET' })
check(
  'B (quem recebeu) NÃO consegue cancelar o pedido',
  Array.isArray(continuaAli.data) && continuaAli.data.length === 1,
  `linhas visíveis: ${Array.isArray(continuaAli.data) ? continuaAli.data.length : 0}`,
)

console.log('\n===== 6) B RECEBE E ACEITA =====')
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const ped1 = await amigos.listarPedidos()
check('B recebeu o pedido', ped1.recebidos.length === 1 && ped1.recebidos[0]?.perfil?.uid === A.uid)
const aceite = await amigos.responderPedido(ped1.recebidos[0].id, true)
check('B aceita a amizade', aceite.ok === true, aceite.error)
const amigosB = await amigos.listarAmigos()
check('B vê a conta A na lista de amigos', amigosB.some((p) => p.uid === A.uid), amigosB.map((p) => p.name).join(', '))

trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const amigosA = await amigos.listarAmigos()
check('A vê a conta B na lista de amigos', amigosA.some((p) => p.uid === B.uid), amigosA.map((p) => p.name).join(', '))
const deNovo = await amigos.enviarPedido(B.codigo)
check('já sendo amigos, não manda outro pedido', deNovo.ok === false, deNovo.error)

console.log('\n===== 7) RECUSAR E TENTAR DE NOVO =====')
// A desfaz a amizade (só o pedinte pode cancelar) e tenta de novo.
const desfazer = await authedFetch(
  `/rest/v1/friendships?or=(requester_id.eq.${A.uid},addressee_id.eq.${A.uid})`,
  { method: 'DELETE' },
)
check('A desfaz a amizade (delete do pedinte)', desfazer.ok === true)
const outro = await amigos.enviarPedido(B.codigo)
check('A manda um pedido novo', outro.ok === true, outro.error)
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const ped2 = await amigos.listarPedidos()
const recusa = await amigos.responderPedido(ped2.recebidos[0].id, false)
check('B recusa o pedido', recusa.ok === true, recusa.error)
const amigosDepoisDaRecusa = await amigos.listarAmigos()
check('recusado NÃO virou amizade', amigosDepoisDaRecusa.length === 0)

trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const reenvio = await amigos.enviarPedido(B.codigo)
check('A reenvia o pedido depois da recusa (função do banco)', reenvio.ok === true, reenvio.error)
const pendentesDepois = await amigos.listarPedidos()
check('o reenvio volta a ficar pendente', pendentesDepois.enviados.length === 1)

console.log('\n===== 8) CANCELAR PEDIDO =====')
// O reenvio usa a assinatura nova da função no banco. Se ela ainda não foi
// aplicada, o reenvio falha e não sobra pedido para cancelar — neste caso o
// aviso é sobre a SQL, não sobre o app, e o resto do teste precisa seguir.
let pedidoParaCancelar = pendentesDepois.enviados[0]
if (!pedidoParaCancelar) {
  console.log('\n⚠️  A função reenviar_pedido ainda é a VERSÃO ANTIGA no banco.')
  console.log('   Rode /mnt/sdcard/Download/COLE-ISSO-NO-SUPABASE-4.txt no Supabase e teste de novo.')
  console.log('   Seguindo com um pedido novo para cobrir o cancelamento.\n')
  const novo = await amigos.enviarPedido(B.codigo)
  pedidoParaCancelar = (await amigos.listarPedidos()).enviados[0] || null
  check('conseguiu mandar um pedido novo para o teste de cancelamento', Boolean(pedidoParaCancelar), novo?.error || '')
}
const cancelado = await amigos.cancelarPedido(pedidoParaCancelar.id)
check('A cancela o pedido', cancelado.ok === true, cancelado.error)
const depoisDoCancelamento = await amigos.listarPedidos()
check('não sobrou pedido pendente', depoisDoCancelamento.enviados.length === 0)
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const viuB = await amigos.listarPedidos()
check('B também não vê o pedido cancelado', viuB.recebidos.length === 0)

console.log('\n===== 9) PERFIL É DA CONTA CERTA MESMO TROCANDO DE CONTA =====')
const euComoB = await amigos.meuPerfil()
check('logado na B, o perfil é o da B', euComoB?.name === NB && euComoB?.code === B.codigo, euComoB?.code)
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const meuComoA = await amigos.meuPerfil()
check('ao voltar pra A, o perfil é o da A', meuComoA?.name === NA && meuComoA?.code === A.codigo, meuComoA?.code)
const amigosIsolados = await amigos.listarAmigos()
check('A não tem amigo nenhum depois do cancelamento', amigosIsolados.length === 0)
const enviadosIsolados = await amigos.listarPedidos()
check('A não tem pedido nenhum vazando da outra conta', enviadosIsolados.enviados.length === 0 && enviadosIsolados.recebidos.length === 0)

console.log('\n===== 10) PERFIL DETALHADO E ESTATÍSTICAS DO AMIGO =====')
// A e B ainda não são amigos aqui. Antes de aceitar, A não pode ver as
// estatísticas de B — nem chamando a função na mão.
const antesDaAmizade = await amigos.verPerfilAmigo(B.uid)
check('sem amizade: só o perfil público', antesDaAmizade?.amigo === false && antesDaAmizade?.estatisticas === null)
check('sem amizade: nome e código aparecem', antesDaAmizade?.nome === NB && antesDaAmizade?.codigo === B.codigo)

// B ganha uma "nuvem" de mentira para a função ter o que derivar: 6 músicas,
// 2 favoritas e 4 dias distintos (um deles repetido, para não contar duas vezes).
// Formato igual ao do app: capa compartilhável em `coverRemote` (o `coverUrl`
// real é blob do aparelho) e a paleta de cores em `cover`.
const LIB = [
  { id: 't1', sid: 's1', title: 'Funk da Serra', artist: 'MC Bake', plays: 90, fav: true, playDays: { '2026-03-01': 5, '2026-03-02': 2 }, cover: ['#f472b6', '#2a2450'], coverRemote: 'https://example.test/c1.jpg' },
  { id: 't2', sid: 's2', title: 'Trap do Beco', artist: 'Nave', plays: 210, playDays: { '2026-03-02': 30, '2026-03-03': 1 }, cover: ['#22d3ee', '#1a0c30'], coverRemote: 'https://example.test/c2.jpg' },
  { id: 't3', sid: 's3', title: 'Pagode da Madruga', artist: 'Dona Lia', plays: 45, fav: true, playDays: { '2026-03-03': 45 }, cover: ['#a78bfa', '#1a0c30'] },
  { id: 't4', sid: 's4', title: 'Sem Tocar', artist: 'Ninguém', plays: 0, playDays: {}, cover: ['#94a3b8', '#111'] },
  { id: 't5', sid: 's5', title: 'Meme do Gato', artist: 'DJ Miaw', plays: 7, playDays: { '2026-03-04': 7 }, cover: ['#34d399', '#111'], coverRemote: 'https://example.test/c5.jpg' },
  { id: 't6', sid: 's6', title: 'Reprise Antiga', artist: 'Vintage', plays: 3, playDays: {}, cover: ['#fbbf24', '#111'] },
]
const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const gravou = await authedFetch('/rest/v1/sync_profiles?on_conflict=uid', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates' },
  body: {
    uid: B.uid,
    data: {
      library: LIB,
      petstats: { touches: 60, sleeps: 12, hearts: 7, buys: 4 },
      toys: ['osso', 'bolinha'],
      bath: { shampoo: 2, perfume: 0 },
    },
    updated_at: new Date().toISOString(),
  },
})
check('B gravou a nuvem de teste', gravou.ok === true, `HTTP ${gravou.status}`)
const fotoB = await amigos.garantirMeuPerfil({ name: NB, bio: 'bio do B', accent: 'green', avatar: FOTO })
check('B salvou a foto no perfil público', fotoB.ok === true)

// Agora a amizade: A pede, B aceita.
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
check('A manda pedido para B', (await amigos.enviarPedido(B.codigo)).ok === true)
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const ped3 = await amigos.listarPedidos()
check('B aceita', (await amigos.responderPedido(ped3.recebidos[0].id, true)).ok === true)

trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const perfilB = await amigos.verPerfilAmigo(B.uid)
const st = perfilB?.estatisticas
check('sendo amigo, A abre o perfil completo de B', perfilB?.amigo === true && Boolean(st))
check('A vê a foto de B', perfilB?.foto === FOTO)
check('plays: 90+210+45+0+7+3 = 355', st?.plays === 355, `veio ${st?.plays}`)
check('6 músicas na coleção', st?.musicas === 6, `veio ${st?.musicas}`)
check('2 favoritas', st?.favoritas === 2, `veio ${st?.favoritas}`)
check('4 dias com música (o dia repetido conta uma vez)', st?.dias === 4, `veio ${st?.dias}`)
check('60 toques no gatinho', st?.toques === 60, `veio ${st?.toques}`)
check('2 brinquedos e 1 tipo de banho (o de 0 não conta)', st?.brinquedos === 2 && st?.banhos === 1, `brinq=${st?.brinquedos} banhos=${st?.banhos}`)
check('top 5 vem em ordem de plays e sem a que nunca tocou', st?.top.length === 5 && st.top[0].plays === 210 && !st.top.some((t) => t.titulo === 'Sem Tocar'))
const doTopComCapa = st?.top.find((t) => t.titulo === 'Funk da Serra')
check('top traz o título, a capa (link compartilhável) e se é favorita', doTopComCapa?.capa === 'https://example.test/c1.jpg' && doTopComCapa?.fav === true && doTopComCapa?.artista === 'MC Bake')
check('as 3 faixas com capa chegam com a imagem e a paleta', st?.top.filter((t) => t.capa).length === 3, `com capa: ${st?.top.filter((t) => t.capa).length}`)
// Se a função devolvesse um campo a mais, viraria vazamento de dado privado.
const CHAVES = ['banhos', 'brinquedos', 'compras', 'coracoes', 'dias', 'favoritas', 'musicas', 'plays', 'sonhos', 'toques', 'top']
check(
  'a função devolve exatamente os campos combinados (nada a mais)',
  JSON.stringify(Object.keys(st || {}).sort()) === JSON.stringify([...CHAVES].sort()),
  Object.keys(st || {}).join(','),
)
check('não vaza histórico de dias nem moedas', !JSON.stringify(st?.top || []).includes('playDays') && !JSON.stringify(st || {}).includes('coins'))

// B foi quem RECEBEU o pedido, então não consegue apagar a linha com DELETE
// direto (a policy é do pedinte). É para isso que existe remover_amizade.
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
await authedFetch(
  `/rest/v1/friendships?or=(requester_id.eq.${A.uid},addressee_id.eq.${A.uid})`,
  { method: 'DELETE' },
)
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const continuaAmigo = await amigos.listarAmigos()
check('DELETE direto de B NÃO desfaz a amizade (só o pedinte pode)', continuaAmigo.length === 1, `amigos: ${continuaAmigo.length}`)

trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const removido = await amigos.removerAmigo(A.uid)
check('B (quem aceitou) remove a amizade pela função', removido.ok === true, removido.error)
const semAmigos = await amigos.listarAmigos()
check('a lista de B ficou vazia', semAmigos.length === 0)
const removeDeNovo = await amigos.removerAmigo(A.uid)
check('remover de novo não quebra nada', removeDeNovo.ok === false)
const perfilDepois = await amigos.verPerfilAmigo(A.uid)
check('sem amizade, as estatísticas somem de novo', perfilDepois?.amigo === false && perfilDepois?.estatisticas === null)

console.log('\n===== 11) FOTO DO PERFIL: DUAS TROCAS AO MESMO TEMPO =====')
// Foto A e foto B (data URLs diferentes, minúsculas distintas). Só interessa
// qual das duas vence — o banco guarda texto, não decodifica a imagem.
const FOTO1 = 'data:image/png;base64,FOTO-ANTIGA-AAAAAAAA'
const FOTO2 = 'data:image/png;base64,FOTO-NOVA-BBBBBBBB'
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
// Dispara as duas gravações sem esperar uma terminar: é a corrida que fazia a
// foto voltar para a anterior.
const [, segunda] = await Promise.all([
  amigos.garantirMeuPerfil({ name: NA, bio: 'bio do A', accent: 'pink', avatar: FOTO1 }),
  amigos.garantirMeuPerfil({ name: NA, bio: 'bio do A', accent: 'pink', avatar: FOTO2 }),
])
check('a segunda gravação respondeu sem erro', segunda?.ok === true, segunda?.error)
const depoisDaCorrida = await amigos.meuPerfil()
check('a ÚLTIMA foto escolhida é a que fica (a antiga não sobrescreve)', depoisDaCorrida?.avatar === FOTO2, `veio: ${String(depoisDaCorrida?.avatar).slice(-12)}`)

// Agora pela rede real: B pede, A aceita, e B tem que ver a foto de A.
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
check('B manda pedido para A', (await amigos.enviarPedido(A.codigo)).ok === true)
const ped4 = await amigos.listarPedidos()
check('B recebeu o próprio pedido? não — B é quem pediu', ped4.recebidos.length === 0 && ped4.enviados.length === 1)
// A é quem tem que responder agora.
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const ped5A = await amigos.listarPedidos()
check('A recebeu o pedido de B', ped5A.recebidos.length === 1)
check('A aceita', (await amigos.responderPedido(ped5A.recebidos[0].id, true)).ok === true)

trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const perfilAparaB = await amigos.verPerfilAmigo(A.uid)
check('o amigo vê a foto nova no perfil', perfilAparaB?.foto === FOTO2, `veio: ${String(perfilAparaB?.foto).slice(-12)}`)
check('o amigo vê a foto na lista de amigos também', (await amigos.listarAmigos())[0]?.avatar === FOTO2)
check('o nome do dono da foto é o de A, não o de B', perfilAparaB?.nome === NA && perfilAparaB?.codigo === A.codigo)

// Trocar de foto de novo precisa continuar funcionando (não fica travado no
// primeiro valor depois das tentativas).
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const FOTO3 = 'data:image/png;base64,FOTO-TERCEIRA-CCCCCC'
const terceira = await amigos.garantirMeuPerfil({ name: NA, bio: 'bio do A', accent: 'pink', avatar: FOTO3 })
check('trocar a foto de novo funciona', terceira.ok === true && (await amigos.meuPerfil())?.avatar === FOTO3)
const semFoto = await amigos.garantirMeuPerfil({ name: NA, bio: 'bio do A', accent: 'pink', avatar: '' })
check('remover a foto funciona', semFoto.ok === true && (await amigos.meuPerfil())?.avatar === '')

// ── 12) Mensagem, busca por nome e último acesso ─────────────────────────────
// Sesão do A (a última troca de sessão foi para A). B precisa existir com um
// nome próprio para a busca achar.
console.log('\n===== 12) MENSAGEM DO PEDIDO, BUSCA POR NOME E ÚLTIMO ACESSO =====')

// A Etapa 11 termina com os dois amigos. A 12 precisa de um pedido NOVO, então
// desfaz a amizade antes — senão "já é seu amigo" e os testes de mensagem não
// chega a rodar.
await amigos.removerAmigo(B.uid)
check('a amizade da etapa 11 foi desfeita para a 12 começar limpa', (await amigos.listarAmigos()).length === 0)

// Busca por nome: o termo é o pedaço aleatório do e-mail, que é único por
// execução. As execuções anteriores deixaram "Conta A"/"Conta B" no banco (o app
// não apaga login) e, com o limite de 20, elas empurrariam o alvo para fora.
// Assim o acerto não depende de limpar nada.
// Busca com o nome INTEIRO do B: casa em qualquer parte do nome, e é o jeito
// que a pessoa real procura ("ana" acha "Ana Beto").
const achados = await amigos.buscarPorNome(NB)
check('busca por nome acha a pessoa (sem diferenciar maiúsculas)', achados.some((r) => r.uid === B.uid), `achou: ${achados.map((r) => r.nome).join(', ').slice(0, 60) || 'nada'}`)
check('a busca acha a pessoa certa mesmo com nomes repetidos de outras execuções', achados.filter((r) => r.uid === B.uid).length === 1, `veio ${achados.filter((r) => r.uid === B.uid).length} cópia(s) do B desta execução`)
// Busca que não diferencia maiúscula de minúscula: o mesmo nome, todo em
// caixa alta.
const misturado = await amigos.buscarPorNome(NB.toUpperCase())
check('a busca não diferencia maiúscula de minúscula', misturado.some((r) => r.uid === B.uid), `termo: ${NB.toUpperCase()}`)

// E só um pedaço do MEIO do nome, que é o caso que a busca antiga (prefixo)
// perdia. Precisa ter 2+ letras, senão a própria busca recusa por segurança.
const noMeio = await amigos.buscarPorNome(`ta B ${pedacos}`)
check('a busca acha o termo no meio do nome', noMeio.some((r) => r.uid === B.uid), `termo: ta B ${pedacos}`)
check('a busca nunca traz a si mesmo', !achados.some((r) => r.uid === A.uid))
check('busca por nome traz o código e a foto de quem achou', (() => {
  const r = achados.find((x) => x.uid === B.uid)
  return !!r && !!r.codigo
})())
check('busca por nome devolve no máximo 20', achados.length <= 20, `veio ${achados.length}`)
check('busca de 1 letra não arrasta o mundo', (await amigos.buscarPorNome('c')).length === 0)
check('busca vazia não devolve nada', (await amigos.buscarPorNome('   ')).length === 0)
check('busca por nome inexistente volta vazia', (await amigos.buscarPorNome('zzzznaoexiste')).length === 0)

// Mensagem: A pede amizade a B com texto e B (quem recebe) tem que ler.
const MSG = 'oi! achei seu gosto musical, bora ser amigo?'
const comMsg = await amigos.enviarPedido(B.codigo, `  ${MSG}  `)
check('pedido com mensagem é enviado', comMsg.ok === true, comMsg.error || '')
check('a mensagem é aparada (espaço no fim e do começo removido)', amigos.normalizarMensagem('  oi  ') === 'oi')
check('a mensagem tem limite de tamanho', amigos.normalizarMensagem('x'.repeat(300)).length === 140)

const pedidoDoA = (await amigos.listarPedidos())
check('quem mandou vê a própria mensagem no enviado', pedidoDoA.enviados.find((r) => r.perfil?.uid === B.uid)?.mensagem === MSG)

// Quem recebe só descobre a mensagem entrando como B. Trocar a sessão aqui é
// proposital: é a única forma de provar que a mensagem chega para o outro lado.
trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const vistoPorB = await amigos.listarPedidos()
const recebidoB = vistoPorB.recebidos.find((r) => r.perfil?.uid === A.uid)
check('quem recebe vê a mensagem do pedido', recebidoB?.mensagem === MSG, `veio: ${JSON.stringify(recebidoB?.mensagem)}`)
check('quem recebe vê o nome de quem pediu', recebidoB?.perfil?.name === NA, `veio: ${recebidoB?.perfil?.name}`)

// Não vaza: a linha é legível para os dois do par, e só para eles.
const linhaBruta = await authedFetch(`/rest/v1/friendships?select=message&or=(requester_id.eq.${A.uid},addressee_id.eq.${A.uid})`)
check('a mensagem fica legível para quem recebeu', Array.isArray(linhaBruta.data) && linhaBruta.data.some((r) => r.message === MSG))

// B aceita: a partir daqui A e B voltam a ser amigos, e o "viu o app" passa a
// valer para o perfil detalhado.
check('B aceita o pedido com mensagem', (await amigos.responderPedido(recebidoB.id, true)).ok === true)

// Último acesso: o perfil tem a coluna e a RPC devolve o carimbo.
const euB = await amigos.meuPerfil()
check('o perfil guarda o último acesso', !!euB?.last_seen_at, `last_seen_at: ${euB?.last_seen_at}`)

// B olha o perfil do A (agora amigo): tem que vir o carimbo de acesso do A.
// Pedir o perfil de si mesmo devolve null — é o que impede a própria pessoa de
// ler as próprias estatísticas por esse caminho.
check('pedir o perfil de si mesmo não devolve nada', (await amigos.verPerfilAmigo(B.uid)) === null)
const profA = await amigos.verPerfilAmigo(A.uid)
check('o perfil do amigo traz o carimbo de quando a pessoa entrou', profA?.amigo === true && typeof profA?.atualizado === 'string', `amigo:${profA?.amigo} atualizado:${profA?.atualizado}`)
// O carimbo tem que bater com o perfil público do A — é o que garante que a tela
// não mostra um horário inventado. Preciso ler o perfil do A como A (a sessão
// agora é a do B, senão "eu" seria outra pessoa).
trocaDeSessao()
await signIn(EMAIL_A, SENHA)
const euAReal = await amigos.meuPerfil()
check('o carimbo do amigo é o mesmo do perfil público dele', profA?.atualizado === euAReal?.last_seen_at, `visto no amigo:${profA?.atualizado} | no perfil:${euAReal?.last_seen_at}`)

check('"quando viu" escreve em português', amigos.quandoViu(new Date().toISOString()) === 'agora', `veio: ${amigos.quandoViu(new Date().toISOString())}`)
check('"quando viu" entende ontem', amigos.quandoViu(new Date(Date.now() - 26 * 3600e3).toISOString()) === 'ontem')
check('"quando viu" não quebra com data suja', amigos.quandoViu('lixo') === null && amigos.quandoViu(null) === null)

// Avisar que entrou: a primeira chamada grava (é o "entrei agora"), as
// seguintes não. É esse o ponto — abrir o app não pode virar enxurrada de PATCH.
await amigos.avisarQueEntrou()
const t1 = (await amigos.meuPerfil())?.last_seen_at
await amigos.avisarQueEntrou()
const t2 = (await amigos.meuPerfil())?.last_seen_at
await amigos.avisarQueEntrou()
check('avisar que entrou não repete em seguida', t1 === t2, `antes:${t1} depois:${t2}`)

// A lista de amigos traz o carimbo, que é o que a tela mostra ao lado da bio.
const listaA = await amigos.listarAmigos()
check('a lista de amigos traz o último acesso de cada um', (() => {
  const bNaLista = listaA.find((x) => x.uid === B.uid)
  return !!bNaLista && typeof bNaLista.last_seen_at === 'string'
})())

// A busca mostra o status de quem já está na lista, e "vazio" para quem não está
// (é assim que a tela sabe que pode offering "Adicionar").
const buscaA = await amigos.buscarPorNome(NB)
check('a busca mostra o status de quem já é amigo', buscaA.find((x) => x.uid === B.uid)?.status === 'ativo', `status visto: ${buscaA.find((x) => x.uid === B.uid)?.status}`)

trocaDeSessao()
await signIn(EMAIL_B, SENHA)
const buscaDeB = await amigos.buscarPorNome(NA)
check('a busca mostra o status de quem mandou o pedido', buscaDeB.find((x) => x.uid === A.uid)?.status === 'ativo', `status visto: ${buscaDeB.find((x) => x.uid === A.uid)?.status}`)

console.log('\n===== LIMPEZA =====')
for (const uid of [A.uid, B.uid]) {
  const f = await authedFetch(`/rest/v1/friendships?or=(requester_id.eq.${uid},addressee_id.eq.${uid})`, { method: 'DELETE' })
  const p = await authedFetch(`/rest/v1/user_profiles?uid=eq.${uid}`, { method: 'DELETE' })
  const s = await authedFetch(`/rest/v1/sync_profiles?uid=eq.${uid}`, { method: 'DELETE' })
  console.log(`   ${uid.slice(0, 8)}… amizades:${f.ok ? 'ok' : 'falhou'} perfil:${p.ok ? 'ok' : 'falhou'} sync:${s.ok ? 'ok' : 'falhou'}`)
}
console.log('   (os dois logins de teste ficam no Supabase; o app não apaga usuário pela API)')

console.log('\n===== VEREDITO =====')
let tudo = true
for (const [, passou] of checks) {
  if (!passou) tudo = false
}
console.log(tudo ? '\n✅ TUDO CERTO: amigos, pedidos, bloqueios e travas de segurança.' : '\n❌ Ainda falta algo (veja as linhas acima).')
process.exit(tudo ? 0 : 1)
