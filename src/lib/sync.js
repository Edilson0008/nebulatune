// Sincronização opcional (Supabase). Sobe só dados LEVES (metadados e
// estatísticas); os arquivos de música continuam 100% locais.
//
// Filosofia do merge: SEMPRE JUNTAR, NADA SOME. Cada seção faz a união do que
// existe nos dois lados — contadores só crescem, listas só acumulam (sem
// duplicar) e nenhum valor é apagado. Uniões são idempotentes, então o merge
// converge após uma rodada.

import { readLocal, clearAllMedia, writeLocal } from '../localstore.js'
import { accountConfigured, authedFetch, clearSession, getUserId } from './account.js'

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
export function donoDosDados() {
  return readLocal(OWNER_KEY) || null
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
function gravarSectionsDoCloud(cloud) {
  const secaoParaChave = {
    settings: 'nt.settings',
    settingsAt: 'nt.settingsAt',
    petstats: 'nt.petstats',
    inv: 'nt.inv',
    toys: 'nt.toys',
    bath: 'nt.bath',
    achSeen: 'nt.achSeen',
    playlists: 'nt.playlists',
    playedRecent: 'nt.playedRecent',
  }
  for (const [campo, chave] of Object.entries(secaoParaChave)) {
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
    toys: readLocal('nt.toys'),
    bath: readLocal('nt.bath'),
    achSeen: readLocal('nt.achSeen'),
    playlists: readLocal('nt.playlists'),
    library: readLocal('nt.library'),
    playedRecent: readLocal('nt.playedRecent'),
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
export function mergePetstats(a, b) {
  const out = {}
  const keys = new Set([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])])
  for (const k of keys) {
    const va = a ? Number(a[k]) || 0 : 0
    const vb = b ? Number(b[k]) || 0 : 0
    out[k] = k === 'lt' ? (va > vb ? va : vb) : va > vb ? va : vb
  }
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

// Bibliotecas: união por sid; por faixa, plays = maior, favorita = qualquer,
// playDays = união, metadados do lado que tiver (local ganha por ter áudio).
export function mergeLibrary(a, b) {
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
  return [...bySid.keys()].map(toRow)
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
  'nt.settingsAt',
]

// Nunca vai para a nuvem: a sessão, o estado do próprio sync, e avisos que
// são uma coisa só deste aparelho.
const NAO_SINCRONIZA = new Set([
  'nt.account.session', 'nt.sync.merged', 'nt.sync.status', 'nt.sidMigrated',
  'nt.notifAsked', 'nt.petNotif', 'nt.updatePrompted',
])

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
      if (k === 'nt.library' || k.startsWith('nt.cover.')) continue
      if (!(k in cloud)) {
        localStorage.removeItem(k)
        mudou = true
      }
    }
  }
  for (const [k, v] of Object.entries(cloud)) {
    if (!k.startsWith('nt.') || SECOES.includes(k) || NAO_SINCRONIZA.has(k)) continue
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

export function mergeAll(a, b) {
  // Nasceu para nunca quebrar: uma seção faltando (conta antiga na nuvem, ou
  // aparelho novo sem nada) não pode derrubar a sincronização inteira.
  const local = a && typeof a === 'object' ? a : {}
  const nuvem = b && typeof b === 'object' ? b : {}
  const atLocal = Number(local.settingsAt) || 0
  const atNuvem = Number(nuvem.settingsAt) || 0
  return {
    settings: mergeSettings(local.settings, nuvem.settings, atLocal, atNuvem),
    settingsAt: Math.max(atLocal, atNuvem),
    petstats: mergePetstats(local.petstats, nuvem.petstats),
    inv: mergeCounters(local.inv, nuvem.inv),
    toys: mergeStrings(local.toys, nuvem.toys),
    bath: mergeCounters(local.bath, nuvem.bath),
    achSeen: mergeStrings(local.achSeen, nuvem.achSeen),
    playlists: mergePlaylists(local.playlists, nuvem.playlists),
    library: mergeLibrary(local.library, nuvem.library),
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
  const { ok } = await authedFetch('/rest/v1/sync_profiles?on_conflict=uid', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: { uid, data, updated_at: new Date().toISOString() },
  })
  if (!ok) throw new Error('Falha ao gravar na nuvem')
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
    const trocouComDono = Boolean(dono && dono !== uid)
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
    let merged
    if (mudouDeConta) {
      // As músicas ficam no aparelho, mas SEM os números: plays, favorita e
      // playDays dizem a quem a escuta foi. Se viessem junto, a conta nova
      // nasceria com as estatísticas da antiga — e era assim que as músicas e as
      // conquistas mudavam de um lado para o outro.
      merged = mergeAll({ library: soCatalogoDaBiblioteca(local.library) }, cloud || {})
      if (trocouComDono) {
        removerDadosDeContaAnterior()
        // nt.library sobrevive à limpeza (é do aparelho) — mas os números dela
        // não. Se ficassem, a próxima sincronização leria os plays e as
        // favoritas da conta antiga e a contagem voltaria a vazar.
        writeLocal('nt.library', soCatalogoDaBiblioteca(readLocal('nt.library')))
        // Sem nuvem (conta nova) não há seção nenhuma para gravar: a limpeza
        // acima já tirou da conta antiga. Passar vazio derrubaria a sync.
        if (cloud) gravarSectionsDoCloud(cloud)
      }
    } else {
      merged = mergeAll(local, cloud || {})
    }
    // A pessoa pode ter trocado de conta com a rede aberta. Sem esta conferida, a
    // sincronização da conta antiga terminaria por cima: marcava o aparelho como
    // sendo da conta antiga e deixava o resultado dela pendente para a sessão
    // nova aplicar.
    const sessaoAgora = await getUserId()
    if (sessaoAgora !== uid) return { ok: false, reason: 'conta-trocada' }
    await pushCloud(uid, merged)
    marcarDono(uid)
    const result = { merged, at: Date.now(), uid, trocar: mudouDeConta, base: local.settings }
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