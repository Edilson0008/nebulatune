// Sincronização opcional (Supabase). Sobe só dados LEVES (metadados e
// estatísticas); os arquivos de música continuam 100% locais.
//
// Filosofia do merge: SEMPRE JUNTAR, NADA SOME. Cada seção faz a união do que
// existe nos dois lados — contadores só crescem, listas só acumulam (sem
// duplicar) e nenhum valor é apagado. Uniões são idempotentes, então o merge
// converge após uma rodada.

import { readLocal, writeLocal } from '../localstore.js'
import { accountConfigured, authedFetch, clearSession, getUserId } from './account.js'

export const SYNC_TABLE = 'sync_profiles'
const RESULT_KEY = 'nt.sync.merged'
const STATUS_KEY = 'nt.sync.status'

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
    for (const k of ['title', 'artist', 'album', 'duration', 'cover', 'coverRemote', 'addedAt']) {
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
      coverRemote: r.coverRemote || null,
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

export function mergeSettings(a, b, aAt = 0, bAt = 0) {
  const local = a && typeof a === 'object' ? a : {}
  const nuvem = b && typeof b === 'object' ? b : {}
  const maisNovoNaNuvem = Number(bAt) > Number(aAt)
  const out = { ...nuvem }
  for (const [k, v] of Object.entries(local)) {
    if (vazio(v)) {
      if (vazio(out[k])) out[k] = v
      continue
    }
    if (maisNovoNaNuvem) {
      // A mudança mais recente é da nuvem: ela manda, a não ser que esteja vazia.
      if (!vazio(nuvem[k])) out[k] = nuvem[k]
      continue
    }
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

// Escreve no aparelho o que veio da nuvem (apenas o que ainda está vazio aqui).
export function applyExtras(merged) {
  let mudou = false
  for (const [k, v] of Object.entries(merged || {})) {
    if (!k.startsWith('nt.') || SECOES.includes(k) || NAO_SINCRONIZA.has(k)) continue
    if (!vazio(v) && vazio(readLocal(k))) {
      writeLocal(k, v)
      mudou = true
    }
  }
  return mudou
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

const WATCH_MS = 8000

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
      const atual = (Array.isArray(probe.data) && probe.data[0] && probe.data[0].updated_at) || null
      if (atual && carimbo && atual !== carimbo) {
        const dados = await fetchCloud(uid)
        if (dados) onData(dados)
      }
      if (atual) carimbo = atual
    } catch {
      /* sem internet: tenta de novo no próximo ciclo */
    } finally {
      ocupado = false
    }
  }

  const timer = setInterval(tick, WATCH_MS)
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      carimbo = null // acabou de voltar: confere tudo de novo
      tick()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis)
  tick()
  return () => {
    parado = true
    clearInterval(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis)
  }
}

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
export async function syncNow() {
  if (!accountConfigured()) return { ok: false, reason: 'not-configured' }
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
    const merged = mergeAll(local, cloud || {})
    await pushCloud(uid, merged)
    const result = { merged, at: Date.now(), uid }
    writeLocal(RESULT_KEY, result)
    setSyncStatus({
      ok: true,
      reason: 'ok',
      message: `Sincronizado! ${merged.library ? merged.library.length : 0} músicas no perfil.`,
      tracks: merged.library ? merged.library.length : 0,
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
export function takePendingSync() {
  const res = readLocal(RESULT_KEY)
  if (res) writeLocal(RESULT_KEY, null)
  return res || null
}

export const hasPendingSync = () => Boolean(readLocal(RESULT_KEY))