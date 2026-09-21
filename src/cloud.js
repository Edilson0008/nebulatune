import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from './app-config'
import { blobToDataUrl } from './backup'
import { getFile } from './storage/db'

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

const IS_NATIVE_APP =
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

// Marca usada no login do app: o Google volta para o site com ?nt=app,
// para sabermos que é o retorno do aplicativo (e não um login web comum).
const OAUTH_APP_RETURN =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('nt') === 'app'

export const supabase = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !IS_NATIVE_APP && !OAUTH_APP_RETURN,
      },
    })
  : null

export const OAUTH_CALLBACK = 'br.com.nebulatune://callback'

// Endereço interno onde o app roda dentro do WebView nativo (Capacitor).
// Navegar para ele sempre volta para dentro do aplicativo, mesmo vindo do site.
const NATIVE_APP_ORIGIN = 'https://localhost'

if (typeof window !== 'undefined') {
  // 1) Retorno do login direto para a origem do app (dentro do WebView).
  if (IS_NATIVE_APP) {
    const nt = new URLSearchParams(window.location.search)
    if (nt.get('nt_oauth') === '1') {
      let payload = null
      try {
        payload = JSON.parse(nt.get('t') || 'null')
      } catch {
        payload = null
      }
      if (supabase && payload?.access_token) {
        supabase.auth.setSession(payload).catch(() => {
          /* sessão inválida: usuário tenta de novo */
        })
      }
      try {
        history.replaceState(null, '', window.location.pathname)
      } catch {
        /* ok */
      }
    }
  }

  // 2) Retorno do login no site. No aparelho, o Google abre no navegador
  //     externo (o WebView do app não navega para fora) — então a página do
  //     site é quem devolve a sessão para o app via link especial.
  if (window.location.href.startsWith(SITE_URL)) {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const token = hash.get('access_token')
    const hasError =
      hash.get('error') ||
      hash.get('error_description') ||
      hash.get('error_code')

    const keep = [
      'access_token',
      'refresh_token',
      'token_type',
      'expires_in',
      'expires_at',
      'provider_token',
      'provider_refresh_token',
    ]
    const payload = {}
    for (const key of keep) {
      const value = hash.get(key)
      if (value != null) payload[key] = value
    }

    if (OAUTH_APP_RETURN && !IS_NATIVE_APP) {
      // Navegador externo (celular): volta para o app pelo link especial.
      if (token) {
        window.location.href =
          OAUTH_CALLBACK +
          '?auto=1&t=' +
          encodeURIComponent(JSON.stringify(payload))
      } else if (hasError) {
        window.location.href = OAUTH_CALLBACK + '?auto=1&err=1'
      }
    } else if (IS_NATIVE_APP) {
      // Veio dentro do WebView: volta direto para a origem do app.
      if (token) {
        window.location.href =
          NATIVE_APP_ORIGIN +
          '/?nt_oauth=1&t=' +
          encodeURIComponent(JSON.stringify(payload))
      } else if (hasError) {
        window.location.href = NATIVE_APP_ORIGIN + '/'
      }
    }
    // Web normal (sem marca): o próprio navegador finaliza o login.
  }
}

const BUCKET = 'backups'
const INDEX_FILE = 'index.json'
const LEGACY_FILE = 'backup.json'
const TRACKS_DIR = 'tracks'
const COVERS_DIR = 'covers'

const storage = () => supabase.storage.from(BUCKET)

function safeKey(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80)
}

function splitDataUrl(data) {
  if (!data) return null
  const comma = data.indexOf(',')
  if (comma < 0) return null
  const mime = /^data:([^;]+)/.exec(data.slice(0, comma))?.[1] || 'application/octet-stream'
  try {
    const bin = atob(data.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { mime, bytes }
  } catch {
    return null
  }
}

async function listAll(path) {
  const out = []
  const page = 1000
  for (let offset = 0; ; offset += page) {
    const { data, error } = await storage().list(path, { limit: page, offset })
    if (error) break
    const items = data || []
    out.push(...items)
    if (items.length < page) break
  }
  return out
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

export function onAuthChange(cb) {
  if (!supabase) return { unsubscribe() {} }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user || null))
  return data.subscription
}

export async function signUpEmail(email, password, redirectTo) {
  if (!supabase) throw new Error('sincronização indisponível')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  })
  if (error) throw error
  return data
}

export async function signInEmail(email, password) {
  if (!supabase) throw new Error('sincronização indisponível')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInGoogle(redirectTo) {
  if (!supabase) throw new Error('sincronização indisponível')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
  return data
}

export async function signOutCloud() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function exchangeOAuthCode(code) {
  if (!supabase) throw new Error('sincronização indisponível')
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw error
  return data
}

async function readIndex(userId) {
  const { data, error } = await storage().download(`${userId}/${INDEX_FILE}`)
  if (error || !data) return null
  try {
    return JSON.parse(await data.text())
  } catch {
    return null
  }
}

export async function cloudInfo(userId) {
  if (!supabase) return { exists: false, updatedAt: null }
  const items = await listAll(userId)
  const index = items.find((o) => o.name === INDEX_FILE)
  if (index) {
    let updatedAt = index.updated_at || index.created_at || null
    const meta = await readIndex(userId)
    if (meta?.updatedAt) updatedAt = meta.updatedAt
    return { exists: true, updatedAt, size: index.metadata?.size || null }
  }
  const legacy = items.find((o) => o.name === LEGACY_FILE)
  if (legacy) {
    return {
      exists: true,
      updatedAt: legacy.updated_at || legacy.created_at || null,
      size: legacy.metadata?.size || null,
    }
  }
  return { exists: false, updatedAt: null }
}

export async function pullBackup(userId) {
  if (!supabase) return null
  const index = await readIndex(userId)

  if (index && index.v >= 3 && Array.isArray(index.tracks)) {
    const tracks = []
    let missingAudio = 0
    for (const meta of index.tracks) {
      let audioData = null
      let coverData = null
      if (meta.audioKey) {
        // Se UM áudio falhar, a sincronização NÃO é derrubada: a música entra
        // na biblioteca mesmo assim (sem som) e a próxima sincronização tenta
        // baixar de novo.
        const { data, error } = await storage().download(`${userId}/${meta.audioKey}`)
        if (!error && data) audioData = await blobToDataUrl(data)
      }
      if (!audioData) missingAudio += 1
      if (meta.coverKey) {
        const { data } = await storage().download(`${userId}/${meta.coverKey}`)
        if (data) coverData = await blobToDataUrl(data)
      }
      tracks.push({ ...meta, audioData, coverData })
    }
    return {
      app: 'NebulaTune',
      type: 'backup-completo',
      exportedAt: index.updatedAt || new Date().toISOString(),
      count: tracks.length,
      missingAudio,
      // Músicas excluídas na conta (em qualquer aparelho): o aparelho tira da
      // biblioteca também, para a exclusão valer em todos os lados.
      removed: index.removed && typeof index.removed === 'object' ? index.removed : null,
      tracks,
      settings: index.settings || null,
      equalizer: index.equalizer || null,
      lyricSync: index.lyricSync || null,
      playlists: Array.isArray(index.playlists) ? index.playlists : null,
      petStats: index.petStats || null,
    }
  }

  const { data, error } = await storage().download(`${userId}/${LEGACY_FILE}`)
  if (error) throw error
  return JSON.parse(await data.text())
}

// Junta os contadores por dia (ex.: plays de cada aparelho somam — nunca perde).
function mergePlayDays(localDays, cloudDays) {
  const out = {}
  const add = (obj) => {
    if (!obj || typeof obj !== 'object') return
    for (const [day, v] of Object.entries(obj)) {
      const n = Number(v) || 0
      if (n > (Number(out[day]) || 0)) out[day] = n
    }
  }
  add(localDays)
  add(cloudDays)
  return out
}

// Pontuações do gatinho: cada aparelho contribui, o total só cresce.
function mergePetStats(localPet, cloudPet) {
  const keys = ['touches', 'hearts', 'sleeps', 'scares', 'meows']
  const base = cloudPet && typeof cloudPet === 'object' ? { ...cloudPet } : {}
  if (localPet && typeof localPet === 'object') {
    for (const k of keys) {
      const l = Number(localPet[k]) || 0
      const c = Number(base[k]) || 0
      base[k] = Math.max(l, c)
    }
  }
  return base
}

// Ajustes (tema, nome, bio, avatar, velocidade, equalizador…): junta o que está
// na nuvem com o que este aparelho tem, e o valor DESTE aparelho vence — é a
// mudança mais recente. Só não deixa um valor vazio apagar algo já salvo.
function mergeSettings(local, cloud) {
  const out = cloud && typeof cloud === 'object' ? { ...cloud } : {}
  if (!local || typeof local !== 'object') return Object.keys(out).length ? out : null
  for (const [k, v] of Object.entries(local)) {
    if (v === undefined) continue
    const empty = v === '' || v === null
    const existed = out[k] !== undefined && out[k] !== '' && out[k] !== null
    if (empty && existed) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

// Playlists: junta por id; músicas dentro de cada playlist somam (sem repetir).
function mergePlaylists(localPlaylists, cloudPlaylists) {
  const byId = new Map()
  const add = (list) => {
    if (!Array.isArray(list)) return
    for (const p of list) {
      if (!p || !p.id) continue
      const prev = byId.get(p.id)
      const ids = Array.isArray(p.trackIds) ? p.trackIds : []
      if (!prev) {
        byId.set(p.id, { ...p, trackIds: [...ids] })
      } else {
        prev.name = p.name || prev.name
        prev.trackIds = [...new Set([...prev.trackIds, ...ids])]
      }
    }
  }
  add(cloudPlaylists)
  add(localPlaylists)
  return [...byId.values()]
}

export async function pushBackup(userId, backup) {
  if (!supabase) return

  // O que já está na nuvem (só metadados — sem baixar os áudios de novo).
  // Serve de base para MESCLAR em vez de apagar: nada que o outro aparelho
  // salvou (favoritos, plays, pontuações, músicas) é perdido por um envio.
  const prevIndex = await readIndex(userId)

  // Músicas EXCLUÍDAS: a lista vem da conta (apagadas em qualquer aparelho) e
  // deste aparelho. Sem isso a nuvem "ressuscitava" a música no envio seguinte
  // (apagava num aparelho e ela voltava a aparecer nos outros).
  const removedMap = {}
  const prevRemoved =
    prevIndex && prevIndex.removed && typeof prevIndex.removed === 'object'
      ? prevIndex.removed
      : {}
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  for (const [key, ts] of Object.entries(prevRemoved)) {
    const clean = safeKey(key)
    if (clean && Number(ts) >= cutoff) removedMap[clean] = Number(ts)
  }
  for (const id of Array.isArray(backup.removed) ? backup.removed : []) {
    const clean = safeKey(id)
    if (clean) removedMap[clean] = Date.now()
  }
  const removed = new Set(Object.keys(removedMap))

  const prevMetas = new Map()
  if (prevIndex && Array.isArray(prevIndex.tracks)) {
    for (const m of prevIndex.tracks) {
      const key = safeKey(m.id)
      if (!key || removed.has(key)) continue
      prevMetas.set(key, m)
    }
  }

  const existing = new Set()
  for (const dir of [TRACKS_DIR, COVERS_DIR]) {
    for (const file of await listAll(`${userId}/${dir}`)) existing.add(`${dir}/${file.name}`)
  }

  const refs = new Set()
  const metas = []
  const seenIds = new Set()
  const audioFailures = []

  // Lê o arquivo do aparelho só quando for realmente necessário enviar.
  const readLocal = async (trackId) => {
    try {
      return await getFile(trackId)
    } catch {
      return null
    }
  }

  for (const t of backup.tracks || []) {
    const id = safeKey(t.id)
    if (!id || removed.has(id)) continue
    const meta = { ...t }
    delete meta.audioData
    delete meta.coverData
    delete meta.hasAudio
    delete meta.hasCover
    seenIds.add(id)
    const prev = prevMetas.get(id)

    // ---- ÁUDIO --------------------------------------------------------
    // Só converte/manda o arquivo quando a conta AINDA NÃO tem este áudio.
    // (Antes, TODO envio convertia o áudio de TODAS as músicas para base64 —
    // pesado e travava o app em bibliotecas grandes.)
    let audioData = typeof t.audioData === 'string' && t.audioData ? t.audioData : null
    const cloudAudio = prev?.audioKey && existing.has(prev.audioKey) ? prev.audioKey : null
    if (!audioData && !cloudAudio && (t.hasAudio || t.audioBlob)) {
      const f = await readLocal(t.id)
      const blob = t.audioBlob || f?.audioBlob || null
      if (blob && blob.size) audioData = await blobToDataUrl(blob)
    }
    if (audioData) {
      const parsed = splitDataUrl(audioData)
      const key = parsed ? `${TRACKS_DIR}/${id}-${audioData.length}.bin` : null
      if (key) {
        meta.audioKey = key
        if (existing.has(key)) {
          refs.add(key)
        } else {
          try {
            const { error } = await storage().upload(
              `${userId}/${key}`,
              new Blob([parsed.bytes], { type: parsed.mime }),
              { upsert: true, contentType: parsed.mime, cacheControl: '3600' },
            )
            if (error) throw error
            refs.add(key)
          } catch (err) {
            // Um arquivo problemático (ex.: grande demais para o servidor) NÃO
            // pode travar a sincronização inteira: a música continua na conta
            // (sem som por enquanto) e o resto — inclusive ajustes e as outras
            // músicas — sobe normalmente. O app avisa qual música falhou.
            audioFailures.push({
              id: meta.id,
              title: meta.title || '',
              reason: String(err?.message || err || '').slice(0, 160),
            })
            if (prev?.audioKey) {
              meta.audioKey = prev.audioKey
              refs.add(prev.audioKey)
            } else {
              delete meta.audioKey
            }
          }
        }
      } else if (prev?.audioKey) {
        meta.audioKey = prev.audioKey
        refs.add(prev.audioKey)
      } else {
        delete meta.audioKey
      }
    } else if (cloudAudio) {
      // A conta já tem este áudio: reaproveita sem reenviar.
      meta.audioKey = cloudAudio
      refs.add(cloudAudio)
    } else if (prev?.audioKey) {
      meta.audioKey = prev.audioKey
      refs.add(prev.audioKey)
    } else {
      delete meta.audioKey
    }

    // ---- CAPA ---------------------------------------------------------
    let coverData = typeof t.coverData === 'string' && t.coverData ? t.coverData : null
    const cloudCover = prev?.coverKey && existing.has(prev.coverKey) ? prev.coverKey : null
    if (!coverData && !cloudCover && (t.hasCover || t.coverBlob)) {
      const f = await readLocal(t.id)
      const blob = t.coverBlob || f?.coverBlob || null
      if (blob && blob.size) coverData = await blobToDataUrl(blob)
    }
    if (coverData) {
      const parsed = splitDataUrl(coverData)
      const key = parsed ? `${COVERS_DIR}/${id}-${coverData.length}.bin` : null
      if (key) {
        meta.coverKey = key
        if (!existing.has(key)) {
          const { error } = await storage().upload(
            `${userId}/${key}`,
            new Blob([parsed.bytes], { type: parsed.mime }),
            { upsert: true, contentType: parsed.mime, cacheControl: '3600' },
          )
          if (error) {
            // A capa não é essencial: não trava o envio, tenta de novo depois.
            refs.delete(key)
            if (prev?.coverKey) {
              meta.coverKey = prev.coverKey
              refs.add(prev.coverKey)
            } else {
              delete meta.coverKey
            }
          } else {
            refs.add(key)
          }
        } else {
          refs.add(key)
        }
      } else if (prev?.coverKey) {
        meta.coverKey = prev.coverKey
        refs.add(prev.coverKey)
      } else {
        delete meta.coverKey
      }
    } else if (cloudCover) {
      meta.coverKey = cloudCover
      refs.add(cloudCover)
    } else if (prev?.coverKey) {
      meta.coverKey = prev.coverKey
      refs.add(prev.coverKey)
    } else {
      delete meta.coverKey
    }

    // FUNDE com o que o outro aparelho havia salvo — nunca apaga:
    // favorito fica marcado se QUALQUER aparelho marcou; plays/pontos somam;
    // data de adição fica a mais antiga.
    meta.fav = t.fav === true || prev?.fav === true
    meta.plays = Math.max(Number(t.plays) || 0, Number(prev?.plays) || 0)
    meta.playDays = mergePlayDays(t.playDays, prev?.playDays)
    const addedA = Number(t.addedAt) || Infinity
    const addedB = Number(prev?.addedAt) || Infinity
    meta.addedAt = Math.min(addedA, addedB)
    if (!Number.isFinite(meta.addedAt)) meta.addedAt = Date.now()
    if (prev) {
      if (!meta.title) meta.title = prev.title
      if (!meta.artist) meta.artist = prev.artist
      if (!meta.album) meta.album = prev.album
      if (!meta.cover) meta.cover = prev.cover
      if (!meta.coverRemote) meta.coverRemote = prev.coverRemote
    }
    metas.push(meta)
  }

  // Músicas que estão na nuvem mas não existem neste aparelho continuam na
  // conta (senão um envio do aparelho "sem elas" as apagaria da nuvem).
  for (const [id, prev] of prevMetas) {
    if (seenIds.has(id)) continue
    if (prev.audioKey) refs.add(prev.audioKey)
    if (prev.coverKey) refs.add(prev.coverKey)
    metas.push(prev)
  }

  // Ajustes: `dirty` diz o que ESTE aparelho mudou desde a última vez que
  // recebeu a conta. Só nesse caso o valor local vence. Se o aparelho não
  // mexeu (dirty === false), a CONTA manda — assim um aparelho não sobrescreve
  // com ajuste velho o que o outro acabou de mudar (era a causa de "as
  // informações continuam diferentes"). Sem `dirty`, o local vence (compatível).
  const dirty = backup.dirty && typeof backup.dirty === 'object' ? backup.dirty : {}
  const settings =
    dirty.settings === false
      ? (prevIndex?.settings ?? backup.settings ?? null)
      : mergeSettings(backup.settings, prevIndex?.settings)
  const equalizer =
    dirty.equalizer === false
      ? (prevIndex?.equalizer ?? backup.equalizer ?? null)
      : mergeSettings(backup.equalizer, prevIndex?.equalizer)
  const lyricSync =
    dirty.lyricSync === false
      ? (prevIndex?.lyricSync ?? backup.lyricSync ?? null)
      : { ...(prevIndex?.lyricSync || {}), ...(backup.lyricSync || {}) }
  const playlists =
    dirty.playlists === false
      ? Array.isArray(prevIndex?.playlists)
        ? prevIndex.playlists
        : (backup.playlists ?? null)
      : mergePlaylists(backup.playlists, prevIndex?.playlists)
  const petStats =
    dirty.petStats === false
      ? (prevIndex?.petStats ?? backup.petStats ?? null)
      : mergePetStats(backup.petStats, prevIndex?.petStats)

  const index = {
    v: 3,
    updatedAt: new Date().toISOString(),
    count: metas.length,
    settings,
    equalizer,
    lyricSync,
    playlists,
    petStats,
    removed: removedMap,
    tracks: metas,
  }
  const { error } = await storage().upload(
    `${userId}/${INDEX_FILE}`,
    new Blob([JSON.stringify(index)], { type: 'application/json' }),
    { upsert: true, contentType: 'application/json', cacheControl: '0' },
  )
  if (error) throw error

  await cleanupOld(userId, refs)

  // Devolve o estado FINAL da nuvem (depois da mescla com o que o outro
  // aparelho tinha enviado) para o app mostrar a verdade: a união de tudo.
  // `audioFailures` lista músicas cujo SOM não subiu (o resto subiu normal).
  return { updatedAt: index.updatedAt, final: index, audioFailures, removed: removed.size }
}

async function cleanupOld(userId, keep) {
  try {
    const remove = []
    for (const item of await listAll(userId)) {
      if (item.name === INDEX_FILE) continue
      if (item.name === LEGACY_FILE) {
        remove.push(`${userId}/${LEGACY_FILE}`)
        continue
      }
      if (item.name.startsWith('g-') || item.name.startsWith('part-')) {
        if (item.id == null) {
          for (const f of await listAll(`${userId}/${item.name}`)) {
            remove.push(`${userId}/${item.name}/${f.name}`)
          }
        } else {
          remove.push(`${userId}/${item.name}`)
        }
      }
    }
    for (const dir of [TRACKS_DIR, COVERS_DIR]) {
      for (const file of await listAll(`${userId}/${dir}`)) {
        const p = `${dir}/${file.name}`
        if (!keep.has(p)) remove.push(`${userId}/${p}`)
      }
    }
    if (remove.length) await storage().remove(remove)
  } catch {
    // limpeza é opcional; ignora falhas
  }
}
