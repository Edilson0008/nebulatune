// Sistema de amigos: tabelas user_profiles (perfil público) e friendships
// (pedidos/amizades) no Supabase. Tudo por REST autenticado, como o sync;
// sem biblioteca extra. Nada aqui expõe dados privados: só nome/bio/cor.
import { authedFetch, getUserId } from './account.js'
import { formatarCodigo, gerarCodigo } from './codigo-amigo.js'
import { avatarParaEnvio } from './avatar.js'

const TAB = 'user_profiles'
const FRI = 'friendships'

// Traz a linha do meu perfil público (ou null se ainda não existe).
export async function meuPerfil() {
  const uid = await getUserId()
  if (!uid) return null
  const { ok, data } = await authedFetch(
    `/rest/v1/${TAB}?uid=eq.${encodeURIComponent(uid)}&select=uid,code,name,bio,accent,avatar,last_seen_at`,
  )
  if (!ok) return null
  return Array.isArray(data) && data.length ? data[0] : null
}

// Todas as gravações de perfil passam por esta fila. Sem ela, duas trocas de
// foto (ou nome) disparadas antes da primeira terminar chegam ao banco fora de
// ordem — e a mais antiga sobrescreve a nova, fazendo a foto "voltar para a
// anterior". Na fila, a última chamada é sempre a última escrita.

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const mesmo = (a, b) => (a || '') === (b || '')

const bate = (linha, alvo) =>
  Boolean(linha) &&
  mesmo(linha.name, alvo.name) &&
  mesmo(linha.bio, alvo.bio) &&
  mesmo(linha.accent, alvo.accent) &&
  mesmo(linha.avatar, alvo.avatar)

// Cria meu perfil na primeira vez e mantém nome/bio/cor/foto em dia. O código é
// gerado uma única vez (a tabela tem UNIQUE nele).

// Ordena o que ainda está por enviar e entrega um por vez, com um espacinho entre
// eles. Sem fila, dois ajustes seguidos iam ao banco ao mesmo tempo e o que
// respondesse por último vencia — às vezes o que já era antigo. Todos os
// gravões de perfil passam por aqui.
const FilaPerfil = []
let rodandoFila = false
const ESPERA_ENTRE_GRAVACOES = 400

async function enfileira(tarefa) {
  return new Promise((resolve) => {
    FilaPerfil.push({ tarefa, resolve })
    if (!rodandoFila) bombeiaFila()
  })
}

function bombeiaFila() {
  if (rodandoFila) return
  const item = FilaPerfil.shift()
  if (!item) return
  rodandoFila = true
  Promise.resolve()
    .then(item.tarefa)
    .then(item.resolve, item.resolve)
    .finally(() => {
      rodandoFila = false
      setTimeout(bombeiaFila, ESPERA_ENTRE_GRAVACOES)
    })
}

// Último valor que o próprio dispositivo mandou para o banco. Só isso é
// reenviado: se o valor atual na tela veio da NUVEM (outro aparelho), reenviar
// seria devolver para o banco o que ele acabou de mandar — e foi assim que uma
// foto antiga sobrescreveu a nova.
const enviadoDispositivo = new Map()

// "Viu o app" é por conta. Com um valor só no módulo, quem entrava na segunda
// conta menos de 5 min depois da primeira não gravava o carimbo nenhum: os
// amigos dela continuavam vendo "visto há 2 dias" enquanto ela estava online.
const ultimoAviso = new Map()

// Marca "entrou no app agora". Fica separado de salvarMeuPerfil de propósito:
// o carimbo é leve e não pode viajar na mesma gravação do nome e da foto, senão
// cada abertura reescreve o perfil inteiro com o que está na tela (a versão que
// a sincronização estiver buscando) e traz a foto antiga de volta.
const AVISO_MS = 5 * 60 * 1000

export async function garantirMeuPerfil({ name, bio, accent, avatar } = {}) {
  return enfileira(async () => {
    const uid = await getUserId()
    const r = await salvarMeuPerfil({ name, bio, accent, avatar })
    if (r?.ok && r.perfil && uid) {
      enviadoDispositivo.set(uid, {
        name: r.perfil.name || '',
        bio: r.perfil.bio || '',
        accent: r.perfil.accent || '',
        avatar: r.perfil.avatar || '',
      })
    }
    return r
  })
}

// Só reenvia se o que está na tela for diferente do ÚLTIMO valor que este
// dispositivo mandou. Se a diferença veio da nuvem, não é edição da pessoa:
// mexer aqui sobrescreveria o banco com o que ele acabou de falar.
export async function reenviarMeuPerfil({ name, bio, accent, avatar } = {}) {
  const uid = await getUserId()
  if (!uid) return { ok: false, error: 'Sem sessão.' }
  const foto = await avatarParaEnvio(avatar)
  const alvo = { name: String(name || '').trim(), bio: String(bio || '').trim(), accent: String(accent || '').trim(), avatar: foto }
  const anterior = enviadoDispositivo.get(uid)
  if (anterior && bate(anterior, alvo)) return { ok: true, igual: true }
  return garantirMeuPerfil(alvo)
}

// Marca "entrou no app agora". Chamado uma vez quando o app abre com conta
// logada, separado de garantirMeuPerfil (que só grava se algo mudou).
//
// `forcar` ignora a janela de 5 min. Existe para o batimento: com a janela
// valendo, quem deixasse o app aberto mais tempo do que ela sumia do "Online
// agora" e o outro passava a ver "visto há 16 min" de alguém que estava com o
// app aberto o tempo todo. O batimento renova antes da janela vencer.
export function avisarQueEntrou({ forcar = false } = {}) {
  return enfileira(async () => {
    const uid = await getUserId()
    if (!uid) return
    const agora = Date.now()
    const anterior = ultimoAviso.get(uid) || 0
    if (!forcar && anterior && agora - anterior < AVISO_MS) return
    const { ok } = await authedFetch(`/rest/v1/${TAB}?uid=eq.${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { last_seen_at: new Date(agora).toISOString() },
    })
    // Só conta a janela quando deu certo. Marcar antes (e engolir o erro) fazia
    // o app aberto offline perder os 5 min: a pessoa ficava sem "Online agora"
    // mesmo já online, e sem nenhuma indicação de que faltou.
    if (ok) ultimoAviso.set(uid, agora)
  })
}

// Batimento de "online": enquanto o app estiver aberto e logado, renova o
// "visto" de tempos em tempos para o outro não ver a pessoa sumindo.
//
// O intervalo é menor que a janela de 2 min do `avisarQueEntrou`: assim, quem
// ficou com o app aberto continua marcado como online, e quem saiu há pouco
// também aparece. Custa uma escrita leve a cada 30 s por pessoa com o app
// aberto — o mesmo que já acontecia na troca de conta, só que cadência previsível.
const BATIMENTO_MS = 30 * 1000

export function iniciarBatimentoOnline() {
  if (typeof window === 'undefined') return () => {}
  let vivo = true
  const bater = () => {
    if (!vivo) return
    getUserId().then((uid) => {
      if (vivo && uid) avisarQueEntrou({ forcar: true })
    })
  }
  const timer = setInterval(bater, BATIMENTO_MS)
  const onVis = () => {
    if (document.visibilityState === 'visible') bater()
  }
  document.addEventListener('visibilitychange', onVis)
  // Ao voltar para o app, marca na hora: voltar do bloqueador é o momento em
  // que mais importa dizer "voltou".
  window.addEventListener('focus', bater)
  // Ao fechar, tenta marcar "saiu" na hora, para o outro não ficar olhando
  // "Online agora" de alguém que já desligou. É melhor-esforço: recarregar ou
  // fechar a aba mata a requisição, e o sistema mata o app sem aviso nenhum. Por
  // isso a janela de 2 min do `estaOnline` continua valendo como rede de
  // segurança — este aviso só faz o caso comum ser mais rápido.
  const aoSair = () => {
    if (!vivo || document.visibilityState === 'hidden') return
    getUserId().then((uid) => {
      if (!uid) return
      authedFetch(`/rest/v1/${TAB}?uid=eq.${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { Prefer: 'return=minimal' },
        body: { last_seen_at: new Date(Date.now() - (ONLINE_MIN + 1) * 60000).toISOString() },
      }).catch(() => {})
    })
  }
  window.addEventListener('pagehide', aoSair)
  return () => {
    vivo = false
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', bater)
    window.removeEventListener('pagehide', aoSair)
  }
}

async function salvarMeuPerfil({ name, bio, accent, avatar } = {}) {
  const uid = await getUserId()
  if (!uid) return { ok: false, error: 'Sem sessão.' }
  // Foto vai em miniatura: aqui é o que o amigo vê na lista e no perfil dele.
  const foto = await avatarParaEnvio(avatar)
  const alvo = { name: String(name || '').trim(), bio: String(bio || '').trim(), accent: String(accent || '').trim(), avatar: foto }

  // Já está igual no servidor? Então não é nada de gravar — e, principalmente,
  // não é chance de uma gravação velha chegar depois e desfazer isto aqui.
  const atual = await meuPerfil()
  if (bate(atual, alvo)) return { ok: true, perfil: atual }

  // Grava e confere. Se o que voltou for diferente do que queríamos, tenta de
  // novo: só sai daqui quando o banco tiver realmente a foto nova.
  for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
    const linha = await meuPerfil()
    // Não dá para usar `upsert` aqui. O banco só libera escrita nas colunas de
    // apresentação (name, bio, accent, avatar) — justamente para o `code`, que
    // identifica a conta, não poder ser reescrito. E um `upsert` vira
    // `ON CONFLICT DO UPDATE SET` de tudo que vai no corpo, o que o banco
    // recusa. Por isso são dois caminhos: PATCH quando o perfil já existe, POST
    // (só inserção, com o código gerado uma vez) quando ainda não existe.
    const gravacao = linha
      ? {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { name: alvo.name, bio: alvo.bio, accent: alvo.accent, avatar: alvo.avatar },
          url: `/rest/v1/${TAB}?uid=eq.${encodeURIComponent(uid)}`,
        }
      : {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: { uid, code: gerarCodigo(uid + (tentativa > 1 ? `-${Date.now()}` : '')), name: alvo.name, bio: alvo.bio, accent: alvo.accent, avatar: alvo.avatar },
          url: `/rest/v1/${TAB}`,
        }
    const { ok, data, status } = await authedFetch(gravacao.url, {
      method: gravacao.method,
      headers: gravacao.headers,
      body: gravacao.body,
    })
    if (!ok) {
      // 409/23505: outro aparelho criou o perfil no mesmo instante. Volta para
      // o ciclo, que agora encontra a linha e usa PATCH.
      if ((String(status) === '409' || String(data?.code) === '23505') && tentativa < 4) continue
      if (String(status) === '401' || String(status) === '403') {
        return { ok: false, error: 'O banco recusou a gravação do perfil. Rode a SQL mais recente no Supabase.' }
      }
      return { ok: false, error: 'Não deu para salvar seu perfil público.' }
    }
    const voltou = Array.isArray(data) && data[0] ? data[0] : null
    if (bate(voltou, alvo)) return { ok: true, perfil: voltou }
    // A rede pode ter cortado a resposta: confere no banco antes de desistir.
    const conferido = await meuPerfil()
    if (bate(conferido, alvo)) return { ok: true, perfil: conferido }
    await dormir(250 * tentativa)
  }
  return { ok: false, error: 'Não consegui salvar seu perfil. Tente de novo em instantes.' }
}

export async function buscarPerfilPorCodigo(codigo) {
  const c = formatarCodigo(codigo)
  const { ok, data } = await authedFetch(
    `/rest/v1/${TAB}?code=eq.${encodeURIComponent(c)}&select=uid,code,name,bio,accent,avatar`,
  )
  if (!ok) return null
  return Array.isArray(data) && data.length ? data[0] : null
}

const OUTRO = (row, meuUid) =>
  row.requester_id === meuUid ? row.addressee_id : row.requester_id

async function perfisDe(uids) {
  if (!uids.length) return []
  const lista = [...new Set(uids)]
  const { ok, data } = await authedFetch(
    `/rest/v1/${TAB}?uid=in.(${lista.join(',')})&select=uid,code,name,bio,accent,avatar,last_seen_at`,
  )
  if (!ok) return []
  return Array.isArray(data) ? data : []
}

// Lista de amigos (status 'ativo' em qualquer direção).
export async function listarAmigos() {
  const uid = await getUserId()
  if (!uid) return []
  const { ok, data } = await authedFetch(
    `/rest/v1/${FRI}?or=(${[
      `requester_id.eq.${uid}`,
      `addressee_id.eq.${uid}`,
    ].join(',')})&status=eq.ativo&select=id,requester_id,addressee_id`,
  )
  if (!ok) return []
  if (!Array.isArray(data) || !data.length) return []
  const jaVi = new Set()
  const amigos = data
    .map((r) => OUTRO(r, uid))
    .filter((u) => u && !jaVi.has(u) && (jaVi.add(u), true))
  const perfis = await perfisDe(amigos)
  const porUid = new Map(perfis.map((p) => [p.uid, p]))
  return amigos.map((u) => porUid.get(u)).filter(Boolean)
}

// Pedidos: recebidos (você decide) e enviados (aguardando resposta).
export async function listarPedidos() {
  const uid = await getUserId()
  if (!uid) return { recebidos: [], enviados: [] }
  // Filtra no servidor (só as linhas em que eu estou): o RLS já corta o resto,
  // mas baixar todos os pedidos pendentes do mundo era desperdício.
  const { ok, data } = await authedFetch(
    `/rest/v1/${FRI}?or=(${[
      `requester_id.eq.${uid}`,
      `addressee_id.eq.${uid}`,
    ].join(',')})&status=eq.pendente&select=id,requester_id,addressee_id,created_at,message`,
  )
  if (!ok) return { recebidos: [], enviados: [] }
  const rows = Array.isArray(data) ? data : []
  const recebidos = rows.filter((r) => r.addressee_id === uid)
  const enviados = rows.filter((r) => r.requester_id === uid)
  const perfis = await perfisDe(recebidos.map((r) => r.requester_id).concat(enviados.map((r) => r.addressee_id)))
  const porUid = new Map(perfis.map((p) => [p.uid, p]))
  return {
    recebidos: recebidos.map((r) => ({
      id: r.id,
      criadoEm: r.created_at,
      mensagem: r.message || '',
      perfil: porUid.get(r.requester_id),
    })),
    enviados: enviados.map((r) => ({
      id: r.id,
      criadoEm: r.created_at,
      mensagem: r.message || '',
      perfil: porUid.get(r.addressee_id),
    })),
  }
}

// Procura por nome. Vai pela função do banco (que devolve quem já está na lista
// primeiro) e só é usada quando o termo parece nome — o caminho do código
// continua existindo e é o mais rápido.
export async function buscarPorNome(termo) {
  const uid = await getUserId()
  if (!uid) return []
  const limpo = String(termo || '').trim()
  if (limpo.length < 2) return []
  const { ok, data } = await authedFetch('/rest/v1/rpc/amigos_buscar', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { p_termo: limpo },
  })
  if (!ok || !Array.isArray(data)) return []
  return data
    .filter((r) => r && r.uid && r.uid !== uid)
    .map((r) => ({
      uid: r.uid,
      codigo: r.codigo || '',
      nome: r.nome || '',
      foto: r.foto || '',
      cor: r.cor || '',
      status: r.status || '',
      criadoEm: r.criado || null,
    }))
}

async function amizadeEntre(meuUid, outro) {
  const { ok, data } = await authedFetch(
    `/rest/v1/${FRI}?or=(${[
      `and(requester_id.eq.${meuUid},addressee_id.eq.${outro})`,
      `and(requester_id.eq.${outro},addressee_id.eq.${meuUid})`,
    ].join(',')})&select=id,requester_id,addressee_id,status`,
  )
  return ok && Array.isArray(data) && data.length ? data[0] : null
}

// Texto que acompanha o pedido. Vai para a tela de quem recebe ("quer ser meu
// amigo?"), não aparece na lista de amigos e some se a amizade for desfeita.
// Limite curto de propósito: mensagem longa no pedido é ruído.
const MAX_MSG = 140

export function normalizarMensagem(msg) {
  return String(msg == null ? '' : msg)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MSG)
}

// Envia um pedido de amizade pelo código. Bloqueia pedido pra si mesmo, para
// quem já é amigo ou com pedido pendente; um pedido recusado pode ser tentado
// de novo. A mensagem é opcional — sem ela, o pedido vai como sempre foi.
export async function enviarPedido(codigo, mensagem = '') {
  const uid = await getUserId()
  if (!uid) return { ok: false, error: 'Entre na sua conta para mandar pedido.' }
  const perfil = await buscarPerfilPorCodigo(codigo)
  if (!perfil) return { ok: false, error: 'Ninguém com esse código. Confira se digitou certo.' }
  if (perfil.uid === uid) return { ok: false, error: 'Esse é o SEU código!' }
  const texto = normalizarMensagem(mensagem)
  const existente = await amizadeEntre(uid, perfil.uid)
  if (existente) {
    if (existente.status === 'ativo') return { ok: false, error: `${perfil.name || 'Essa pessoa'} já é seu amigo.` }
    if (existente.status === 'pendente') return { ok: false, error: 'Pedido já enviado. Espere a resposta.' }
    // Recusado no passado: tenta de novo. Vai pela função do banco porque só
    // quem recebeu pode dar update na linha — quem reenvia é o pedinte.
    const reenviar = async (comMensagem) => authedFetch('/rest/v1/rpc/reenviar_pedido', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      // A mensagem viaja junto. A função antiga zerava o campo e o pedido
      // chegava sem texto, como se a pessoa não tivesse escrito nada.
      body: comMensagem
        ? { p_destinatario: perfil.uid, p_mensagem: texto }
        : { p_destinatario: perfil.uid },
    })
    let { ok, data } = await reenviar(true)
    // Se a função do banco ainda é a versão antiga (a SQL com p_mensagem ainda
    // não foi aplicada), o PostgREST não acha a assinatura e devolve erro de
    // "função inexistente". O reenvio volta a funcionar sem a mensagem, e passa a
    // levar a mensagem assim que a SQL for aplicada.
    const semAfuncaoNova =
      String(data?.code || '').includes('PGRST202') || String(data?.message || '').includes('reenviar_pedido')
    if (!ok && semAfuncaoNova) ({ ok, data } = await reenviar(false))
    if (!ok || data === false) return { ok: false, error: 'Não deu para reenviar o pedido.' }
    return { ok: true, nome: perfil.name }
  }
  const { ok, status, data } = await authedFetch(`/rest/v1/${FRI}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: { requester_id: uid, addressee_id: perfil.uid, status: 'pendente', message: texto },
  })
  if (!ok) {
    // O erro do banco é o único jeito de saber o que aconteceu: 401 é sessão
    // caída, 409 é pedido duplicado, 403 é política (RLS) barrando, 4xx de
    // coluna é privilégio faltando. Sem isto a tela só dizia "não deu" e o
    // pedido sumia sem explicação.
    const detalhe = String(data?.message || data?.hint || data?.error || '')
    let motivo = 'Não deu para enviar o pedido.'
    if (status === 401) motivo = 'Sessão caiu. Entre na conta de novo.'
    else if (status === 403) motivo = 'O banco recusou o pedido (permissão).'
    else if (status === 409) motivo = 'Já existe um pedido entre vocês.'
    else if (status === 0) motivo = 'Sem conexão. Tente de novo.'
    else if (detalhe) motivo = `Não deu para enviar o pedido: ${detalhe}`
    return { ok: false, error: motivo, status, detalhe }
  }
  return { ok: true, nome: perfil.name }
}

export async function responderPedido(id, aceitar) {
  const uid = await getUserId()
  if (!uid) return { ok: false, error: 'Sem sessão.' }
  const { ok } = await authedFetch(`/rest/v1/${FRI}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { status: aceitar ? 'ativo' : 'recusado', responded_at: new Date().toISOString() },
  })
  return ok ? { ok: true } : { ok: false, error: 'Não deu para responder o pedido.' }
}

export async function cancelarPedido(id) {
  const uid = await getUserId()
  if (!uid) return { ok: false, error: 'Sem sessão.' }
  const { ok } = await authedFetch(`/rest/v1/${FRI}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
  return ok ? { ok: true } : { ok: false, error: 'Não deu para cancelar o pedido.' }
}

// ── Perfil detalhado de um amigo ─────────────────────────────────────────────
// A montagem das estatísticas é feita no banco (função amigos_perfil), não
// aqui: os números moram no sync_profiles, que é privado. A função só devolve
// as estatísticas se os dois realmente são amigos — por isso não dá para ver as
// de um desconhecido só passando o uid, mesmo chamando a RPC na mão.
// "Viu o app há 2 horas" / "agora". Só texto, no padrão do português, e sem
// prometer minuto exato: para o usuário "ontem" é mais útil que a hora.
// `agora` significa menos de 2 minutos — a mesma janela que o batimento renova,
// então quem está com o app aberto nunca fica para trás e quem fechou cai rápido.
const ONLINE_MIN = 2

export function estaOnline(iso) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t < ONLINE_MIN * 60000
}

export function quandoViu(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  if (estaOnline(iso)) return 'agora'
  // `last_seen_at` é gravado com o relógio de QUEM abriu o app, e lido com o
  // relógio de quem está olhando. Se o aparelho do amigo estiver adiantado, a
  // diferença dá negativo e o texto virava "há -4 min".
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  return 'há mais de um mês'
}

export async function verPerfilAmigo(uid) {
  if (!uid) return null
  const { ok, data, status } = await authedFetch(
    '/rest/v1/rpc/amigos_perfil',
    { method: 'POST', headers: { Prefer: 'return=representation' }, body: { p_uid: uid } },
  )
  if (!ok) {
    if (status === 404 || status === '404') return null
    return null
  }
  // A função volta como jsonb: no REST vem no corpo, ou como objeto solto.
  let bruto = data
  if (Array.isArray(bruto)) bruto = bruto[0]
  if (typeof bruto === 'string') {
    try {
      bruto = JSON.parse(bruto)
    } catch {
      return null
    }
  }
  if (!bruto || typeof bruto !== 'object') return null
  const e = bruto.estatisticas || null
  return {
    uid: bruto.uid,
    codigo: bruto.codigo || '',
    nome: bruto.nome || '',
    bio: bruto.bio || '',
    cor: bruto.cor || '',
    foto: bruto.foto || '',
    amigo: bruto.amigo === true,
    // Carimbo de "viu o app", que a tela mostra como "viu o app há 2 h".
    atualizado: bruto.atualizado || null,
    estatisticas: e
      ? {
          plays: Number(e.plays) || 0,
          musicas: Number(e.musicas) || 0,
          favoritas: Number(e.favoritas) || 0,
          dias: Number(e.dias) || 0,
          toques: Number(e.toques) || 0,
          sonhos: Number(e.sonhos) || 0,
          coracoes: Number(e.coracoes) || 0,
          compras: Number(e.compras) || 0,
          brinquedos: Number(e.brinquedos) || 0,
          banhos: Number(e.banhos) || 0,
          top: (Array.isArray(e.top) ? e.top : []).map((t) => ({
            titulo: t?.titulo || 'Sem título',
            artista: t?.artista || '',
            plays: Number(t?.plays) || 0,
            fav: t?.fav === true,
            cores: Array.isArray(t?.cores) ? t.cores : null,
            capa: t?.capa || '',
          })),
        }
      : null,
  }
}

// Desfaz a amizade. Não usa DELETE direto porque a policy só deixa quem
// PEDEU apagar a linha — quem aceitou ficaria preso na amizade pra sempre.
export async function removerAmigo(uid) {
  const meu = await getUserId()
  if (!meu || !uid) return { ok: false, error: 'Sem sessão.' }
  const { ok, data } = await authedFetch('/rest/v1/rpc/remover_amizade', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { p_outro: uid },
  })
  // A função devolve false (não_found) quando não havia amizade nenhuma.
  const apagou = ok && (data === true || (Array.isArray(data) && data[0] === true))
  return apagou ? { ok: true } : { ok: false, error: 'Não deu para remover a amizade.' }
}