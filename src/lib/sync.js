// Sincronização opcional (Supabase). Sobe só dados LEVES (metadados e
// estatísticas); os arquivos de música continuam 100% locais.
//
// Filosofia do merge: SEMPRE JUNTAR, NADA SOME. Cada seção faz a união do que
// existe nos dois lados — contadores só crescem, listas só acumulam (sem
// duplicar) e nenhum valor é apagado. Uniões são idempotentes, então o merge
// converge após uma rodada.

import { readLocal, clearAllMedia, writeLocal } from '../localstore.js'
import { accountConfigured, authedFetch, clearSession, getUserId } from './account.js'
import { MOOD_KEYS, juntaConsumido } from './pet.js'

export const SYNC_TABLE = 'sync_profiles'
const RESULT_KEY = 'nt.sync.merged'
const STATUS_KEY = 'nt.sync.status'
const OWNER_KEY = 'nt.sync.owner'

// ── Dono dos dados do aparelho ───────────────────────────────────────────────
// Marcação usada só para a decisão de "conta nova = começa do zero" (a conta
// que sincroniza de verdade assume a posse). Entrar numa conta que já exista
// não precisa de permissão: o app só carrega/junta os dados, que é o que a
// pessoa espera.
export function marcarDono(uid) {
  if (uid) writeLocal(OWNER_KEY, uid)
}

// "Conta nova" = começa do zero: apaga os dados deste aparelho (e os arquivos
// de mídia) para a conta recém-criada não herdar nada da conta anterior. A
// sessão e o dono continuam — o app recarrega e nasce limpo.
export async function novoTudoDoZero(uid) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith('nt.') && k !== 'nt.account.session' && k !== OWNER_KEY) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* storage indisponível: segue */
  }
  await clearAllMedia()
  marcarDono(uid || null)
}

// Dono marcado atualmente (conta a que os dados deste aparelho pertencem).
/**
 * Há dados de alguma conta neste aparelho para uma troca de conta substituir?
 *
 * A marca de dono (`nt.sync.owner`) diz de quem é o estado guardado aqui. Se
 * ela aponta para outra conta, a leitura normal é "houve troca" — e aí a
 * sincronização apaga o estado inteiro antes de juntar as coisas. Isso só faz
 * sentido se houver mesmo um estado antigo para trocar.
 *
 * Se o aparelho está vazio (a pessoa acabou de limpar os dados, ou é a conta
 * nova entrando), a marca é lixo antigo e a conta que entrou deve simplesmente
 * assumir a posse. Sem esta distinção, cada rodada de sincronização recomeçava
 * a conta do zero e o app "resetava tudo sozinho" sem parar.
 */
export function haveriaDadosParaTrocar() {
  try {
    const temRetrato = todasAsChaves().some((k) => eRetrato(k))
    const temEstado = Boolean(
      readLocal('nt.settings') || readLocal('nt.inv') || readLocal('nt.petstats') || readLocal('nt.playlists') || readLocal('nt.achSeen') || readLocal('nt.toys'),
    )
    return Boolean(temRetrato || temEstado)
  } catch {
    // Sem conseguir ler: presume que há estado (o caminho seguro é NÃO apagar).
    return true
  }
}

export function donoDosDados() {
  return readLocal(OWNER_KEY) || null
}

// ── Retrato (snapshot) de cada conta ────────────────────────────────────────
// Sem isto, trocar de conta apagava tudo da conta que saiu: ao voltar, a
// biblioteca vinha pela nuvem e as músicas importadas sumiam. O retrato guarda
// o estado por conta no próprio aparelho, para que cada uma volte EXATAMENTE
// como estava — e para que nada de uma conta apareça na outra.
//
// As capas (nt.cover.*) NÃO entram: são só cache visual e podem ser refeitas a
// partir dos blobs. O áudio também não entra: fica no IndexedDB, já que o
// retrato guarda apenas metadados.
const SNAP_PREFIX = 'nt.snap.'

// Montado sob demanda: NAO_SINCRONIZA só existe mais abaixo no arquivo, e
// evaluates-lo aqui quebraria o módulo inteiro.
let _naoSnapshot = null
function naoEParaRetrato(k) {
  if (!_naoSnapshot) _naoSnapshot = new Set(['nt.account.session', 'nt.sync.owner', ...NAO_SINCRONIZA])
  return _naoSnapshot.has(k)
}

const chaveDoRetrato = (uid) => (uid ? `${SNAP_PREFIX}${uid}` : null)

// Coleta o retrato completo de uma conta: toda chave `nt.*` que é por-conta.
export function coletarRetrato(uid) {
  if (!uid) return null
  const dados = {}
  try {
    for (const k of todasAsChaves()) {
      if (!k.startsWith('nt.') || naoEParaRetrato(k) || k.startsWith('nt.cover.')) continue
      // Um retrato NUNCA guarda outro retrato: senão o estado da conta A
      // acabava dentro do retrato da conta B, e de dentro do outro, e o
      // aparelho virava uma trouxa de estados misturados.
      if (eRetrato(k)) continue
      const v = readLocal(k)
      if (!vazio(v)) dados[k] = v
    }
  } catch {
    /* storage indisponível: segue com o que deu */
  }
  // A marca de dono. Ela não começa com `nt.`, então `aplicarRetrato` a ignora e
  // nunca vira uma chave solta no storage.
  dados._uid = uid
  return dados
}

export function lerRetrato(uid) {
  if (!uid) return null
  const r = readLocal(chaveDoRetrato(uid))
  return isObj(r) ? r : null
}

// Todos os ids de música que este aparelho já conheceu, em QUALQUER conta: a
// conta atual mais os retratos das outras.
//
// Existe para a limpeza de espaço: o arquivo de música é do APARELHO, não da
// conta, e apagar de menos é perder música de verdade. Sem esta lista, trocar de
// conta e pedir para liberar espaço apagava os arquivos da conta anterior — que
// ainda estavam esperando para quando ela voltasse.
export function idsDeTodasAsContas(idsDaContaAtual = []) {
  const ids = new Set()
  for (const id of idsDaContaAtual) if (id) ids.add(String(id))
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(SNAP_PREFIX)) continue
    const snap = lerRetrato(k.slice(SNAP_PREFIX.length))
    if (!snap || !Array.isArray(snap.library)) continue
    for (const row of snap.library) {
      if (row && row.id) ids.add(String(row.id))
    }
  }
  return [...ids]
}

// Guarda o retrato da conta que está no aparelho agora.
export function salvarRetrato(uid) {
  if (!uid) return
  try {
    const dados = coletarRetrato(uid)
    // A marca de dono permite desconfiar de um retrato que veio de onde não
    // devia (a mistura de contas que existiu antes desta correção).
    dados._uid = uid
    if (Object.keys(dados).length) writeLocal(chaveDoRetrato(uid), dados)
  } catch {
    /* storage cheio/indisponível: a nuvem ainda cobre a conta */
  }
}

// Reparo único: tira de dentro de cada retrato os retratos que foram parar ali
// (a conta que se misturou), e descarta um retrato que claramente pertence a outra
// conta. Roda uma vez, na abertura.
export function limparRetratosEmbutidos() {
  let mudou = false
  for (const uid of uidsComRetrato()) {
    const chave = chaveDoRetrato(uid)
    const snap = lerRetrato(uid)
    if (!snap) continue
    if (snap._uid && snap._uid !== uid) {
      localStorage.removeItem(chave)
      mudou = true
      continue
    }
    const limpo = {}
    let tireiAlgo = false
    for (const [k, v] of Object.entries(snap)) {
      if (eRetrato(k)) {
        tireiAlgo = true
        continue
      }
      limpo[k] = v
    }
    if (tireiAlgo) {
      writeLocal(chave, limpo)
      mudou = true
    }
  }
  return mudou
}

export function uidsComRetrato() {
  const out = []
  for (const k of todasAsChaves()) {
    if (k.startsWith(SNAP_PREFIX) && k.length > SNAP_PREFIX.length) out.push(k.slice(SNAP_PREFIX.length))
  }
  return out
}

// Recoloca no aparelho o retrato de uma conta. Devolve quantas chaves voltaram,
// para a tela saber se havia algo a restaurar.
// ISOLA O APARELHO PARA UMA CONTA, INTEIRO E NA HORA.
//
// Esta é a única porta de entrada para "entrou outra conta". Ela roda no
// aparelho, sem rede e sem esperar nada, e faz três coisas na ordem:
//
//   1. guarda o retrato da conta que SAI (senão as conquistas dela se perdem);
//   2. apaga do aparelho tudo que é POR-CONTA, para nada sobrar;
//   3. volta o retrato da conta que ENTRA.
//
// A conta que entra tem, depois disto, UM estado que é só dela — e o resto do
// app só precisa reler. Sem este passo, a memória do navegador continuava com
// as moedas, o pet e as conquistas da conta anterior, e a tela mostrava dados de
// uma conta na outra: vazamento visível, e os efeitos de gravar terminavam
// guardando o Vazamento de volta.
// AVISO DE ISOLAMENTO.
//
// Qualquer tela que guarde estado por conta na MEMÓRIA precisa reler quando a
// conta troca, senão ela mostra (e regrava) o estado da conta anterior. Em vez
// de cada tela adivinhar isso, `isolarParaConta` AVISA, e toda tela que tiver
// estado por conta se inscreve aqui.
let EPOCA_ISOLAMENTO = 0
const ouvintesDeIsolamento = new Set()

export function aoIsolarConta(fn) {
  ouvintesDeIsolamento.add(fn)
  return () => {
    ouvintesDeIsolamento.delete(fn)
  }
}

function avisarIsolamento() {
  EPOCA_ISOLAMENTO += 1
  for (const fn of Array.from(ouvintesDeIsolamento)) {
    try {
      fn(EPOCA_ISOLAMENTO)
    } catch {
      /* uma tela quebrada não pode impedir a de baixo de isolar */
    }
  }
}

export function isolarParaConta(uid) {
  const dono = donoDosDados()
  const trocou = Boolean(dono && dono !== uid)
  if (trocou) {
    // 1. O retrato da conta que sai vai primeiro, senão o passo 2 apaga o
    //    estado dela e ela volta zerada quando a pessoa logar de novo.
    salvarRetrato(dono)
    // 2. Nada por-conta fica para trás.
    removerDadosDeContaAnterior()
    // nt.library sobrevive (é do aparelho), mas os números dela não: plays,
    // favorita e playDays dizem a quem a escuta foi.
    writeLocal('nt.library', soCatalogoDaBiblioteca(readLocal('nt.library')))
  }
  // 3. O estado da conta que entra é o dela — e o retrato é a única fonte que
  //    vale. Sem retrato, o estado fica VAZIO (que é o certo), nunca o da conta
  //    que saiu.
  //
  //    O retrato e aplicado SEMPRE que existir, e não só quando houve troca.
  //    Voltar para uma conta que já usou este aparelho é o caso em que mais
  //    importa, e é justamente ali que a condição antiga pulava a aplicação:
  //    a marca de dono apontava para a conta, então não contava como troca, e
  //    o estado dela ficava vazio depois de todo o trabalho de ter guardado o
  //    retrato. A pessoa logava de volta e encontrava a conta zerada.
  if (uid) {
    if (lerRetrato(uid)) aplicarRetrato(uid)
    marcarDono(uid)
  }
  avisarIsolamento()
  return trocou
}

export function aplicarRetrato(uid) {
  const r = lerRetrato(uid)
  if (!r) return 0
  let n = 0
  for (const [k, v] of Object.entries(r)) {
    if (!k.startsWith('nt.') || naoEParaRetrato(k)) continue
    try {
      writeLocal(k, v)
      n += 1
    } catch {
      /* uma chave que não coube não pode derrubar o resto */
    }
  }
  return n
}

// Troca de conta = isola: apaga do aparelho tudo que é POR-CONTA (perfil,
// moedas, inventário, recordes, ajustes...) para que nada fique para trás nem
// some com a conta que entrou. Músicas (nt.library) e capas (nt.cover.*) fi-
// cam — são do aparelho; capas são só cache, e a biblioteca é o arquivo.
function removerDadosDeContaAnterior() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('nt.')) continue
      if (
        k === 'nt.account.session' ||
        k === 'nt.sync.owner' ||
        k === 'nt.library' ||
        k.startsWith('nt.cover.') ||
        k.startsWith(SNAP_PREFIX) ||
        NAO_SINCRONIZA.has(k)
      ) {
        continue
      }
      localStorage.removeItem(k)
    }
  } catch {
    /* storage indisponível: segue */
  }
}

// Depois de limpar, grava NO APARELHO exatamente o que a conta tem na nuvem:
// o syncApply vai pro estado do app, e esta gravação garante que as telas que
// leem o storage na hora (recordes, diário, minigames) já vejam a conta certa.
// As seções que a conta nunca teve ficam sem chave aqui (nada do dono antigo).
//
// `preferirLocal` (o retrato que acabou de voltar) tem a palavra final: quando o
// aparelho já tem o valor, a nuvem só preenche o buraco — sobrescrever aqui
// perderia o que a pessoa tinha neste aparelho.
function gravarSectionsDoCloud(cloud, preferirLocal) {
  const local = preferirLocal && typeof preferirLocal === 'object' ? preferirLocal : {}
  const secaoParaChave = {
    settings: 'nt.settings',
    settingsAt: 'nt.settingsAt',
    petstats: 'nt.petstats',
    inv: 'nt.inv',
    invUsado: 'nt.invUsado',
    toys: 'nt.toys',
    bath: 'nt.bath',
    bathUsado: 'nt.bathUsado',
    achSeen: 'nt.achSeen',
    playlists: 'nt.playlists',
    playedRecent: 'nt.playedRecent',
    libApagadas: 'nt.libApagadas',
  }
  const jaTem = (campo) => !vazio(local[campo])
  for (const [campo, chave] of Object.entries(secaoParaChave)) {
    // O retrato local manda: aqui só sincronizamos o que ainda está vazio.
    if (jaTem(campo)) continue
    const v = cloud[campo]
    if (vazio(v)) localStorage.removeItem(chave)
    else writeLocal(chave, v)
  }
  for (const [k, v] of Object.entries(cloud.extras || {})) {
    if (k.startsWith('nt.') && !NAO_SINCRONIZA.has(k) && !SECOES.includes(k)) writeLocal(k, v)
  }
}

// Status da última tentativa: a tela "Minha conta" mostra isso para nunca
// falhar em silêncio.
export function getSyncStatus() {
  return readLocal(STATUS_KEY)
}

function setSyncStatus(patch) {
  const cur = readLocal(STATUS_KEY) || {}
  writeLocal(STATUS_KEY, { ...cur, ...patch, at: Date.now() })
}

// ── Leitura das seções locais ────────────────────────────────────────────────
export function collectLocal() {
  return {
    settings: readLocal('nt.settings'),
    petstats: readLocal('nt.petstats'),
    inv: readLocal('nt.inv'),
    invUsado: readLocal('nt.invUsado'),
    toys: readLocal('nt.toys'),
    bath: readLocal('nt.bath'),
    bathUsado: readLocal('nt.bathUsado'),
    achSeen: readLocal('nt.achSeen'),
    playlists: readLocal('nt.playlists'),
    library: readLocal('nt.library'),
    playedRecent: readLocal('nt.playedRecent'),
    libApagadas: readLocal('nt.libApagadas'),
    settingsAt: Number(readLocal('nt.settingsAt')) || 0,
    extras: collectExtras(),
  }
}

// ── Merges por seção (funções puras, testáveis) ─────────────────────────────

const pickMax = (a, b) => {
  const na = Number(a) || 0
  const nb = Number(b) || 0
  return na > nb ? na : nb
}

// Gatinho: contadores só crescem; barras de humor e lt ficam com o maior.
// Campos que DIMINUEM sozinhos com o tempo: as barras de necessidade do
// gatinho. Eles não podem entrar no "pega o maior dos dois" — era o que fazia
// as barras voltarem cheias assim que a sincronização rodava.
const DIMINUEM = new Set(MOOD_KEYS)

export function mergePetstats(a, b) {
  const out = {}
  const keys = new Set([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])])
  // Qual das duas cópias é a mais recente? As barras vêm dela inteira, senão
  // misturar "a barra mais alta de uma" com "o relógio da outra" produz um
  // estado que nunca existiu (barra cheia com relógio velho = barra reidratada).
  const ltA = a ? Number(a.lt) || 0 : 0
  const ltB = b ? Number(b.lt) || 0 : 0
  const maisRecente = ltA >= ltB ? a : b
  const maisAntigo = ltA >= ltB ? b : a
  for (const k of keys) {
    const va = a ? Number(a[k]) || 0 : 0
    const vb = b ? Number(b[k]) || 0 : 0
    if (DIMINUEM.has(k)) {
      // Quem tem a barra mais recente manda. Mas se essa cópia não tem a
      // chave, usava 0 — e 0 é um valor de verdade ("gatinho com fome"), não
      // "desconhecido". O efeito era a barra pular para o chão só por causa de
      // um campo que não veio. Nesse caso pegamos a da outra cópia.
      const v = maisRecente && typeof maisRecente[k] === 'number' && Number.isFinite(maisRecente[k])
        ? maisRecente[k]
        : Number(maisAntigo && maisAntigo[k]) || 0
      out[k] = v
    } else out[k] = k === 'lt' ? (va > vb ? va : vb) : va > vb ? va : vb
  }
  out.lt = Math.max(ltA, ltB)
  return out
}

// Gatinho inventário/banho: quantidade por item = maior dos dois.
export function mergeCounters(a, b) {
  const out = {}
  const keys = new Set([
    ...(a && typeof a === 'object' ? Object.keys(a) : []),
    ...(b && typeof b === 'object' ? Object.keys(b) : []),
  ])
  for (const k of keys) {
    out[k] = pickMax(a?.[k], b?.[k])
  }
  return out
}

// Ajustes + listas de strings: união por valor, sem duplicar, preservando
// a ordem de quem veio antes (mais estável).
export function mergeStrings(a, b) {
  const out = []
  const seen = new Set()
  const push = (arr) => {
    for (const v of Array.isArray(arr) ? arr : []) {
      if (v && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
  }
  push(a)
  push(b)
  return out
}

// SIDs que a pessoa APAGOU da biblioteca. É uma lápide: a biblioteca é união
// entre aparelho e nuvem, então sem isto a música apagada voltaria no próximo
// sync — e, pior, os plays dela continuariam contando no perfil do amigo.
export function mergeApagadas(a, b) {
  return mergeStrings(a, b)
}

// Apagada vence: uma faixa nesta lista não volta, nem por union.
export function semApagadas(rows, apagadas) {
  const mortos = new Set(Array.isArray(apagadas) ? apagadas.filter(Boolean) : [])
  if (!mortos.size) return Array.isArray(rows) ? rows : []
  return (Array.isArray(rows) ? rows : []).filter((r) => !r || !(r.sid && mortos.has(r.sid)))
}

// Bibliotecas: união por sid; por faixa, plays = maior, favorita = qualquer,
// playDays = união, metadados do lado que tiver (local ganha por ter áudio).
export function mergeLibrary(a, b, apagadas) {
  const bySid = new Map()
  const seed = (row, side) => {
    const sid = row.sid || ''
    const cur = bySid.get(sid)
    if (!cur) {
      bySid.set(sid, {
        ...row,
        sid,
        audioMissing: row.audioMissing !== false,
        fav: row.fav === true,
        plays: Number(row.plays) || 0,
        playDays: { ...(row.playDays || {}) },
      })
      return
    }
    cur.plays = pickMax(cur.plays, row.plays)
    cur.fav = cur.fav || row.fav === true
    cur.playDays = { ...cur.playDays, ...(row.playDays || {}) }
    if (side.local && !cur.audioBlob && row.audioBlob) {
      cur.audioBlob = row.audioBlob
      cur.src = row.src
    }
    if (cur.audioMissing && row.audioMissing === false) cur.audioMissing = false
    for (const k of ['title', 'artist', 'album', 'duration', 'cover', 'coverRemote', 'coverShare', 'addedAt']) {
      if (!cur[k] && row[k]) cur[k] = row[k]
    }
  }
  for (const row of b || []) {
    if (row && row.sid) seed(row, { local: false })
  }
  for (const row of a || []) {
    if (row && (row.sid || row.id)) seed({ ...row, sid: row.sid || row.id }, { local: true })
  }
  const toRow = (sid) => {
    const r = bySid.get(sid)
    if (!r) return null
    return {
      id: r.id || `sync-${sid}`,
      sid,
      title: r.title || 'Sem título',
      artist: r.artist || 'Desconhecido',
      album: r.album || '',
      duration: r.duration || 0,
      cover: r.cover || null,
      // `coverUrl` pode ser um blob do aparelho (não serve para outro
      // dispositivo); `coverRemote` é o que dá para compartilhar. Se só
      // houver um coverUrl que é mesmo um endereço http, aproveita ele. E se a
      // capa veio do próprio arquivo, `coverShare` traz a miniatura de 64px
      // (data URL) — que o outro aparelho consegue abrir, ao contrário do blob.
      coverRemote:
        r.coverRemote ||
        r.coverShare ||
        (typeof r.coverUrl === 'string' && r.coverUrl.startsWith('http') ? r.coverUrl : null) ||
        null,
      // Vai junto para a miniatura não se perder no caminho: sem isto ela
      // sobrevive em `coverRemote` mas some no próximo merge.
      coverShare: r.coverShare || null,
      addedAt: r.addedAt || Date.now(),
      fav: r.fav === true,
      plays: r.plays || 0,
      playDays: r.playDays || {},
      audioMissing: r.audioMissing !== false,
      audioBlob: r.audioBlob,
      src: r.src,
      coverUrl: r.coverUrl,
    }
  }
  return semApagadas([...bySid.keys()].map(toRow), apagadas)
}

// Playlists: união por id; trackIds vira união ordenada.
export function mergePlaylists(a, b) {
  const byId = new Map()
  for (const p of a || []) {
    if (p && p.id) byId.set(p.id, { ...p, trackIds: Array.isArray(p.trackIds) ? [...p.trackIds] : [] })
  }
  for (const p of b || []) {
    if (!p || !p.id) continue
    const cur = byId.get(p.id)
    if (!cur) {
      byId.set(p.id, { ...p, trackIds: Array.isArray(p.trackIds) ? [...p.trackIds] : [] })
    } else {
      cur.trackIds = mergeStrings(cur.trackIds, p.trackIds)
      if (!cur.name && p.name) cur.name = p.name
    }
  }
  return [...byId.values()]
}

// Ajustes (nt.settings): quem mudou POR ÚLTIMO vence — é o que a pessoa espera
// ao trocar o nome ou a cor em um aparelho e ver mudar no outro. Um campo
// VAZIO (nome em branco, bio nunca preenchida) nunca apaga o que o outro tem.
const vazio = (v) => v === '' || v === null || v === undefined

// ── Ajustes (nome, cor, etc.) ────────────────────────────────────────────────
// Quem editou por ÚLTIMO vence (usando o horário do ajuste). Caso especial:
// quando NENHUM lado tem horário (aAt e bAt são 0), o aparelho acabou de ser
// reconfigurado e a nuvem guarda o que a conta tinha de verdade — então vale a
// nuvem. Sem isso, os padrões do aparelho (nome vazio, cor padrão) ganhavam e
// apagavam o perfil de contas antigas na nuvem.
export function mergeSettings(a, b, aAt = 0, bAt = 0) {
  const local = a && typeof a === 'object' ? a : {}
  const nuvem = b && typeof b === 'object' ? b : {}
  const maisNovoNaNuvem = Number(bAt) > Number(aAt) || (Number(bAt) === Number(aAt) && Number(bAt) === 0)
  const out = { ...nuvem }
  for (const [k, v] of Object.entries(local)) {
    if (vazio(v)) {
      // vazio não apaga o que o outro lado tem
      if (vazio(out[k])) out[k] = v
      continue
    }
    if (vazio(nuvem[k])) {
      // chave que só existe neste aparelho: mantém o valor daqui
      out[k] = v
      continue
    }
    if (maisNovoNaNuvem) continue
    out[k] = v
  }
  return out
}

// ── "Tudo o mais" ────────────────────────────────────────────────────────────
// Além das seções acima, o app guarda mais coisa (recordes dos minijogos,
// diário, equalizador, letras traduzidas...). Em vez de listar uma por uma e
// esquecer alguma, sincronizamos TODA chave `nt.*` que ainda não foi tratada.

const SECOES = [
  'nt.settings', 'nt.petstats', 'nt.inv', 'nt.toys', 'nt.bath',
  'nt.achSeen', 'nt.playlists', 'nt.library', 'nt.playedRecent',
  'nt.settingsAt', 'nt.libApagadas', 'nt.invUsado', 'nt.bathUsado',
]

// Nunca vai para a nuvem: a sessão, o estado do próprio sync, e avisos que
// são uma coisa só deste aparelho.
const NAO_SINCRONIZA = new Set([
  'nt.account.session', 'nt.sync.merged', 'nt.sync.status', 'nt.sidMigrated',
  'nt.notifAsked', 'nt.petNotif', 'nt.updatePrompted',
])

// Os RETRATOS (uma cópia do estado de cada conta que já usou este aparelho) são
// do APARELHO, nunca da conta. Deixá-los passar por `extras` colocava o retrato
// de A dentro do perfil de B na nuvem, e o `applyExtras` depois gravava isso de
// volta no aparelho: as contas se misturavam inteiras (biblioteca, plays,
// playlists, moedas), a biblioteca ficava pela metade e o payload crescia a
// cada troca de conta até o envio à nuvem falhar.
function eRetrato(k) {
  return k.startsWith(SNAP_PREFIX)
}

// O QUE A LIMPEZA DE MISTURA APAGA — e o que ela JAMAIS toca.
//
// A mistura não tem como ser desfeita com Surgery: dentro do estado guardado
// não existe marca de qual conta era cada pedaço. Então a conta recomeça do
// zero, uma conta por vez. Só que recomeçar NÃO pode custar as músicas: os
// arquivos de áudio e a lista delas são o que o usuário tem de mais difícil de
// repor, e eles não são o que estava misturado.
const NAO_APAGAR_NA_LIMPEZA = new Set([
  'nt.account.session', // sessão: não obriga a digitar a senha de novo
  'nt.library', // a lista de músicas
  'nt.notifAsked',
  'nt.petNotif',
  'nt.updatePrompted',
  'nt.sidMigrated',
  'nt.sync.merged',
  'nt.sync.status',
  // NOTA: a marca de DONO (`nt.sync.owner`) NÃO está nesta lista — ela sai
  // junto com o resto. Ela é quem diz ao app "estes dados são da conta X" e,
  // sozinha depois da limpeza, continuava apontando para a conta antiga: aí
  // toda sincronização entendia que era uma troca de conta e APAGAVA o estado
  // recomeçado, uma vez atrás da outra, sem parar.
])

// Cada faixa "zera" o que é da conta (plays, favorita, dias) e mantém o que é
// da música. Sem isso, a conta nova nasceria com a pontuação embolada de outra.
function zerarContagemDaLinha(m) {
  return {
    ...m,
    plays: 0,
    playDays: {},
    fav: false,
    downloaded: false,
    addedAt: m.addedAt || 0,
  }
}

/**
 * Apaga o estado que se embolou entre as contas neste aparelho, preservando as
 * músicas. Devolve um relatório do que saiu, para o app poder avisar.
 */
export function limparDadosMisturados() {
  const removidas = []
  let musicas = []
  try {
    for (const k of todasAsChaves()) {
      if (!k.startsWith('nt.')) continue
      if (NAO_APAGAR_NA_LIMPEZA.has(k)) {
        if (k === 'nt.library') {
          // A lista fica, mas as contagens (que eram da conta) vão a zero.
          musicas = readLocal('nt.library')
          writeLocal(
            'nt.library',
            Array.isArray(musicas) ? musicas.map(zerarContagemDaLinha) : musicas,
          )
        }
        continue
      }
      if (k.startsWith('nt.cover.')) continue // capa é da música, não da conta
      removidas.push(k)
      try {
        globalThis.localStorage.removeItem(k)
      } catch {
        /* uma chave teimosa não impede as outras de sair */
      }
    }
  } catch {
    /* storage bloqueado: segue */
  }
  return { removidas: removidas.length, musicas: Array.isArray(musicas) ? musicas.length : 0 }
}

function todasAsChaves() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k) out.push(k)
    }
  } catch {
    /* storage bloqueado: segue só com as seções principais */
  }
  return out
}

export function collectExtras() {
  const out = {}
  for (const k of todasAsChaves()) {
    if (!k.startsWith('nt.') || SECOES.includes(k) || NAO_SINCRONIZA.has(k)) continue
    // O retrato de cada conta é deste aparelho. Se entrar aqui, o perfil da
    // conta na nuvem passa a guardar o estado das outras contas.
    if (eRetrato(k)) continue
    const v = readLocal(k)
    if (!vazio(v)) out[k] = v
  }
  return out
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

// Une valor do aparelho com o da nuvem sem perder nada: números ficam com o
// maior (contadores), listas ganham o que falta, textos locais vencem.
export function deepMerge(a, b) {
  if (vazio(b)) return a
  if (vazio(a)) return b
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [...b]
    for (const item of a) {
      if (!out.some((o) => JSON.stringify(o) === JSON.stringify(item))) out.push(item)
    }
    return out
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b)
  if (isObj(a) && isObj(b)) {
    const out = { ...b }
    for (const [k, v] of Object.entries(a)) out[k] = deepMerge(v, b[k])
    return out
  }
  return a
}

export function mergeExtras(a, b) {
  // `b` pode não existir: uma conta antiga na nuvem ainda não tem essa parte.
  const nuvem = b && typeof b === 'object' ? b : {}
  const out = { ...nuvem }
  for (const [k, v] of Object.entries(a || {})) out[k] = deepMerge(v, nuvem[k])
  // Perfis antigos podem ter retratos dentro do `extras` (o bug que misturava
  // as contas). Se eles fossem repassados aqui, voltariam para a nuvem a cada
  // sincronização e a mistura nunca acabaria. Somem do caminho.
  for (const k of Object.keys(out)) {
    if (eRetrato(k)) delete out[k]
  }
  return out
}

// Escreve no aparelho o que veio da nuvem. No modo normal só preenche o que
// ainda está vazio aqui (para nunca sobrescrever algo novo do aparelho). Na
// troca de conta (`trocar`) SUBSTITUI: as estatísticas da conta que entrou
// (recordes dos minigames, diário, etc.) viram as do aparelho e o que era da
// conta anterior é removido — nada de uma conta vaza pra outra.
export function applyExtras(merged, opts = {}) {
  const trocar = Boolean(opts?.trocar)
  let mudou = false
  const cloud = merged || {}
  if (trocar) {
    // remove chaves de extras que existem no aparelho mas não na conta
    for (const k of todasAsChaves()) {
      if (!k.startsWith('nt.') || SECOES.includes(k) || NAO_SINCRONIZA.has(k)) continue
      // O retrato de cada conta é do aparelho: a troca de conta NÃO pode
      // apagar o estado que a conta que saiu deixou guardado aqui.
      if (eRetrato(k)) continue
      if (k === 'nt.library' || k.startsWith('nt.cover.')) continue
      if (!(k in cloud)) {
        localStorage.removeItem(k)
        mudou = true
      }
    }
  }
  for (const [k, v] of Object.entries(cloud)) {
    if (!k.startsWith('nt.') || SECOES.includes(k) || NAO_SINCRONIZA.has(k)) continue
    // Profiles antigos podem ter retratos guardados dentro do `extras`. Não
    // grava: isso é estado de outra conta, e escrever aqui é como as contas se
    // misturaram pela primeira vez.
    if (eRetrato(k)) continue
    if (vazio(v)) continue
    if (trocar || vazio(readLocal(k))) {
      writeLocal(k, v)
      mudou = true
    }
  }
  return mudou
}

const mesmoTexto = (a, b) => (a || '') === (b || '')

// Uma sincronização lê o aparelho no começo e só escreve o resultado no fim.
// Se a pessoa mexeu em alguma coisa nesse meio-tempo (trocou a foto, mudou o
// nome), o resultado já chega velho e sobrescreveria a edição dela — a foto
// "voltava para a anterior". Para cada campo comparamos o que está no
// aparelho AGORA com o que era no início da sync: se mudou, quem vale é o de
// agora. Na troca de conta isso não vale (lá o WINNER é a outra conta).
export function preservaEditionsRecentes(mergedSettings, base) {
  const alvo = mergedSettings && typeof mergedSettings === 'object' ? mergedSettings : {}
  if (!base || typeof base !== 'object') return alvo
  const agora = readLocal('nt.settings') || {}
  if (!agora || typeof agora !== 'object') return alvo
  const out = { ...alvo }
  for (const k of Object.keys(alvo)) {
    if (vazio(agora[k])) continue
    if (!mesmoTexto(agora[k], base[k])) out[k] = agora[k]
  }
  return out
}

// As músicas importadas sobrevivem à troca de conta; os números que contam a
// quem a escuta não. Devolve a mesma biblioteca com `fav`, `plays` e `playDays`
// zerados, para a conta nova começar a contar do zero e o aparelho continuar
// guardando o áudio (que é do aparelho, não da conta).
export function soCatalogoDaBiblioteca(library) {
  const linhas = Array.isArray(library) ? library : []
  return linhas.map((row) => ({
    ...row,
    fav: false,
    plays: 0,
    playDays: {},
  }))
}

// A pergunta "este aparelho tem o arquivo de alguma música?" mora em
// `lib/biblioteca.js` (`temAudioAqui`), e é ela que decide o que aparece na
// tela. Aqui, na parte que ESCREVE na nuvem, a biblioteca é sempre a união
// completa: descartar linhas neste ponto apagaria de verdade as músicas da
// conta no servidor.

export function mergeAll(a, b) {
  // Nasceu para nunca quebrar: uma seção faltando (conta antiga na nuvem, ou
  // aparelho novo sem nada) não pode derrubar a sincronização inteira.
  const local = a && typeof a === 'object' ? a : {}
  const nuvem = b && typeof b === 'object' ? b : {}
  const atLocal = Number(local.settingsAt) || 0
  const atNuvem = Number(nuvem.settingsAt) || 0
  // A união das lápides é calculada ANTES e usada tanto para filtrar a
  // biblioteca quanto para devolver. Usar `local || nuvem` aqui fazia uma
  // música apagada no outro aparelho voltar para a nuvem: o resultado dizia
  // que a lápide existia, mas a faixa continuava na lista.
  const libApagadas = mergeApagadas(local.libApagadas, nuvem.libApagadas)
  return {
    settings: mergeSettings(local.settings, nuvem.settings, atLocal, atNuvem),
    settingsAt: Math.max(atLocal, atNuvem),
    petstats: mergePetstats(local.petstats, nuvem.petstats),
    inv: mergeCounters(local.inv, nuvem.inv),
    invUsado: juntaConsumido(local.invUsado, nuvem.invUsado),
    toys: mergeStrings(local.toys, nuvem.toys),
    bath: mergeCounters(local.bath, nuvem.bath),
    bathUsado: juntaConsumido(local.bathUsado, nuvem.bathUsado),
    achSeen: mergeStrings(local.achSeen, nuvem.achSeen),
    playlists: mergePlaylists(local.playlists, nuvem.playlists),
    library: mergeLibrary(local.library, nuvem.library, libApagadas),
    libApagadas,
    playedRecent: mergeStrings(local.playedRecent, nuvem.playedRecent).slice(0, 10),
    extras: mergeExtras(local.extras, nuvem.extras),
  }
}

// ── Aplicação do merge no app ────────────────────────────────────────────────
// A música em si NUNCA sobe para a nuvem. Então uma faixa que só existe na
// nuvem não entra na lista daqui: sem o arquivo ela não tem como tocar, e o
// usuário deixou claro que não quer "lista fantasma" (música marcada como
// "sem áudio"). O que a nuvem pode fazer é atualizar as estatísticas dos
// arquivos que EXISTEM neste aparelho, reconhecidos pelo sid (título +
// artista + álbum + duração). Assim, ao importar o mesmo arquivo aqui, os
// plays, a favorita e os dias ouvidos voltam sozinhos. Linhas "sem áudio"
// deixadas por versões antigas são removidas.

// A biblioteca é a seção mais traiçoeza do merge: `applyLibrary` faz o MAIOR
// entre as reproduções e une os dias. Isso é certo na MESMA conta (une o que cada
// aparelho viu) e é justamente o vazamento na TROCA: a biblioteca em memória
// ainda é da conta antiga, então `max(9, 0) = 9` devolvia os plays, a favorita e
// os dias dela para a conta que tinha acabado de entrar — e o próximo sync
// subia isso para a nuvem nova. Na troca, a conta nova fica só com o que veio
// dela (o catálogo do aparelho entra sem números, via soCatalogoDaBiblioteca).
export function aplicarBiblioteca(cur, entrada, trocar) {
  if (trocar) return Array.isArray(entrada) ? entrada : []
  return applyLibrary(cur, entrada)
}

export function applyLibrary(cur, mergedRows) {
  const cloudRows = Array.isArray(mergedRows) ? mergedRows : []
  if (!cloudRows.length) return cur
  return cur
    .filter((row) => !(row.audioMissing === true && !row.src && !row.audioBlob))
    .map((row) => {
      const sid = row.sid || row.id
      if (!sid) return row
      const cloud = cloudRows.find((c) => c && c.sid === sid)
      if (!cloud) return row
      return {
        ...row,
        plays: Math.max(Number(row.plays) || 0, Number(cloud.plays) || 0),
        fav: row.fav === true || cloud.fav === true,
        playDays: { ...(row.playDays || {}), ...(cloud.playDays || {}) },
      }
    })
}

export function applyPlaylists(cur, merged) {
  const rows = Array.isArray(merged) ? merged : []
  if (!rows.length) return cur
  const seen = new Set(cur.map((p) => p.id))
  const added = rows
    .filter((p) => p && p.id && !seen.has(p.id))
    .map((p) => ({ ...p, trackIds: Array.isArray(p.trackIds) ? p.trackIds : [] }))
  return added.length ? [...cur, ...added] : cur
}

// ── Tempo real ───────────────────────────────────────────────────────────────
// Enquanto o app estiver aberto e logado, ele fica de olho na nuvem e aplica
// sozinho o que o outro aparelho salvou. Primeiro ele pergunta só o "carimbo de
// última mudança" (bem Leves); o pacote inteiro só vem quando mudou mesmo.

const WATCH_MS = 5000

// A lista de amigos é uma tela que a pessoa fica OLHANDO (à espera de um
// pedido), então 8 s de atraso era ela ficar encarando a tela sem acontecer
// nada. É leitura barata (só o carimbo) e só roda com a tela aberta, então
// pode ser bem mais fino. 2 s ainda é folgado para não martelar o banco.
const WATCH_AMIGOS_MS = 2000

export function watchCloud(onData) {
  if (!accountConfigured()) return () => {}
  let parado = false
  let carimbo = null
  let ocupado = false

  const tick = async () => {
    if (parado || ocupado) return
    ocupado = true
    try {
      const uid = await getUserId()
      if (!uid) {
        carimbo = null
        return
      }
      const probe = await authedFetch(
        `/rest/v1/sync_profiles?select=updated_at&uid=eq.${encodeURIComponent(uid)}&limit=1`,
      )
      if (!probe.ok) return
      // Durante uma troca de conta (antes do syncNow adotar a nova), não puxa
      // nada: o que muda na nuvem ainda é da conta de quem entrou agora.
      const dono = donoDosDados()
      if (dono && dono !== uid) {
        carimbo = null
        return
      }
      const atual = (Array.isArray(probe.data) && probe.data[0] && probe.data[0].updated_at) || null
      if (atual && carimbo && atual !== carimbo) {
        const dados = await fetchCloud(uid)
        // Três conferências depois do `await`: a pessoa pode ter saído (o
        // watcher foi parado), trocado de conta, ou o token pode ter vencido.
        // Sem elas, a resposta da conta antiga entrava na conta nova — e como o
        // consumidor junta por união, moedas, conquistas e reproduções dela
        // voltavam para a conta que tinha acabado de entrar.
        if (dados && !parado && (await getUserId()) === uid && donoDosDados() === uid) onData(dados)
      }
      // Só grava o carimbo depois de tentar. Gravar antes (ou sem ter buscado)
      // fazia o app "conferir" e não baixar nada, e ainda deixava o carimbo novo
      // pronto para o próximo ciclo dizer que está tudo igual.
      if (atual) carimbo = atual
      else carimbo = null
    } catch {
      /* sem internet: tenta de novo no próximo ciclo */
    } finally {
      ocupado = false
    }
  }

  const timer = setInterval(tick, WATCH_MS)
  const onVis = () => {
    // `carimbo = null` faz o próximo tick trazer TUDO (a condição só busca se
    // carimbo e mudada). Não se grava nada aqui, ou o tick não buscaria.
    if (document.visibilityState === 'visible') tick()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis)
  tick()
  return () => {
    parado = true
    clearInterval(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis)
  }
}

// Mesma ideia do watchCloud, mas para a lista de amigos: fica de olho no
// "carimbo" de cada amizade e nos perfis dos amigos, e só avisa quando alguma
// coisa realmente mudou (foto, nome, amizade nova, pedido aceito, a pessoa
// entrou no app). Uma chamada leve por ciclo: o id dos amigos vem das linhas de
// friendships, e os carimbos dos perfis vêm de uma consulta só.
// Impressão de uma linha de amizade. `updated_at` NÃO existe em friendships
// (perguntar por ela dá erro 400 e a lista nunca atualizaria): o que existe é
// `created_at` e `responded_at`, que cobrem o pedido e a resposta.
export function carimboDeAmizades(linhas) {
  return (Array.isArray(linhas) ? linhas : [])
    .map((l) => `${l.requester_id}>${l.addressee_id}:${l.status}:${l.created_at}:${l.responded_at}`)
    .sort()
    .join('|')
}

// Impressão dos perfis dos amigos. Precisa cobrir TUDO que a lista e o cartão
// mostram. Quando eram só `uid,name`, trocar a bio, a cor ou a foto deixava a
// lista parada, e o sintoma era o nome mudando sozinho e o resto não.
//
// A foto é uma data URL inteira e não cabe no carimbo: entram o comprimento e o
// fim do base64, que mudam quando a imagem muda. O `updated_at` (que a trigger
// do banco mexe quando nome/bio/cor/foto mudam) cobre o resto.
export function carimboDePerfis(perfis) {
  return (Array.isArray(perfis) ? perfis : [])
    .map((p) => {
      const ft = p.avatar ? `${p.avatar.length}.${p.avatar.slice(-24)}` : 'sem-foto'
      return `${p.uid}:${p.name}:${p.bio}:${p.accent}:${p.updated_at}:${p.last_seen_at}:${ft}`
    })
    .sort()
    .join('|')
}

export function watchAmigos(onMudou, intervaloMs = WATCH_AMIGOS_MS) {
  if (!accountConfigured()) return () => {}
  let parado = false
  let carimbo = null
  let ocupado = false

  const tick = async () => {
    if (parado || ocupado) return
    ocupado = true
    try {
      const uid = await getUserId()
      if (!uid) {
        carimbo = null
        return
      }
      // `updated_at` NÃO existe em friendships: perguntar por ela dá erro 400 e a
      // lista nunca atualizaria. O que existe é `created_at` e `responded_at`,
      // que cobrem os dois momentos que importam (pedido e resposta).
      const { ok, data } = await authedFetch(
        `/rest/v1/friendships?or=(${[
          `requester_id.eq.${encodeURIComponent(uid)}`,
          `addressee_id.eq.${encodeURIComponent(uid)}`,
        ].join(',')})&select=status,requester_id,addressee_id,created_at,responded_at`,
      )
      if (!ok) return
      const linhas = Array.isArray(data) ? data : []
      // Só o formato da lista, sem baixar imagem nem perfil inteiro: é o que
      // basta para saber se mudou alguma coisa.
      const resumo = carimboDeAmizades(linhas)
      // Também olha os perfis dos amigos: se a pessoa trocou a foto, o nome ou a
      // bio, a linha da amizade continua igual e só a lista pode mudar.
      // `uid=in.(...)` quebra em mais de 50 uuids, então a lista é fatiada.
      const ids = [...new Set(linhas.flatMap((l) => (l.requester_id === uid ? [l.addressee_id] : [l.requester_id])))]
      let carimboPerfis = ''
      for (let i = 0; i < ids.length; i += 50) {
        const fatia = ids.slice(i, i + 50)
        const { ok: okP, data: perfis } = await authedFetch(
          `/rest/v1/user_profiles?uid=in.(${fatia.map((x) => `"${x}"`).join(',')})&select=uid,name,bio,accent,avatar,last_seen_at,updated_at`,
        )
        if (okP && Array.isArray(perfis)) carimboPerfis += carimboDePerfis(perfis)
      }
      const marca = `${resumo}#${carimboPerfis}`
      if (carimbo !== null && marca !== carimbo) onMudou()
      carimbo = marca
    } catch {
      /* sem internet: tenta de novo no próximo ciclo */
    } finally {
      ocupado = false
    }
  }

  const timer = setInterval(tick, intervaloMs)
  const onVis = () => {
    if (document.visibilityState === 'visible') tick()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis)
  tick()
  return () => {
    parado = true
    clearInterval(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis)
  }
}

// O mesmo vigia, mas no ritmo da lista de amigos. Separate do `watchCloud` de
// propósito: os dois observam coisas diferentes (a nuvem de dados e as
// amizades) e cada um no seu tempo.

// ── Envio/leitura no Supabase ────────────────────────────────────────────────

async function fetchCloud(uid) {
  const { ok, data } = await authedFetch(
    `/rest/v1/sync_profiles?select=data&uid=eq.${encodeURIComponent(uid)}&limit=1`,
  )
  if (!ok) throw new Error('Falha ao ler da nuvem')
  return Array.isArray(data) && data.length ? data[0].data : null
}

async function pushCloud(uid, data) {
  const corpo = { uid, data, updated_at: new Date().toISOString() }
  const tamanho = JSON.stringify(corpo).length
  const { ok, status, data: resposta } = await authedFetch('/rest/v1/sync_profiles?on_conflict=uid', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: corpo,
  })
  if (!ok) {
    // "Falha ao gravar na nuvem" não dizia nada e obrigava a adivinhar. O
    // motivo real é o que separa "a sessão caiu" de "falta permissão" de
    // "o envio ficou grande demais" — e cada um tem conserto diferente.
    const doServidor =
      (resposta && (resposta.message || resposta.msg || resposta.error || resposta.hint)) || ''
    throw new Error(motivoDaGravacao(status, doServidor, tamanho))
  }
}

// Traduz o status da gravação numa frase que diz o que fazer.
export function motivoDaGravacao(status, doServidor, tamanho) {
  const servidor = doServidor ? ` — ${String(doServidor).slice(0, 160)}` : ''
  const mb = (tamanho / 1048576).toFixed(2)
  if (status === 0) return `Sem conexão com a conta (${tamanho} bytes enviados)`
  if (status === 401) return `Sessão expirada — entre na conta de novo (${mb} MB)`
  if (status === 403) return `Sem permissão para gravar nesta conta${servidor}`
  if (status === 409) return `Conflito ao gravar${servidor}`
  if (status === 413 || status === 414) return `Envio grande demais (${mb} MB)${servidor}`
  if (status >= 500) return `A nuvem caiu ao responder (${status})${servidor}`
  return `Falha ao gravar na nuvem (${status}, ${mb} MB)${servidor}`
}

// Roda a sincronização: baixa → junta → sobe (a nuvem vira superconjunto) →
// guarda o resultado em `nt.sync.merged` para o app aplicar no estado. As
// uniões são idempotentes: depois desta rodada os dois lados batem.
// Uma sincronização por vez. Sem esta trava, o sync da conta A (rede lenta) e o
// da conta B (que entrou logo depois) corriam juntos: o do A resolvia por último e
// deixava o aparelho marcado como sendo da A, com sessão da B.
let syncCorrendo = null

export async function syncNow() {
  if (!accountConfigured()) return { ok: false, reason: 'not-configured' }
  if (syncCorrendo) return syncCorrendo
  syncCorrendo = syncNowUmaVez().finally(() => {
    syncCorrendo = null
  })
  return syncCorrendo
}

async function syncNowUmaVez() {
  const uid = await getUserId()
  if (!uid) {
    // Token vencido/inválido: limpa a sessão local para o app pedir login de novo
    // em vez de ficar fingindo que está conectado.
    clearSession()
    setSyncStatus({ ok: false, reason: 'not-logged', message: 'Sessão expirou. Entre na conta de novo.' })
    return { ok: false, reason: 'not-logged' }
  }

  try {
    const local = collectLocal()
    const cloud = await fetchCloud(uid)
    // Trocar de conta = carregar o que É DA conta que entrou, e nada mais.
    // O aparelho é uma janela: moedas, inventário, recordes, perfil... são de
    // cada conta (não podem somar nem ficar para trás quando se troca). Só as
    // MÚSICAS importadas ficam no aparelho; stats se ligam por sid. A conta
    // antiga continua inteira na nuvem dela — volta quando você entrar nela.
    //
    // Importante: a troca é detectada pelo DONO, nunca pela nuvem. Antes era
    // `dono !== uid && cloud` — e uma conta nova (que ainda não tem nada na
    // nuvem) caía no outro lado: o aparelho inteiro da conta antiga era
    // simplesmente enviado para a conta que tinha acabado de entrar.
    const dono = donoDosDados()
    const mesmaConta = dono === uid
    // DONO VELHO, APARELHO VAZIO.
    //
    // A marca de dono diz "estes dados são da conta X". Se ela aponta para uma
    // conta que não é a que entrou, a leitura normal seria "houve troca de
    // conta" — e aí a sincronização APAGA o estado inteiro antes de juntar
    // qualquer coisa. Mas isso só vale se houver mesmo um estado antigo para
    // trocar. Se o aparelho está vazio (a pessoa acabou de limpar os dados, ou
    // é a conta nova entrando), apagar não tem o que apagar e só causa dano:
    // cada rodada de sincronização recomeçava a conta, sem nunca terminar.
    //
    // Sem retrato de conta nenhuma e sem nenhum dado de conta no aparelho, a
    // marca é apenas lixo antigo: a conta que entrou simplesmente ASSUME a
    // posse, sem wiping.
    const donoSemNadaParaTrocar = !haveriaDadosParaTrocar()
    const trocouComDono = Boolean(dono && dono !== uid && !donoSemNadaParaTrocar)
    if (dono && dono !== uid && donoSemNadaParaTrocar) {
      // A conta que entrou fica com a posse: sem isto, a próxima sincronização
      // repetiria a mesma leitura e o laço continuaria.
      marcarDono(uid)
    }
    // "Tem alguma coisa na nuvem?" — só os campos que importam, para não contar
    // uma linha vazia como conta com histórico.
    const nuvemTemDados = Boolean(
      cloud && (cloud.settingsAt !== undefined || cloud.inv || (Array.isArray(cloud.library) && cloud.library.length) || (Array.isArray(cloud.playlists) && cloud.playlists.length)),
    )
    // Trocar de conta = a nuvem manda e o aparelho só cede o catálogo. Acontece em
    // dois casos: entrou outra conta (dono diferente) ou o carimbo de dono se
    // perdeu e a nuvem tem histórico. No resto (mesma conta, ou nuvem ainda
    // vazia) vale juntar — é a primeira sincronização, e quem decide o que é
    // "dado de conta" ainda não existe.
    const mudouDeConta = trocouComDono || (!mesmaConta && nuvemTemDados)
    // O retrato entra ANTES do merge: ao voltar para uma conta já usada neste
    // aparelho, o estado dela volta ao lugar e a nuvem só completa o que faltar.
    // `local` precisa ser relido porque o retrato acaba de gravar as chaves.
    let base = local
    if (trocouComDono) {
      // Antes de limpar, guarda o retrato da conta que SAI. Sem isto, ao voltar
      // para ela as músicas importadas e as conquistas já teriam sido apagadas.
      salvarRetrato(dono)
      removerDadosDeContaAnterior()
      // nt.library sobrevive à limpeza (é do aparelho) — mas os números dela
      // não. Se ficassem, a próxima sincronização leria os plays e as favoritas
      // da conta antiga e a contagem voltaria a vazar.
      writeLocal('nt.library', soCatalogoDaBiblioteca(readLocal('nt.library')))
      // Volta o retrato da conta que ENTROU (se este aparelho já a usou): as
      // músicas importadas e as conquistas reaparecem como estavam.
      aplicarRetrato(uid)
      base = collectLocal()
    }
    let merged
    if (mudouDeConta) {
      // As músicas ficam no aparelho, mas SEM os números: plays, favorita e
      // playDays dizem a quem a escuta foi. Se viessem junto, a conta nova
      // nasceria com as estatísticas da antiga — e era assim que as músicas e as
      // conquistas mudavam de um lado para o outro.
      //
      // Exceção: quando o retrato desta conta voltou, o estado JÁ é dela e
      // precisa ser preservado inteiro. Sem retrato, o aparelho só cede o
      // catálogo (sem números) e quem manda é a nuvem.
      const temRetrato = Boolean(lerRetrato(uid))
      // Base da mesclagem: com retrato, é o estado restaurado (todas as
      // seções); sem retrato, só a biblioteca sem os números da conta antiga.
      // Passar apenas `{ library }` aqui descartaria o restante do retrato
      // (conquistas vistas, histórico, moedas) no mesmo instante em que ele
      // voltava — a conta apareceria vazia.
      // A base da conta que ENTROU nunca pode ser a biblioteca que sobrou do
      // aparelho: os arquivos de áudio são do mesmo jeito para todo mundo, mas
      // o NOME/CAPA/PLAY delas pertencem à conta que saiu. Sem retrato, a conta
      // nova entra com a biblioteca vazia e reconhece só as próprias músicas
      // (o App filtra o que não tem áudio aqui).
      const baseLocal = temRetrato
        ? { ...base, library: base.library }
        : { ...base, library: [], libApagadas: [] }
      merged = mergeAll(
        baseLocal,
        // Na troca, quem manda na lápide é a nuvem da conta que ENTROU: as
        // lápides do aparelho são de quem saiu. Se fossem misturadas, as
        // músicas apagadas na conta antiga sumiriam também das estatísticas da
        // conta nova.
        { ...(cloud || {}), libApagadas: (cloud && cloud.libApagadas) || [] },
      )
      if (trocouComDono) {
        // Sem nuvem (conta nova) não há seção nenhuma para gravar: a limpeza
        // acima já tirou da conta antiga. Passar vazio derrubaria a sync.
        //
        // Isto grava o que a NUVEM tem, mas só onde o aparelho ainda está
        // vazio: o retrato que acabou de voltar tem prioridade. Sem essa
        // conferida, uma nuvem desatualizada apagaria as conquistas vistas e o
        // histórico recente que a pessoa tinha neste aparelho.
        if (cloud) gravarSectionsDoCloud(cloud, base)
      }
    } else {
      // Mesma lógica nos dois casos, de propósito: a biblioteca que vai para
      // o PUSH é sempre a união completa. Filtrar aqui (por exemplo, zerando a
      // biblioteca quando o aparelho não tem áudio) apagaria de verdade as
      // músicas da conta no servidor — o defeito é só de TELA, e quem cuida da
      // tela é o App, com o filtro de "só mostra o que tem áudio aqui".
      merged = mergeAll(base, cloud || {})
    }
    // A pessoa pode ter trocado de conta com a rede aberta. Sem esta conferida, a
    // sincronização da conta antiga terminaria por cima: marcava o aparelho como
    // sendo da conta antiga e deixava o resultado dela pendente para a sessão
    // nova aplicar.
    const sessaoAgora = await getUserId()
    if (sessaoAgora !== uid) return { ok: false, reason: 'conta-trocada' }
    await pushCloud(uid, merged)
    marcarDono(uid)
    const result = { merged, at: Date.now(), uid, trocar: mudouDeConta, base: base.settings }
    writeLocal(RESULT_KEY, result)
    setSyncStatus({
      ok: true,
      reason: 'ok',
      message: 'Tudo sincronizado.',
    })
    return { ok: true, result }
  } catch (err) {
    const message = (err && err.message) || String(err)
    setSyncStatus({ ok: false, reason: 'error', message: `Não consegui sincronizar: ${message}` })
    return { ok: false, reason: 'error', error: message }
  }
}

// Pega (e limpa) o resultado de um sync pendente para o app aplicar no estado.
// Devolve null quando não há nada pendente.
//
// `nt.sync.merged` é um resultado SALVO e sobrevive a sair da conta e reabrir o
// app. Sem conferir de quem ele é, o resultado da conta antiga seria aplicado na
// sessão nova — e, como o consumidor junta por união, as moedas, as conquistas e
// as reproduções dela apareceriam na conta que entrou depois. Descartar é
// seguro: a sincronização seguinte refaz o mesmo trabalho.
export async function takePendingSync() {
  const res = readLocal(RESULT_KEY)
  if (res) writeLocal(RESULT_KEY, null)
  if (!res) return null
  const uid = await getUserId()
  if (res.uid && uid && res.uid !== uid) return null
  return res
}

export const hasPendingSync = () => Boolean(readLocal(RESULT_KEY))