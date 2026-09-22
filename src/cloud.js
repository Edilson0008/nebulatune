import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './app-config'

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

const IS_NATIVE_APP =
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

export const supabase = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !IS_NATIVE_APP,
      },
    })
  : null

// ---------------------------------------------------------------------------
// ARMAZENAMENTO (arquivos de som/capa). O TEXTO dos dados fica nas tabelas do
// banco; aqui só ficam os bytes dos áudios e capas, baixados sob demanda.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AUTENTICAÇÃO
// ---------------------------------------------------------------------------

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

export async function signOutCloud() {
  if (!supabase) return
  await supabase.auth.signOut()
}

// ---------------------------------------------------------------------------
// NOVO SISTEMA: tabelas + RLS. SNAPSHOT CANÔNICO (formato único usado tanto no
// aparelho quanto na nuvem, para as comparações de sincronização).
// ---------------------------------------------------------------------------

export const EMPTY_SNAPSHOT = {
  settings: null,
  equalizer: null,
  tracks: new Map(),
  playlists: new Map(),
  playlistEntries: new Map(),
  petStats: null,
  lyricSync: new Map(),
}

// Linhas com formato fixo (mesma ordem de chaves) para o JSON ser comparável.
export function canonTrackRow(t) {
  return {
    id: String(t?.id || ''),
    title: t?.title || '',
    artist: t?.artist || '',
    album: t?.album || '',
    duration: Math.round(Number(t?.duration) || 0),
    cover: Array.isArray(t?.cover) ? t.cover : null,
    coverRemote: t?.coverRemote || null,
    addedAt: Number(t?.addedAt) || 0,
    plays: Number(t?.plays) || 0,
    playDays: t?.playDays && typeof t.playDays === 'object' ? t.playDays : {},
    fav: t?.fav === true,
    audioKey: safeKey(t?.audioKey || t?.cloudAudioKey || null),
    coverKey: safeKey(t?.coverKey || null),
    hasAudio: Boolean(t?.hasAudio === true || (t?.audioBlob && t.audioBlob.size)),
    hasCover: Boolean(t?.hasCover === true || (t?.coverBlob && t.coverBlob.size)),
  }
}

export function canonPlaylistRow(p) {
  return {
    id: String(p?.id || ''),
    name: p?.name || '',
    createdAt: Number(p?.createdAt) || 0,
  }
}

export function canonEntryRow(playlistId, trackId, position) {
  return {
    playlistId: String(playlistId),
    trackId: String(trackId),
    position: Number(position) || 0,
  }
}

export function canonLyricRow(trackId, offset) {
  return { trackId: String(trackId), offset: Number(offset) || 0 }
}

export function canonPetStats(p) {
  return {
    touches: Number(p?.touches) || 0,
    hearts: Number(p?.hearts) || 0,
    sleeps: Number(p?.sleeps) || 0,
    scares: Number(p?.scares) || 0,
    meows: Number(p?.meows) || 0,
  }
}

export const entryKey = (playlistId, trackId) => `${String(playlistId)}\u0000${String(trackId)}`

function rowToTrack(r) {
  return canonTrackRow({
    id: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    duration: r.duration,
    cover: r.cover,
    coverRemote: r.cover_remote,
    addedAt: r.added_at,
    plays: r.plays,
    playDays: r.play_days,
    fav: r.fav,
    audioKey: r.audio_key,
    coverKey: r.cover_key,
    hasAudio: r.has_audio,
    hasCover: r.has_cover,
  })
}

function isTablesMissingError(err) {
  const msg = String(err?.message || err || '')
  return /relation .*does not exist|PGRST205|supertoken/.test(msg)
}

// Baixa TODOS os dados textuais da conta (as linhas das tabelas) de uma vez.
export async function pullFromDb(userId) {
  if (!supabase) return null
  const queries = [
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('tracks').select('*').eq('user_id', userId),
    supabase.from('playlists').select('*').eq('user_id', userId),
    supabase.from('playlist_tracks').select('*').eq('user_id', userId),
    supabase.from('pet_stats').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('lyric_sync').select('*').eq('user_id', userId),
  ]
  const results = await Promise.all(queries)
  const error = results.find((r) => r.error)
  if (error) {
    if (isTablesMissingError(error.error)) error.error.isTablesMissing = true
    throw error.error
  }
  const [settingsRes, tracksRes, playlistsRes, entriesRes, petRes, lyricRes] = results

  const snapshot = {
    settings: settingsRes.data?.settings ?? null,
    equalizer: settingsRes.data?.equalizer ?? null,
    tracks: new Map((tracksRes.data || []).map((r) => [String(r.id), rowToTrack(r)])),
    playlists: new Map(
      (playlistsRes.data || []).map((r) => [
        String(r.id),
        canonPlaylistRow({ id: r.id, name: r.name, createdAt: r.created_at }),
      ]),
    ),
    playlistEntries: new Map(),
    petStats: petRes.data ? canonPetStats(petRes.data) : null,
    lyricSync: new Map(
      (lyricRes.data || []).map((r) => [String(r.track_id), canonLyricRow(r.track_id, r.offset)]),
    ),
  }
  for (const e of entriesRes.data || []) {
    snapshot.playlistEntries.set(entryKey(e.playlist_id, e.track_id), canonEntryRow(e.playlist_id, e.track_id, e.position))
  }
  return snapshot
}

// Compara o que o aparelho tem AGORA com a última base recebida e diz o que
// precisa ser gravado na nuvem (linha por linha — exclusão VALE de verdade).
export function computeDiff(localSnap, baseSnap) {
  const base = baseSnap || EMPTY_SNAPSHOT
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  const trackUpsert = []
  const trackDeleteIds = []
  const trackDeleteKeys = []
  for (const [id, row] of localSnap.tracks) {
    const bRow = base.tracks.get(id)
    if (!bRow || !same(canonTrackRow(row), canonTrackRow(bRow))) {
      trackUpsert.push({
        ...row,
        // Nunca perde a referência do áudio já gravado na nuvem.
        audioKey: row.audioKey || bRow?.audioKey || null,
        coverKey: row.coverKey || bRow?.coverKey || null,
      })
    }
  }
  for (const [id, bRow] of base.tracks) {
    if (!localSnap.tracks.has(id)) {
      trackDeleteIds.push(id)
      if (bRow?.audioKey) trackDeleteKeys.push(`${TRACKS_DIR}/${bRow.audioKey}`.replace(`${TRACKS_DIR}/${safeKey(bRow.audioKey)}`, `tracks/${safeKey(bRow.audioKey)}`))
      if (bRow?.coverKey) trackDeleteKeys.push(`${COVERS_DIR}/${safeKey(bRow.coverKey)}`)
    }
  }

  const playlistUpsert = []
  const playlistDeleteIds = []
  for (const [id, row] of localSnap.playlists) {
    const bRow = base.playlists.get(id)
    if (!bRow || !same(canonPlaylistRow(row), canonPlaylistRow(bRow))) playlistUpsert.push(row)
  }
  for (const id of base.playlists.keys()) {
    if (!localSnap.playlists.has(id)) playlistDeleteIds.push(id)
  }

  const entryUpsert = []
  const entryDeleteKeys = []
  for (const [key, row] of localSnap.playlistEntries) {
    const bRow = base.playlistEntries.get(key)
    if (!bRow || !same(canonEntryRow(row.playlistId, row.trackId, row.position), bRow)) entryUpsert.push(row)
  }
  for (const key of base.playlistEntries.keys()) {
    if (!localSnap.playlistEntries.has(key)) entryDeleteKeys.push(key)
  }

  const lyricUpsert = []
  const lyricDeleteIds = []
  for (const [id, row] of localSnap.lyricSync) {
    const bRow = base.lyricSync.get(id)
    if (!bRow || !same(canonLyricRow(row.trackId, row.offset), bRow)) lyricUpsert.push(row)
  }
  for (const id of base.lyricSync.keys()) {
    if (!localSnap.lyricSync.has(id)) lyricDeleteIds.push(id)
  }

  const settingsChanged = !same(localSnap.settings, base.settings)
  const equalizerChanged = !same(localSnap.equalizer, base.equalizer)
  const petChanged = !same(canonPetStats(localSnap.petStats), canonPetStats(base.petStats))

  const empty =
    !settingsChanged &&
    !equalizerChanged &&
    !petChanged &&
    trackUpsert.length === 0 &&
    trackDeleteIds.length === 0 &&
    playlistUpsert.length === 0 &&
    playlistDeleteIds.length === 0 &&
    entryUpsert.length === 0 &&
    entryDeleteKeys.length === 0 &&
    lyricUpsert.length === 0 &&
    lyricDeleteIds.length === 0

  return {
    settingsChanged,
    equalizerChanged,
    petChanged,
    trackUpsert,
    trackDeleteIds,
    trackDeleteKeys,
    playlistUpsert,
    playlistDeleteIds,
    entryUpsert,
    entryDeleteKeys,
    lyricUpsert,
    lyricDeleteIds,
    empty,
  }
}

function trackToDb(row, userId) {
  return {
    user_id: userId,
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    cover: Array.isArray(row.cover) && row.cover.length ? row.cover : null,
    cover_remote: row.coverRemote || null,
    added_at: row.addedAt,
    plays: row.plays,
    play_days: row.playDays,
    fav: row.fav,
    audio_key: row.audioKey || null,
    cover_key: row.coverKey || null,
    has_audio: row.hasAudio,
    has_cover: row.hasCover,
    updated_at: new Date().toISOString(),
  }
}

// Grava na nuvem exatamente o que o diff mandou (insere, atualiza, apaga).
export async function pushDiffToDb(userId, localSnap, diff) {
  if (!supabase) return
  const now = new Date().toISOString()
  const ops = []

  if (diff.settingsChanged || diff.equalizerChanged) {
    ops.push(
      supabase.from('user_settings').upsert(
        {
          user_id: userId,
          settings: localSnap.settings && typeof localSnap.settings === 'object' ? localSnap.settings : {},
          equalizer: localSnap.equalizer && typeof localSnap.equalizer === 'object' ? localSnap.equalizer : null,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      ),
    )
  }

  if (diff.trackUpsert.length) {
    ops.push(
      supabase
        .from('tracks')
        .upsert(diff.trackUpsert.map((row) => trackToDb(row, userId)), {
          onConflict: 'user_id,id',
        }),
    )
  }
  if (diff.trackDeleteIds.length) {
    // Apaga a LINHA da tabela. O arquivo de som/capa também sai do storage
    // (libera espaço), mas a exclusão da música vale pelos dados da tabela.
    ops.push(
      supabase.from('tracks').delete().eq('user_id', userId).in('id', diff.trackDeleteIds),
    )
    if (diff.trackDeleteKeys.length) {
      const paths = [...new Set(diff.trackDeleteKeys)].filter((p) => p.includes('/'))
      if (paths.length) {
        ops.push(storage().remove(paths.map((p) => `${userId}/${p}`)))
      }
    }
  }

  if (diff.playlistUpsert.length) {
    ops.push(
      supabase
        .from('playlists')
        .upsert(
          diff.playlistUpsert.map((p) => ({
            user_id: userId,
            id: p.id,
            name: p.name,
            created_at: p.createdAt,
            updated_at: now,
          })),
          { onConflict: 'user_id,id' },
        ),
    )
  }
  if (diff.playlistDeleteIds.length) {
    ops.push(
      supabase.from('playlists').delete().eq('user_id', userId).in('id', diff.playlistDeleteIds),
    )
  }

  if (diff.entryUpsert.length) {
    ops.push(
      supabase
        .from('playlist_tracks')
        .upsert(
          diff.entryUpsert.map((e) => ({
            user_id: userId,
            playlist_id: e.playlistId,
            track_id: e.trackId,
            position: e.position,
            updated_at: now,
          })),
          { onConflict: 'user_id,playlist_id,track_id' },
        ),
    )
  }
  for (const key of diff.entryDeleteKeys) {
    const [playlistId, trackId] = key.split('\u0000')
    ops.push(
      supabase
        .from('playlist_tracks')
        .delete()
        .eq('user_id', userId)
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId),
    )
  }

  if (diff.lyricUpsert.length) {
    ops.push(
      supabase
        .from('lyric_sync')
        .upsert(
          diff.lyricUpsert.map((l) => ({
            user_id: userId,
            track_id: l.trackId,
            offset: l.offset,
            updated_at: now,
          })),
          { onConflict: 'user_id,track_id' },
        ),
    )
  }
  if (diff.lyricDeleteIds.length) {
    ops.push(
      supabase.from('lyric_sync').delete().eq('user_id', userId).in('track_id', diff.lyricDeleteIds),
    )
  }

  if (diff.petChanged) {
    ops.push(
      supabase.from('pet_stats').upsert(
        { user_id: userId, ...canonPetStats(localSnap.petStats), updated_at: now },
        { onConflict: 'user_id' },
      ),
    )
  }

  const results = await Promise.all(ops)
  const failed = results.filter((r) => r && r.error)
  if (failed.length) throw failed[0].error
}

// Baixa o ARQUIVO (áudio ou capa) sob demanda — só quando for tocar/ver.
export async function fetchCloudBlob(userId, key) {
  if (!supabase || !userId || !key) return null
  const { data, error } = await storage().download(`${userId}/${key}`)
  if (error || !data) return null
  return data
}

// ---------------------------------------------------------------------------
// Ajudantes de manutenção de arquivos antigos (legados do sistema em arquivos)
// ---------------------------------------------------------------------------

async function readIndex(userId) {
  const { data, error } = await storage().download(`${userId}/${INDEX_FILE}`)
  if (error || !data) return null
  try {
    return JSON.parse(await data.text())
  } catch {
    return null
  }
}

async function removeLegacyFiles(userId) {
  try {
    const remove = []
    const items = await listAll(userId)
    for (const item of items) {
      if (item.name === INDEX_FILE || item.name === LEGACY_FILE) {
        remove.push(`${userId}/${item.name}`)
        continue
      }
      if (
        item.name === TRACKS_DIR ||
        item.name === COVERS_DIR ||
        item.name.startsWith('g-') ||
        item.name.startsWith('part-')
      ) {
        if (item.id == null) {
          for (const f of await listAll(`${userId}/${item.name}`)) {
            remove.push(`${userId}/${item.name}/${f.name}`)
          }
        } else {
          remove.push(`${userId}/${item.name}`)
        }
      }
    }
    if (remove.length) await storage().remove(remove)
  } catch {
    // limpeza é opcional; ignora falhas
  }
}

// Migra os dados ANTIGOS (arquivos) de uma conta para as novas tabelas.
// Roda UMA vez, no primeiro login de cada usuário com a versão nova — assim
// ninguém que já tinha conta perde nada. Depois de migrar, apaga os arquivos
// antigos para não serem importados de novo.
export async function migrateLegacy(userId) {
  if (!supabase || !userId) return false
  const index = await readIndex(userId)
  if (!index) return false
  const now = new Date().toISOString()
  const ops = []

  if (index.settings || index.equalizer) {
    ops.push(
      supabase.from('user_settings').upsert(
        {
          user_id: userId,
          settings: index.settings && typeof index.settings === 'object' ? index.settings : {},
          equalizer: index.equalizer && typeof index.equalizer === 'object' ? index.equalizer : null,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      ),
    )
  }

  const oldTracks = Array.isArray(index.tracks) ? index.tracks.filter((t) => t && t.id) : []
  const trackRows = oldTracks.map((t) =>
    trackToDb(
      canonTrackRow({
        ...t,
        audioKey: t.audioKey || null,
        coverKey: t.coverKey || null,
        hasAudio: Boolean(t.audioKey || t.hasAudio),
        hasCover: Boolean(t.coverKey || t.hasCover),
      }),
      userId,
    ),
  )
  if (trackRows.length) {
    ops.push(supabase.from('tracks').upsert(trackRows, { onConflict: 'user_id,id' }))
  }

  const oldPlaylists = Array.isArray(index.playlists) ? index.playlists : []
  const plRows = oldPlaylists
    .filter((p) => p && p.id)
    .map((p) => ({
      user_id: userId,
      id: p.id,
      name: p.name || '',
      created_at: Number(p.createdAt) || 0,
      updated_at: now,
    }))
  if (plRows.length) {
    ops.push(supabase.from('playlists').upsert(plRows, { onConflict: 'user_id,id' }))
  }
  const entryRows = []
  for (const p of oldPlaylists) {
    const ids = Array.isArray(p.trackIds) ? p.trackIds : []
    ids.forEach((tid, i) => {
      if (tid == null) return
      entryRows.push({ user_id: userId, playlist_id: p.id, track_id: String(tid), position: i, updated_at: now })
    })
  }
  if (entryRows.length) {
    ops.push(supabase.from('playlist_tracks').upsert(entryRows, { onConflict: 'user_id,playlist_id,track_id' }))
  }

  if (index.petStats) {
    ops.push(
      supabase.from('pet_stats').upsert(
        { user_id: userId, ...canonPetStats(index.petStats), updated_at: now },
        { onConflict: 'user_id' },
      ),
    )
  }

  const oldLyric = index.lyricSync && typeof index.lyricSync === 'object' ? index.lyricSync : {}
  const lyricRows = Object.entries(oldLyric).map(([trackId, offset]) => ({
    user_id: userId,
    track_id: String(trackId),
    offset: Number(offset) || 0,
    updated_at: now,
  }))
  if (lyricRows.length) {
    ops.push(supabase.from('lyric_sync').upsert(lyricRows, { onConflict: 'user_id,track_id' }))
  }

  const results = await Promise.allSettled(ops)
  const failed = results.some(
    (r) => r.status === 'rejected' || (r.value && r.value.error),
  )
  if (failed) return false // não apaga os arquivos: tenta de novo depois

  await removeLegacyFiles(userId)
  return true
}

// Apaga TUDO da conta do usuário logado: as linhas das tabelas e os arquivos
// de som/capa. Usado pelo botão "Apagar todos os meus dados".
export async function purgeUserData(userId) {
  if (!supabase || !userId) return
  const results = await Promise.allSettled([
    supabase.from('user_settings').delete().eq('user_id', userId),
    supabase.from('tracks').delete().eq('user_id', userId),
    supabase.from('playlists').delete().eq('user_id', userId),
    supabase.from('playlist_tracks').delete().eq('user_id', userId),
    supabase.from('pet_stats').delete().eq('user_id', userId),
    supabase.from('lyric_sync').delete().eq('user_id', userId),
  ])
  await removeLegacyFiles(userId)
  const failed = results.some((r) => r.status === 'rejected' || (r.value && r.value.error))
  if (failed) throw new Error('Não foi possível apagar os dados da conta. Tente de novo.')
}