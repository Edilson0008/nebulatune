import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cloudEnabled,
  getSession,
  onAuthChange,
  signUpEmail,
  signInEmail,
  signInGoogle,
  signOutCloud,
  cloudInfo,
  pullBackup,
  pushBackup,
} from './cloud'
import { buildBackup } from './backup'

const POLL_MS = 15000

function traduzErro(e) {
  const msg = String(e?.message || e || '')
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/already registered|already been registered/i.test(msg))
    return 'Esse e-mail já tem conta. Use “Entrar”.'
  if (/at least 6 characters|password should be/i.test(msg))
    return 'A senha precisa ter ao menos 6 caracteres.'
  if (/invalid format|unable to validate email/i.test(msg)) return 'E-mail inválido.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Espere um pouco.'
  if (/maximum allowed size/i.test(msg))
    return 'Arquivo grande demais para um único envio. Tente de novo — o envio agora é dividido.'
  return msg || 'Algo deu errado. Tente de novo.'
}

function trackSignature(t) {
  return JSON.stringify({
    id: t?.id || '',
    title: t?.title || '',
    artist: t?.artist || '',
    album: t?.album || '',
    duration: Math.round(t?.duration || 0),
    fav: t?.fav === true,
    cover: Array.isArray(t?.cover) ? t.cover : null,
    coverRemote: t?.coverRemote || null,
    addedAt: t?.addedAt || 0,
  })
}

function signature({ library, settings, equalizer, lyricSync } = {}) {
  return JSON.stringify({
    t: (library || []).map(trackSignature).sort(),
    s: settings || null,
    e: equalizer || null,
    l: lyricSync || null,
  })
}

function backupSignature(backup) {
  return signature({
    library: backup?.tracks || [],
    settings: backup?.settings,
    equalizer: backup?.equalizer,
    lyricSync: backup?.lyricSync,
  })
}

export function useCloudSync({ library, settings, equalizer, lyricSync, loading, applyRemote }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(null)

  const armedRef = useRef(false)
  const applyingRef = useRef(false)
  const busyRef = useRef(false)
  const resolvedForRef = useRef(null)
  const pushedSigRef = useRef('')
  const lastRemoteRef = useRef(null)

  const dataRef = useRef({ library, settings, equalizer, lyricSync })
  const applyRef = useRef(applyRemote)
  const dataSig = signature({ library, settings, equalizer, lyricSync })

  useEffect(() => {
    dataRef.current = { library, settings, equalizer, lyricSync }
  }, [library, settings, equalizer, lyricSync])

  useEffect(() => {
    applyRef.current = applyRemote
  }, [applyRemote])

  const userId = user?.id || null

  const doPush = useCallback(async (id, force = false) => {
    if (!cloudEnabled || !id || busyRef.current) return
    const sig = signature(dataRef.current)
    if (!force && sig === pushedSigRef.current) return
    busyRef.current = true
    setStatus('syncing')
    try {
      const backup = await buildBackup(dataRef.current)
      const updatedAt = await pushBackup(id, backup)
      pushedSigRef.current = sig
      if (updatedAt) lastRemoteRef.current = updatedAt
      setLastSync(new Date())
      setStatus('ok')
      setMessage('')
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    } finally {
      busyRef.current = false
    }
  }, [])

  const doPull = useCallback(async (id, knownUpdatedAt) => {
    if (!cloudEnabled || !id) return
    setStatus('syncing')
    try {
      const data = await pullBackup(id)
      if (!data) throw new Error('nenhum dado na nuvem')
      const cloudSig = backupSignature(data)
      applyingRef.current = true
      await applyRef.current(data)
      armedRef.current = true
      pushedSigRef.current = cloudSig
      lastRemoteRef.current = data.exportedAt || knownUpdatedAt || null
      setLastSync(new Date())
      setStatus('ok')
      setMessage('')
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    } finally {
      applyingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!cloudEnabled) return undefined
    let active = true
    getSession().then((session) => {
      if (!active) return
      setUser(session?.user || null)
      setAuthReady(true)
    })
    const sub = onAuthChange((u) => {
      if (!active) return
      setUser(u)
      setAuthReady(true)
      if (!u) {
        armedRef.current = false
        resolvedForRef.current = null
        pushedSigRef.current = ''
        lastRemoteRef.current = null
      }
    })
    return () => {
      active = false
      sub?.unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!cloudEnabled) return undefined
    if (!userId) {
      armedRef.current = false
      resolvedForRef.current = null
      return undefined
    }
    if (loading) return undefined
    if (resolvedForRef.current === userId) return undefined
    resolvedForRef.current = userId
    let cancelled = false
    ;(async () => {
      try {
        const info = await cloudInfo(userId)
        if (cancelled) return
        if (!info.exists) {
          armedRef.current = true
          doPush(userId, true)
        } else {
          await doPull(userId, info.updatedAt)
        }
      } catch {
        /* tenta de novo depois */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, loading, doPush, doPull])

  useEffect(() => {
    if (!cloudEnabled || !userId || !armedRef.current || applyingRef.current || loading)
      return undefined
    if (dataSig === pushedSigRef.current) return undefined
    const t = setTimeout(() => doPush(userId), 5000)
    return () => clearTimeout(t)
  }, [dataSig, userId, loading, doPush])

  useEffect(() => {
    if (!cloudEnabled || !userId || loading) return undefined
    let stopped = false
    const check = async () => {
      if (stopped || busyRef.current || applyingRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const info = await cloudInfo(userId)
        if (stopped || !info.exists) return
        if (info.updatedAt && info.updatedAt !== lastRemoteRef.current) {
          await doPull(userId, info.updatedAt)
        }
      } catch {
        /* sem internet: tenta de novo no próximo ciclo */
      }
    }
    const timer = setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [userId, loading, doPull])

  const signIn = useCallback(async (email, password) => {
    setMessage('')
    setStatus('syncing')
    try {
      await signInEmail(email, password)
      setStatus('')
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    }
  }, [])

  const signUp = useCallback(async (email, password, redirectTo) => {
    setMessage('')
    setStatus('syncing')
    try {
      const res = await signUpEmail(email, password, redirectTo)
      setStatus('ok')
      if (!res.session) {
        setMessage('Enviamos um e-mail de confirmação. Abra o link para ativar sua conta.')
      }
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    }
  }, [])

  const google = useCallback(async (redirectTo) => {
    setMessage('')
    try {
      await signInGoogle(redirectTo)
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    }
  }, [])

  const signOut = useCallback(async () => {
    await signOutCloud()
    armedRef.current = false
    resolvedForRef.current = null
    pushedSigRef.current = ''
    lastRemoteRef.current = null
    setStatus('')
    setMessage('')
  }, [])

  const syncNow = useCallback(async () => {
    if (!userId) return
    try {
      const info = await cloudInfo(userId)
      if (info.exists && info.updatedAt && info.updatedAt !== lastRemoteRef.current) {
        await doPull(userId, info.updatedAt)
      } else {
        await doPush(userId, true)
      }
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    }
  }, [userId, doPull, doPush])

  return {
    cloudEnabled,
    user,
    authReady,
    status,
    message,
    lastSync,
    signIn,
    signUp,
    google,
    signOut,
    syncNow,
  }
}
