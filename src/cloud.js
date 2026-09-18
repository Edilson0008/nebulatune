import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './app-config'
import { blobToDataUrl } from './backup'

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

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
    for (const meta of index.tracks) {
      let audioData = null
      let coverData = null
      if (meta.audioKey) {
        const { data, error } = await storage().download(`${userId}/${meta.audioKey}`)
        if (error) throw error
        audioData = await blobToDataUrl(data)
      }
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
      tracks,
      settings: index.settings || null,
      equalizer: index.equalizer || null,
      lyricSync: index.lyricSync || null,
    }
  }

  const { data, error } = await storage().download(`${userId}/${LEGACY_FILE}`)
  if (error) throw error
  return JSON.parse(await data.text())
}

export async function pushBackup(userId, backup) {
  if (!supabase) return

  const existing = new Set()
  for (const dir of [TRACKS_DIR, COVERS_DIR]) {
    for (const file of await listAll(`${userId}/${dir}`)) existing.add(`${dir}/${file.name}`)
  }

  const refs = new Set()
  const metas = []

  for (const t of backup.tracks || []) {
    const meta = { ...t }
    delete meta.audioData
    delete meta.coverData
    const id = safeKey(t.id)

    if (t.audioData) {
      const parsed = splitDataUrl(t.audioData)
      if (parsed) {
        const key = `${TRACKS_DIR}/${id}-${t.audioData.length}.bin`
        refs.add(key)
        meta.audioKey = key
        if (!existing.has(key)) {
          const { error } = await storage().upload(
            `${userId}/${key}`,
            new Blob([parsed.bytes], { type: parsed.mime }),
            { upsert: true, contentType: parsed.mime, cacheControl: '3600' },
          )
          if (error) throw error
        }
      }
    }

    if (t.coverData) {
      const parsed = splitDataUrl(t.coverData)
      if (parsed) {
        const key = `${COVERS_DIR}/${id}-${t.coverData.length}.bin`
        refs.add(key)
        meta.coverKey = key
        if (!existing.has(key)) {
          const { error } = await storage().upload(
            `${userId}/${key}`,
            new Blob([parsed.bytes], { type: parsed.mime }),
            { upsert: true, contentType: parsed.mime, cacheControl: '3600' },
          )
          if (error) throw error
        }
      }
    }

    metas.push(meta)
  }

  const index = {
    v: 3,
    updatedAt: new Date().toISOString(),
    count: metas.length,
    settings: backup.settings || null,
    equalizer: backup.equalizer || null,
    lyricSync: backup.lyricSync || null,
    tracks: metas,
  }
  const { error } = await storage().upload(
    `${userId}/${INDEX_FILE}`,
    new Blob([JSON.stringify(index)], { type: 'application/json' }),
    { upsert: true, contentType: 'application/json', cacheControl: '0' },
  )
  if (error) throw error

  await cleanupOld(userId, refs)
  return index.updatedAt
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
