// Conta opcional via Supabase (REST + Auth direto, sem biblioteca extra).
// Só funciona se SUPABASE_URL + ANON_KEY estiverem preenchidos no app-config;
// sem eles tudo vira no-op e o app segue 100% local.
//
// A sessão (access_token + refresh_token) fica guardada em `nt.account.session`
// e é renovada sozinha antes de expirar — por isso o app continua logado
// mesmo depois de dias fechado.

import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../app-config.js'
import { readLocal, writeLocal } from '../localstore.js'

const SESSION_KEY = 'nt.account.session'
const CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
// Renova o token 2 minutos antes de expirar.
const RENEW_AHEAD_MS = 2 * 60 * 1000

let session = readLocal(SESSION_KEY)
let renewing = null
const listeners = new Set()

export const accountConfigured = () => CONFIGURED

export function getSession() {
  return session
}

export function onAccount(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit() {
  listeners.forEach((cb) => {
    try {
      cb(session)
    } catch {
      /* listener quebrado não derruba os outros */
    }
  })
}

function setSession(next) {
  session = next
  if (next) writeLocal(SESSION_KEY, next)
  else writeLocal(SESSION_KEY, null)
  // NADA é reivindicado automaticamente aqui. Quem marca o dono dos dados do
  // aparelho é o próprio sync (após uma sincronização real) ou uma decisão
  // explícita do usuário (conta nova = começa do zero). Se tomássemos posse
  // no login, os dados da conta anterior vazariam para a conta recém-entrada.
  emit()
}

export function clearSession() {
  setSession(null)
}

// Tradução de erros do Supabase para mensagens simples, em português.
export function friendlyError(raw) {
  const text = typeof raw === 'string' ? raw : String((raw && (raw.error_description || raw.msg || raw.message || raw.error_code)) || '')
  if (!text) return 'Algo deu errado. Tente de novo.'
  const l = text.toLowerCase()
  if (l.includes('invalid or has expired') || l.includes('otp_expired') || l.includes('has expired')) {
    return 'Esse link já expirou. Peça um e-mail novo em "Esqueci a senha".'
  }
  if (l.includes('email not confirmed')) return 'Confirme seu email pelo link que enviamos antes de entrar.'
  if (l.includes('new password should be different')) return 'A nova senha precisa ser diferente da antiga.'
  if (l.includes('new password should not be empty')) return 'Digite uma senha nova.'
  if (l.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (l.includes('invalid login credentials')) return 'Email ou senha incorretos.'
  if (l.includes('already registered') || l.includes('already been registered')) return 'Este email já tem conta. Entre em vez de criar.'
  if (l.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (l.includes('invalid email') || l.includes('unable to validate email')) return 'Esse email não parece válido.'
  if (l.includes('for security purposes') || l.includes('resend')) return 'Aguarde um pouco antes de pedir outro link.'
  if (l.includes('rate limit') || l.includes('too many')) return 'Muitas tentativas seguidas. Espere um instante e tente de novo.'
  if (l.includes('fetch') || l.includes('network') || l.includes('load failed')) return 'Sem conexão com a internet. Verifique e tente de novo.'
  return text
}

const baseHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
})

// Chamada simples na API do Supabase.
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = baseHeaders()
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new Error(friendlyError(err))
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

// Renova o token guardado (usado sozinho e junto de outras chamadas).
export async function renewSession() {
  if (!CONFIGURED || !session?.refresh_token) return null
  if (renewing) return renewing
  renewing = (async () => {
    const { ok, data } = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    })
    renewing = null
    if (!ok || !data?.access_token) {
      setSession(null)
      return null
    }
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || session.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user || session.user,
    }
    setSession(next)
    return next
  })()
  return renewing
}

// Garante um token válido antes de usar (renova se estiver perto de vencer).
export async function ensureSession() {
  if (!CONFIGURED || !session?.access_token) return null
  const expiresAt = Number(session.expires_at) || 0
  if (expiresAt && Date.now() > expiresAt - RENEW_AHEAD_MS) return renewSession()
  return session
}

// Chamada já autenticada: renova o token se preciso e repete uma vez se o
// servidor recusar (401 = token vencido).
// Tempo máximo de uma requisição. Sem isto, uma rede que aceita a conexão e
// nunca responde (wi-fi de hotel, portal cativo) deixa o fetch pendurado para
// sempre — e as filas do app (gravações de perfil, sincronização) travam sem
// erro nenhum: o nome e a foto mudam na tela e nunca chegam em lugar nenhum.
const TIMEOUT_REQUISICAO = 20000

export async function authedFetch(path, { method = 'GET', body, headers = {}, timeout = TIMEOUT_REQUISICAO } = {}) {
  const run = async (token) => {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: { ...baseHeaders(), Authorization: `Bearer ${token}`, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    return { ok: res.ok, status: res.status, data }
  }

  let current = await ensureSession()
  if (!current) return { ok: false, status: 0, data: { msg: 'sem sessão' } }
  try {
    let res = await run(current.access_token)
    if (res.status === 401) {
      current = (await renewSession()) || current
      res = await run(current.access_token)
    }
    return res
  } catch (err) {
    // O AbortSignal também cobre rede caída, DNS e TLS: o erro vira um
    // "não deu" comum, em vez de uma promessa que nunca resolve.
    return { ok: false, status: 0, data: { msg: 'sem conexão', erro: String(err && err.message) } }
  }
}

export async function getUserId() {
  const current = await ensureSession()
  return current?.user?.id || session?.user?.id || null
}

// Revalida a sessão guardada quando o app abre (conta removida no servidor,
// token revogado, etc.).
export async function restoreSession() {
  if (!CONFIGURED || !session) return
  const token = session.access_token
  const current = await ensureSession()
  // Entrou/saiu enquanto a checagem rodava: não mexe mais.
  if (session?.access_token !== token) return
  if (!current) return
  const { ok, data } = await api('/auth/v1/user', { token: current.access_token })
  if (!ok || !data?.id) {
    if (session?.access_token === token) setSession(null)
    return
  }
  if (session && data.id !== session.user?.id) setSession(null)
}

export async function signUp(email, password) {
  if (!CONFIGURED) return { ok: false, error: 'Conta ainda não configurada neste app.' }
  const mail = String(email || '').trim()
  const { ok, data } = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: mail, password: String(password || '') },
  })
  if (!ok) return { ok: false, error: friendlyError(data) }
  if (data?.access_token) {
    setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user || null,
    })
  }
  return {
    ok: true,
    needsConfirm: !data?.access_token,
    email: mail,
  }
}

export async function signIn(email, password) {
  if (!CONFIGURED) return { ok: false, error: 'Conta ainda não configurada neste app.' }
  const { ok, data } = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: String(email || '').trim(), password: String(password || '') },
  })
  if (!ok || !data?.access_token) return { ok: false, error: friendlyError(data) }
  setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: data.user || null,
  })
  return { ok: true }
}

export async function resetPassword(email) {
  if (!CONFIGURED) return { ok: false, error: 'Conta ainda não configurada neste app.' }
  const { ok, data } = await api('/auth/v1/recover', {
    method: 'POST',
    // O link do e-mail tem que abrir o app de verdade, não um localhost.
    body: { email: String(email || '').trim(), redirect_to: `${SITE_URL}/` },
  })
  if (!ok) return { ok: false, error: friendlyError(data) }
  return { ok: true }
}

// ── Link de recuperação (vem por e-mail) ─────────────────────────────────────
// O Supabase manda a pessoa para o app com o token no final do endereço:
// .../nebulatune/#access_token=...&type=recovery
let recovery = null

function parseRecovery() {
  if (typeof window === 'undefined' || !window.location) return null
  try {
    const bruto = String(window.location.hash || '').replace(/^#/, '')
    if (!bruto) return null
    const p = new URLSearchParams(bruto)
    // Link que já expirou: o Supabase manda o erro em vez do token. Precisa ser
    // conferido ANTES de exigir o access_token, senão a pessoa cai no login
    // normal sem entender o que houve.
    if (p.get('error_code') || p.get('error_description')) {
      return { erro: friendlyError({ msg: p.get('error_description') || p.get('error_code') }) }
    }
    if (bruto.indexOf('access_token') < 0) return null
    if (p.get('type') !== 'recovery') return null
    return {
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token') || '',
      email: String(p.get('email') || '').replace(/\+/g, ' '),
    }
  } catch {
    return null
  }
}

function detectRecovery() {
  const achado = parseRecovery()
  if (!achado) return
  recovery = achado
  emit()
  // Limpa o endereço para a pessoa não recarregar e ver a tela de novo.
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    /* sem histórico: tudo bem */
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  detectRecovery()
  window.addEventListener('hashchange', detectRecovery)
}

export function getRecovery() {
  return recovery
}

export function clearRecovery() {
  recovery = null
}

// Troca a senha e já deixa a pessoa conectada.
export async function updatePassword(novaPass) {
  const rec = recovery
  if (!rec || rec.erro) {
    return { ok: false, error: rec?.erro || 'Esse link de recuperação não serve mais. Peça um e-mail novo.' }
  }
  if (String(novaPass || '').length < 6) {
    return { ok: false, error: 'A senha precisa ter pelo menos 6 caracteres.' }
  }
  const { ok, data } = await api('/auth/v1/user', {
    method: 'PUT',
    body: { password: String(novaPass) },
    token: rec.access_token,
  })
  if (!ok) return { ok: false, error: friendlyError(data) }

  // O token de recuperação vale como sessão: aproveita para deixar logado.
  if (rec.refresh_token) {
    const r = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: rec.refresh_token },
    })
    if (r.ok && r.data?.access_token) {
      setSession({
        access_token: r.data.access_token,
        refresh_token: r.data.refresh_token || rec.refresh_token,
        expires_at: Date.now() + (Number(r.data.expires_in) || 3600) * 1000,
        user: r.data.user || null,
      })
    }
  }
  recovery = null
  return { ok: true }
}

export async function signOut() {
  clearSession()
}
