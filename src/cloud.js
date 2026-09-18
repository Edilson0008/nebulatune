import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './app-config'

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
const FILE = 'backup.json'
const objectPath = (userId) => `${userId}/${FILE}`

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

export async function cloudInfo(userId) {
  if (!supabase) return { exists: false, updatedAt: null }
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 })
  if (error) return { exists: false, updatedAt: null, error }
  const obj = (data || []).find((o) => o.name === FILE)
  if (!obj) return { exists: false, updatedAt: null }
  return {
    exists: true,
    updatedAt: obj.updated_at || obj.created_at || null,
    size: obj.metadata?.size || null,
  }
}

export async function pullBackup(userId) {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath(userId))
  if (error) throw error
  const text = await data.text()
  return JSON.parse(text)
}

export async function pushBackup(userId, backup) {
  if (!supabase) return
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath(userId), blob, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '0',
  })
  if (error) throw error
}
