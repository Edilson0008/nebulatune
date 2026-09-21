import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  if (/maximum allowed size|exceeded the maximum|payload too large|entity too large|too large/i.test(msg))
    return 'Um arquivo é grande demais para o servidor de nuvem (limite do plano). O restante foi salvo na conta.'
  if (/limit exceeded|resource exhausted/i.test(msg))
    return 'Limite de armazenamento da nuvem atingido. Considere liberar espaço ou apagar backups antigos.'
  if (/failed to fetch|networkerror|network error|load failed|typeerror.*fetch|econnreset|timeout/i.test(msg))
    return 'Sem conexão com a nuvem agora. Verifique o Wi‑Fi/dados móveis e tente de novo em instantes.'
  if (/cors|origin.*not allowed|blocked by cors/i.test(msg))
    return 'O servidor da nuvem bloqueou este aparelho. Se o problema persistir, reabra o app.'
  if (/invalid api key|apikey|invalid.*key|anon key|project not found/i.test(msg))
    return 'Configuração da nuvem precisa ser atualizada. Reabra o app ou nos avise.'
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
    plays: t?.plays || 0,
    playDays: JSON.stringify((t?.playDays && typeof t.playDays === 'object') ? t.playDays : {}),
  })
}

function signature({ library, settings, equalizer, lyricSync, playlists = null, petStats = null } = {}) {
  return JSON.stringify({
    t: (library || []).map(trackSignature).sort(),
    s: settings || null,
    e: equalizer || null,
    l: lyricSync || null,
    p: Array.isArray(playlists) ? playlists : null,
    pet: petStats || null,
  })
}

// Resumo do que está na nuvem (para o usuário ver que os dados subiram).
function summarizeCloud(backup) {
  if (!backup || !Array.isArray(backup.tracks)) return null
  const favs = backup.tracks.filter((t) => t && t.fav === true).length
  const pet = backup.petStats && typeof backup.petStats === 'object' ? backup.petStats : null
  return {
    tracks: backup.tracks.length,
    favs,
    lastFav: favs > 0 ? 'sim' : 'não',
    pet: pet
      ? {
          touches: Number(pet.touches) || 0,
          hearts: Number(pet.hearts) || 0,
          sleeps: Number(pet.sleeps) || 0,
          scares: Number(pet.scares) || 0,
          meows: Number(pet.meows) || 0,
        }
      : null,
  }
}

// Exclusões pendentes deste aparelho (música apagada aqui que a conta ainda
// precisa apagar). Fica guardado só até o envio dar certo.
const REMOVED_KEY = 'nt.removed'

function loadRemovedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}

function saveRemovedIds(set) {
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...set]))
  } catch {
    /* armazenamento indisponível */
  }
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// Compara o que o aparelho tem AGORA com o que ele recebeu por último da
// conta. O que estiver diferente foi mexido NESTE aparelho.
function sectionDirty(data, base) {
  return {
    settings: !sameJson(data.settings, base.settings),
    equalizer: !sameJson(data.equalizer, base.equalizer),
    lyricSync: !sameJson(data.lyricSync, base.lyricSync),
    playlists: !sameJson(data.playlists, base.playlists),
    petStats: !sameJson(data.petStats, base.petStats),
  }
}

function anyDirty(dirty) {
  return Boolean(
    dirty.settings ||
      dirty.equalizer ||
      dirty.lyricSync ||
      dirty.playlists ||
      dirty.petStats,
  )
}

function baseFrom(data) {
  return {
    settings: data?.settings ?? null,
    equalizer: data?.equalizer ?? null,
    lyricSync: data?.lyricSync ?? null,
    playlists: data?.playlists ?? null,
    petStats: data?.petStats ?? null,
  }
}

export function useCloudSync({ library, settings, equalizer, lyricSync, playlists = null, petStats = null, loading, applyRemote }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [cloudSummary, setCloudSummary] = useState(null)

  const armedRef = useRef(false)
  const applyingRef = useRef(false)
  const busyRef = useRef(false)
  const resolvedForRef = useRef(null)
  const pushedSigRef = useRef('')
  const lastRemoteRef = useRef(null)
  // Guarda um aviso/erro do ENVIO para que o passo de baixar (que roda logo
  // depois) não apague a mensagem — senão o app dizia "tudo certo" mesmo
  // quando uma música não conseguia subir.
  const pushWarnRef = useRef('')
  // O que este aparelho recebeu/confirmou por último da conta. Serve para
  // saber o que ele MUDOU de verdade (só isso sobe; o resto vem da conta).
  const baseRef = useRef({ settings, equalizer, lyricSync, playlists, petStats })
  // Exclusões pendentes (feitas neste aparelho, ainda não confirmadas na conta).
  const removedRef = useRef(null)
  if (removedRef.current === null) removedRef.current = loadRemovedIds()
  // Marca que um recebimento da nuvem acabou de acontecer (evita reenvio imediato).
  const justPulledRef = useRef(false)

  const dataRef = useRef({ library, settings, equalizer, lyricSync, playlists, petStats })
  const applyRef = useRef(applyRemote)
  // Assinatura memoizada: só recalcula quando algum dado muda de verdade.
  // Antes era recalculada (biblioteca inteira serializada) a cada renderização
  // do app — pesado com bibliotecas grandes e o tempo da música atualizando.
  const dataSig = useMemo(
    () => signature({ library, settings, equalizer, lyricSync, playlists, petStats }),
    [library, settings, equalizer, lyricSync, playlists, petStats],
  )

  useEffect(() => {
    dataRef.current = { library, settings, equalizer, lyricSync, playlists, petStats }
  }, [library, settings, equalizer, lyricSync, playlists, petStats])

  useEffect(() => {
    applyRef.current = applyRemote
  }, [applyRemote])

  const userId = user?.id || null

  const doPush = useCallback(async (id, force = false) => {
    if (!cloudEnabled || !id || busyRef.current) return { ok: true, failures: [] }
    const sig = signature(dataRef.current)
    if (!force && sig === pushedSigRef.current) return { ok: true, failures: [] }
    busyRef.current = true
    setStatus('syncing')
    try {
      const data = dataRef.current
      // Só o que ESTE aparelho mudou desde o último recebimento vira "dirty"
      // (e, portanto, tem prioridade sobre a conta no envio).
      const dirty = sectionDirty(data, baseRef.current)
      const backup = await buildBackup(data)
      const res = await pushBackup(id, {
        ...backup,
        removed: [...removedRef.current],
        dirty,
      })
      const finalCloud = res?.final || backup
      pushedSigRef.current = sig
      justPulledRef.current = false
      if (res?.updatedAt) lastRemoteRef.current = res.updatedAt
      // Já confirmado na conta: guarda como base e limpa as exclusões enviadas.
      baseRef.current = baseFrom(finalCloud)
      if (removedRef.current.size) {
        removedRef.current.clear()
        saveRemovedIds(removedRef.current)
      }
      // Mostra o que está REALMENTE na nuvem após a mescla (a união dos dois
      // aparelhos), não apenas o que este aparelho enviou — assim os dois
      // lados exibem os mesmos números e fica fácil conferir.
      setCloudSummary(summarizeCloud(finalCloud))
      setLastSync(new Date())
      const failures = res?.audioFailures || []
      if (failures.length) {
        const names = failures
          .slice(0, 2)
          .map((f) => f.title || f.id)
          .join(', ')
        pushWarnRef.current = `A conta salvou tudo, mas o som de ${failures.length} música(s) não subiu (${names}). O resto foi sincronizado.`
        setStatus('error')
        setMessage(pushWarnRef.current)
      } else {
        pushWarnRef.current = ''
        setStatus('ok')
        setMessage('')
      }
      return { ok: true, failures }
    } catch (e) {
      pushWarnRef.current = traduzErro(e)
      setStatus('error')
      setMessage(pushWarnRef.current)
      return { ok: false, failures: [] }
    } finally {
      busyRef.current = false
    }
  }, [])

  const doPull = useCallback(async (id, knownUpdatedAt) => {
    if (!cloudEnabled || !id) return { ok: true }
    setStatus('syncing')
    try {
      const data = await pullBackup(id)
      if (!data) throw new Error('nenhum dado na nuvem')
      applyingRef.current = true
      await applyRef.current(data)
      armedRef.current = true
      // A conta é a base: o que este aparelho tem agora é o que ela mandou.
      baseRef.current = baseFrom(data)
      justPulledRef.current = true
      // ⚠️ Não marca o estado local como "já enviado" aqui: o envio é sempre
      // feito com o estado DEPOIS de aplicar a nuvem (o próximo ciclo de push
      // manda a versão mesclada de verdade). Assim um aparelho nunca envia
      // dados velhos por cima do que acabou de baixar.
      setCloudSummary(summarizeCloud(data))
      lastRemoteRef.current = data.exportedAt || knownUpdatedAt || null
      setLastSync(new Date())
      // Se o envio deixou um aviso/erro pendente, NÃO apaga aqui — o usuário
      // precisa ver que algo não subiu.
      if (pushWarnRef.current) {
        setStatus('error')
        setMessage(pushWarnRef.current)
      } else {
        setStatus('ok')
        setMessage('')
      }
      return { ok: true, missingAudio: data.missingAudio || 0 }
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
      return { ok: false }
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
        // Sempre sobe o que este aparelho tem (a nuvem MESCLA, nada se perde)
        // e depois baixa a conta completa e aplica — o aparelho reflete a
        // nuvem desde o primeiro carregamento.
        await doPush(userId, true)
        if (!cancelled && info.exists) {
          await doPull(userId, info.updatedAt || null)
        }
        armedRef.current = true
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
    // Acabou de receber da conta: adota como sincronizado e NÃO devolve na
    // hora — senão um aparelho veria o envio do outro e mandaria de volta,
    // num vai-e-volta eterno (que ainda reconvertia áudios sem parar).
    if (justPulledRef.current) {
      justPulledRef.current = false
      if (!anyDirty(sectionDirty(dataRef.current, baseRef.current))) {
        pushedSigRef.current = dataSig
        return undefined
      }
    }
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
        // 1) Se este aparelho tem mudanças que ainda não subiram, sobe PRIMEIRO
        //    (para não perdê-las ao receber algo que o outro aparelho mudou).
        const localSig = signature(dataRef.current)
        if (localSig !== pushedSigRef.current) {
          await doPush(userId)
          return
        }
        // 2) Nada local pendente: vê se a conta mudou (outro aparelho) e puxa.
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
  }, [userId, loading, doPull, doPush])

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

  // Marca músicas apagadas NESTE aparelho para a conta apagar também
  // (sem isso, elas voltavam na próxima sincronização).
  const markRemoved = useCallback((ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    let changed = false
    for (const id of list) {
      const value = String(id || '')
      if (!value || removedRef.current.has(value)) continue
      removedRef.current.add(value)
      changed = true
    }
    if (changed) saveRemovedIds(removedRef.current)
  }, [])

  const signOut = useCallback(async () => {
    await signOutCloud()
    armedRef.current = false
    resolvedForRef.current = null
    pushedSigRef.current = ''
    lastRemoteRef.current = null
    pushWarnRef.current = ''
    justPulledRef.current = false
    setStatus('')
    setMessage('')
  }, [])

  const syncNow = useCallback(async () => {
    if (!userId) return
    try {
      const info = await cloudInfo(userId)
      // 1º SOBE o que este aparelho tem — a nuvem MESCLA (nada se perde).
      // Assim as músicas/pontuações/ajustes locais entram na conta primeiro.
      await doPush(userId, true)
      // 2º BAIXA a conta completa e aplica no aparelho — o aparelho passa a
      // refletir a nuvem (estilo Spotify: só um "cliente" da conta).
      if (info.exists) {
        await doPull(userId, info.updatedAt)
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
    cloudSummary,
    signIn,
    signUp,
    google,
    signOut,
    syncNow,
    markRemoved,
  }
}
