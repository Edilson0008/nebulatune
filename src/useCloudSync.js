import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cloudEnabled,
  getSession,
  onAuthChange,
  signUpEmail,
  signInEmail,
  signOutCloud,
  pullFromDb,
  pushDiffToDb,
  computeDiff,
  purgeUserData,
  migrateLegacy,
  canonTrackRow,
  canonPlaylistRow,
  canonEntryRow,
  canonLyricRow,
  canonPetStats,
  entryKey,
  EMPTY_SNAPSHOT,
} from './cloud'

const POLL_MS = 15000

function traduzErro(e) {
  const msg = String(e?.message || e || '')
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/already registered|already been registered/i.test(msg))
    return 'Esse e-mail já tem conta. Use "Entrar".'
  if (/at least 6 characters|password should be/i.test(msg))
    return 'A senha precisa ter ao menos 6 caracteres.'
  if (/invalid format|unable to validate email/i.test(msg)) return 'E-mail inválido.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Espere um pouco.'
  if (/isTablesMissing|does not exist|PGRST205|PGRST301/i.test(msg))
    return 'O banco ainda não foi atualizado. O administrador precisa rodar o setup.sql no painel do Supabase.'
  if (/failed to fetch|networkerror|network error|load failed|typeerror.*fetch|econnreset|timeout/i.test(msg))
    return 'Sem conexão com a nuvem agora. Verifique o Wi‑Fi/dados móveis e tente de novo em instantes.'
  if (/cors|origin.*not allowed|blocked by cors/i.test(msg))
    return 'O servidor da nuvem bloqueou este aparelho. Se o problema persistir, reabra o app.'
  if (/invalid api key|apikey|invalid.*key|anon key|project not found/i.test(msg))
    return 'Configuração da nuvem precisa ser atualizada. Reabra o app ou nos avise.'
  return msg || 'Algo deu errado. Tente de novo.'
}

// Normaliza o estado local do app em um snapshot canônico (formato de tabela),
// pronto para comparar com o que veio da nuvem.
function snapshotOf({ library, settings, equalizer, lyricSync, playlists = null, petStats = null } = {}) {
  const tracks = new Map()
  for (const t of library || []) {
    const row = canonTrackRow(t)
    // Mantém o áudio/blobs em memória, mas a referência do arquivo na nuvem
    // é preservada separadamente (audioKey/coverKey já vieram do cloud).
    tracks.set(row.id, row)
  }
  const playlistsMap = new Map()
  for (const p of Array.isArray(playlists) ? playlists : []) {
    playlistsMap.set(String(p.id), canonPlaylistRow(p))
  }
  const entries = new Map()
  for (const p of Array.isArray(playlists) ? playlists : []) {
    const ids = Array.isArray(p.trackIds) ? p.trackIds : []
    ids.forEach((tid, i) => {
      if (tid != null) entries.set(entryKey(p.id, tid), canonEntryRow(p.id, tid, i))
    })
  }
  const lyricMap = new Map()
  for (const [k, v] of Object.entries(lyricSync || {})) {
    lyricMap.set(String(k), canonLyricRow(k, v))
  }
  return {
    settings: settings && typeof settings === 'object' ? settings : null,
    equalizer: equalizer && typeof equalizer === 'object' ? equalizer : null,
    tracks,
    playlists: playlistsMap,
    playlistEntries: entries,
    petStats: petStats && typeof petStats === 'object' ? petStats : null,
    lyricSync: lyricMap,
  }
}

// Assinatura serializada para detectar mudanças rápidas (sem calcular diff
// completo a cada render).
function snapSignature(snap) {
  const tracks = [...snap.tracks.values()].map(canonTrackRow).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const pls = [...snap.playlists.values()].map(canonPlaylistRow).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const ents = [...snap.playlistEntries.values()].sort((a, b) => (a.playlistId + a.trackId < b.playlistId + b.trackId ? -1 : 1))
  const lyric = [...snap.lyricSync.values()].sort((a, b) => (a.trackId < b.trackId ? -1 : a.trackId > b.trackId ? 1 : 0))
  return JSON.stringify({
    s: snap.settings ?? null,
    e: snap.equalizer ?? null,
    t: tracks,
    p: pls,
    en: ents,
    l: lyric,
    pe: canonPetStats(snap.petStats),
  })
}

// Resumo do que está na nuvem (para mostrar ao usuário).
function summarizeCloud(snap) {
  if (!snap || !(snap.tracks instanceof Map)) return null
  const tracks = [...snap.tracks.values()]
  const favs = tracks.filter((t) => t.fav === true).length
  const pet = snap.petStats
  return {
    tracks: tracks.length,
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

export function useCloudSync({ library, settings, equalizer, lyricSync, playlists = null, petStats = null, loading, applyRemote }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [cloudSummary, setCloudSummary] = useState(null)
  const [seeded, setSeeded] = useState(false)

  const armedRef = useRef(false)
  const applyingRef = useRef(false)
  const busyRef = useRef(false)
  const resolvedForRef = useRef(null)
  const pushWarnRef = useRef('')
  const baseRef = useRef(null) // snapshot|null: o que a conta tem (última base recebida/gravada)
  const justPulledRef = useRef(false)

  const dataRef = useRef({ library, settings, equalizer, lyricSync, playlists, petStats })
  const applyRef = useRef(applyRemote)

  const dataSig = useMemo(
    () => snapSignature(snapshotOf({ library, settings, equalizer, lyricSync, playlists, petStats })),
    [library, settings, equalizer, lyricSync, playlists, petStats],
  )

  useEffect(() => {
    dataRef.current = { library, settings, equalizer, lyricSync, playlists, petStats }
  }, [library, settings, equalizer, lyricSync, playlists, petStats])

  useEffect(() => {
    applyRef.current = applyRemote
  }, [applyRemote])

  const userId = user?.id || null

  // ---- PUSH: envia as diferenças deste aparelho para a conta -----------
  const doPush = useCallback(async (id, force = false) => {
    if (!cloudEnabled || !id || busyRef.current) return { ok: true }
    const localSnap = snapshotOf(dataRef.current)
    const base = baseRef.current || EMPTY_SNAPSHOT
    const diff = computeDiff(localSnap, base)
    if (!force && diff.empty) return { ok: true }
    busyRef.current = true
    setStatus('syncing')
    try {
      await pushDiffToDb(id, localSnap, diff, dataRef.current.library || [])
      // A partir de agora, o estado local É a base (o que mandamos).
      baseRef.current = localSnap
      justPulledRef.current = false
      setCloudSummary(summarizeCloud(localSnap))
      setLastSync(new Date())
      if (diff.empty && pushWarnRef.current) {
        // já tinha um aviso de push anterior, mantém
      } else {
        pushWarnRef.current = ''
        setStatus('ok')
        setMessage('')
      }
      return { ok: true }
    } catch (e) {
      pushWarnRef.current = traduzErro(e)
      setStatus('error')
      setMessage(pushWarnRef.current)
      return { ok: false }
    } finally {
      busyRef.current = false
    }
  }, [])

  // ---- PULL: baixa a conta e aplica neste aparelho ----------------------
  const doPull = useCallback(async (id) => {
    if (!cloudEnabled || !id) return { ok: true }
    setStatus('syncing')
    try {
      const remote = await pullFromDb(id)
      if (!remote) throw new Error('nenhum dado na nuvem')
      applyingRef.current = true
      // Passa a base ANTERIOR (o que a conta tinha antes) junto com o remote:
      // assim o aparelho sabe o que foi excluído DE VERDADE na nuvem e não
      // "ressuscita" música apagada por outro aparelho.
      await applyRef.current(remote, baseRef.current)
      armedRef.current = true
      baseRef.current = remote
      justPulledRef.current = true
      setCloudSummary(summarizeCloud(remote))
      setLastSync(new Date())
      if (pushWarnRef.current) {
        setStatus('error')
        setMessage(pushWarnRef.current)
      } else {
        setStatus('ok')
        setMessage('')
      }
      return { ok: true }
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
      return { ok: false }
    } finally {
      applyingRef.current = false
    }
  }, [])

  // ---- SINCRONIZAÇÃO INICIAL: migra dados antigos + sobe + baixa --------
  const initialSync = useCallback(
    async (id) => {
      try {
        await migrateLegacy(id)
        // A conta manda: primeiro BAIXA a nuvem e aplica (tema/nome/músicas
        // aparecem na hora, sem sobrescrever o que já está salvo no e-mail).
        // Enviar ANTES baixar fazia um aparelho "novo" (ex.: navegador) subir
        // os ajustes de fábrica por cima da conta e apagar o que o outro
        // aparelho tinha salvo. Depois do pull, qualquer dado que este
        // aparelho tiver por conta própria (música importada antes do login)
        // sobe sozinho pelo auto-push em ~5s.
        await doPull(id)
        armedRef.current = true
        setSeeded(true)
      } catch {
        // tenta de novo no próximo poll
        armedRef.current = false
      }
    },
    [doPull],
  )

  // ---- AUTH: detecta login/logout ----------------------------------------
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
        setSeeded(false)
        baseRef.current = null
        justPulledRef.current = false
      }
    })
    return () => {
      active = false
      sub?.unsubscribe?.()
    }
  }, [])

  // ---- PRIMEIRO CARREGAMENTO: espera o app estar pronto e sincroniza ----
  useEffect(() => {
    if (!cloudEnabled || !userId) {
      armedRef.current = false
      resolvedForRef.current = null
      return undefined
    }
    if (loading) return undefined
    if (resolvedForRef.current === userId) return undefined
    resolvedForRef.current = userId
    let cancelled = false
    ;(async () => {
      if (!cancelled) await initialSync(userId)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, loading, initialSync])

  // ---- AUTO-PUSH: 5s depois que algo muda localmente --------------------
  useEffect(() => {
    if (!cloudEnabled || !userId || !seeded || applyingRef.current || loading)
      return undefined
    const localSnap = snapshotOf(dataRef.current)
    const base = baseRef.current || EMPTY_SNAPSHOT
    const diff = computeDiff(localSnap, base)
    if (diff.empty) return undefined
    // Acabou de receber da conta: adota como base e não devolve na hora.
    if (justPulledRef.current) {
      justPulledRef.current = false
      if (computeDiff(localSnap, baseRef.current || EMPTY_SNAPSHOT).empty) {
        return undefined
      }
    }
    const t = setTimeout(() => doPush(userId), 5000)
    return () => clearTimeout(t)
  }, [dataSig, userId, loading, doPush, seeded])

  // ---- POLL: a cada 15s verifica se a conta mudou (outro aparelho) ------
  useEffect(() => {
    if (!cloudEnabled || !userId || loading) return undefined
    let stopped = false
    const check = async () => {
      if (stopped || busyRef.current || applyingRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        // Sem dados na base ainda (não fez seed ou falhou): tenta de novo.
        if (!seeded) {
          await initialSync(userId)
          return
        }
        // Se tem mudança local pendente, sobe primeiro.
        const localSnap = snapshotOf(dataRef.current)
        const base = baseRef.current || EMPTY_SNAPSHOT
        if (!computeDiff(localSnap, base).empty) {
          await doPush(userId)
          return
        }
        // Nada pendente: verifica se a conta mudou e baixa.
        const remote = await pullFromDb(userId)
        if (stopped || !remote) return
        if (snapSignature(remote) !== snapSignature(baseRef.current || EMPTY_SNAPSHOT)) {
          await doPull(userId)
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
  }, [userId, loading, doPull, doPush, seeded, initialSync])

  // ---- AÇÕES DO USUÁRIO -------------------------------------------------
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

  const signOut = useCallback(async () => {
    await signOutCloud()
    armedRef.current = false
    resolvedForRef.current = null
    setSeeded(false)
    baseRef.current = null
    justPulledRef.current = false
    pushWarnRef.current = ''
    setStatus('')
    setMessage('')
    setCloudSummary(null)
  }, [])

  const syncNow = useCallback(async () => {
    if (!userId) return
    try {
      // Primeiro BAIXA a conta (a nuvem manda) — evita que um aparelho
      // "novo" suba seus valores de fábrica por cima do que já está salvo.
      // Depois o auto-push sobe em ~5s o que este aparelho tiver a mais.
      await doPull(userId)
      setStatus('ok')
      setMessage('')
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    }
  }, [userId, doPull])

  // Apaga TODOS os dados da conta (tabelas + arquivos) e zera o aparelho.
  const purgeAll = useCallback(async () => {
    if (!userId) return
    busyRef.current = true
    setStatus('syncing')
    try {
      await purgeUserData(userId)
      const empty = {
        ...EMPTY_SNAPSHOT,
        tracks: new Map(),
        playlists: new Map(),
        playlistEntries: new Map(),
        lyricSync: new Map(),
      }
      await applyRef.current(empty)
      baseRef.current = snapshotOf(dataRef.current)
      setSeeded(true)
      setCloudSummary(null)
      setLastSync(new Date())
      setStatus('ok')
      setMessage('Todos os seus dados foram apagados.')
    } catch (e) {
      setStatus('error')
      setMessage(traduzErro(e))
    } finally {
      busyRef.current = false
    }
  }, [userId])

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
    signOut,
    syncNow,
    purgeAll,
  }
}