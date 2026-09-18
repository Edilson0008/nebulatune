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

export function useCloudSync({ library, settings, equalizer, lyricSync, loading, applyRemote }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [pendingCloud, setPendingCloud] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  const armedRef = useRef(false)
  const applyingRef = useRef(false)
  const busyRef = useRef(false)
  const resolvedForRef = useRef(null)
  const suppressUntilRef = useRef(0)

  const dataRef = useRef({ library, settings, equalizer, lyricSync })
  const applyRef = useRef(applyRemote)

  useEffect(() => {
    dataRef.current = { library, settings, equalizer, lyricSync }
  }, [library, settings, equalizer, lyricSync])

  useEffect(() => {
    applyRef.current = applyRemote
  }, [applyRemote])

  const userId = user?.id || null

  const doPush = useCallback(async (id) => {
    if (!cloudEnabled || !id || busyRef.current) return
    busyRef.current = true
    setStatus('syncing')
    try {
      const backup = await buildBackup(dataRef.current)
      await pushBackup(id, backup)
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

  const doPull = useCallback(async (id) => {
    if (!cloudEnabled || !id) return
    setStatus('syncing')
    try {
      const data = await pullBackup(id)
      if (!data) throw new Error('nenhum dado na nuvem')
      applyingRef.current = true
      suppressUntilRef.current = Date.now() + 3000
      await applyRef.current(data)
      armedRef.current = true
      setPendingCloud(null)
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
        setPendingCloud(null)
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
      const info = await cloudInfo(userId)
      if (cancelled) return
      if (!info.exists) {
        armedRef.current = true
        doPush(userId)
      } else if (dataRef.current.library.length === 0) {
        doPull(userId)
      } else {
        armedRef.current = false
        setPendingCloud(info)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, loading, doPush, doPull])

  useEffect(() => {
    if (!cloudEnabled || !userId || !armedRef.current || applyingRef.current || loading) return undefined
    if (Date.now() < suppressUntilRef.current) return undefined
    const t = setTimeout(() => doPush(userId), 6000)
    return () => clearTimeout(t)
  }, [library, settings, equalizer, lyricSync, userId, loading, doPush])

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
    setPendingCloud(null)
    setStatus('')
    setMessage('')
  }, [])

  const syncNow = useCallback(async () => {
    if (userId) await doPush(userId)
  }, [userId, doPush])

  const downloadCloud = useCallback(async () => {
    if (userId) await doPull(userId)
  }, [userId, doPull])

  const keepLocal = useCallback(async () => {
    if (!userId) return
    armedRef.current = true
    setPendingCloud(null)
    await doPush(userId)
  }, [userId, doPush])

  return {
    cloudEnabled,
    user,
    authReady,
    status,
    message,
    pendingCloud,
    lastSync,
    signIn,
    signUp,
    google,
    signOut,
    syncNow,
    downloadCloud,
    keepLocal,
  }
}
