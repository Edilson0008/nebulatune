import { useEffect, useState } from 'react'
import { featuredCovers } from '../data/tracks'
import { resolveAudiusStream, searchAudiusTracks, topTracks } from '../online'
import { useProgress } from '../progress-context.js'
import { Cover } from './Cover.jsx'
import { formatTime, hashStr } from '../lib/format.js'

const ONLINE_GENRES = ['Pop', 'Rock', 'Sertanejo', 'MPB', 'Funk', 'Rap', 'Pagode', 'Eletrônica', 'Bossa Nova', 'Forró']

export function OnlineView({ onlineTrack, onlinePlaying, onlineMode, onPlay, onToggle, onStop, pendingQuery, onConsumedQuery }) {
  const { elapsed, duration } = useProgress()
  const onlineProgress = duration ? elapsed / duration : 0
  const onlineElapsed = elapsed
  const onlineDuration = duration
  const [q, setQ] = useState(() => pendingQuery || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [resolveError, setResolveError] = useState(false)
  const [top, setTop] = useState([])
  const [topLoading, setTopLoading] = useState(true)
  const activeId = onlineTrack?.id
  const trimmed = q.trim()

  useEffect(() => {
    if (pendingQuery) onConsumedQuery?.()
  }, [pendingQuery, onConsumedQuery])

  useEffect(() => {
    let cancelled = false
    topTracks()
      .then((list) => {
        if (!cancelled) setTop(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTopLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const value = trimmed
    if (!value) return undefined
    const id = setTimeout(() => {
      searchAudiusTracks(value)
        .then((list) => {
          setResults(list)
          setSearching(false)
        })
        .catch(() => {
          setError(true)
          setSearching(false)
        })
    }, 450)
    return () => clearTimeout(id)
  }, [trimmed])

  const onQueryChange = (value) => {
    setQ(value)
    if (!value.trim()) {
      setResults([])
      setSearching(false)
      setError(false)
    } else {
      setSearching(true)
      setError(false)
    }
  }

  const playItem = (item, preview) => {
    if (!item) return
    setLoadingId(`${item.id}:${preview ? 'p' : 'f'}`)
    setResolveError(false)
    const direct = item.streamUrl || item.stream
    const resolve = direct ? Promise.resolve({ url: direct }) : resolveAudiusStream(item.audiusId)
    resolve
      .then((r) => {
        onPlay(
          {
            ...item,
            stream: r.url,
            playDuration: item.duration || r.playDuration || 0,
          },
          { preview },
        )
      })
      .catch(() => {
        setResolveError(true)
        setTimeout(() => setResolveError(false), 4000)
      })
      .finally(() => setLoadingId(null))
  }

  const rowClick = (item) => {
    if (activeId === item.id && onlineMode === 'full') {
      onToggle()
      return
    }
    playItem(item, false)
  }

  const previewClick = (item) => {
    if (activeId === item.id && onlineMode === 'preview') {
      onToggle()
      return
    }
    playItem(item, true)
  }

  const cover = (item, size) => (
    <Cover
      colors={featuredCovers[hashStr(item.id) % featuredCovers.length]}
      image={item.coverUrl}
      size={size}
      radius={8}
    />
  )

  return (
    <section className="view online-view">
      <div className="lib-head">
        <h1 className="greeting">Músicas online</h1>
      </div>
      <p className="online-sub">
        Músicas completas e gratuitas via Audius: artistas independentes, eletrônica, indie,
        hip-hop e remixes. A faixa toca inteira, sem limite de tempo.
      </p>

      <div className="online-search">
        <svg className="online-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          className="online-search-input"
          placeholder={'Pesquisar música… ex.: "ODESZA" ou "lo-fi"'}
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {searching && <span className="online-spin" aria-label="Buscando" />}
      </div>

      {!trimmed && (
        <>
          <div className="online-chips">
            {ONLINE_GENRES.map((g) => (
              <button key={g} className="chip" onClick={() => onQueryChange(g)}>{g}</button>
            ))}
          </div>

          <h2 className="section-title">Em alta agora</h2>
          {topLoading ? (
            <div className="empty-state">
              <div className="empty-cover spin">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                </svg>
              </div>
              <p>Carregando sugestões…</p>
            </div>
          ) : top.length ? (
            <div className="online-carousel">
              {top.map((item) => (
                <div className="online-card-wrap" key={item.id}>
                  <button className="online-card" onClick={() => rowClick(item)}>
                    <span className="online-card-cover">{cover(item, 132)}</span>
                    <span className="online-card-title">{item.title}</span>
                    <span className="online-card-artist">{item.artist}</span>
                  </button>
                  <button
                    className="online-card-preview"
                    onClick={() => previewClick(item)}
                    title="Ouvir prévia de 30s"
                    aria-label="Ouvir prévia de 30 segundos"
                  >
                    30s
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Não foi possível carregar as sugestões agora.</p>
          )}
        </>
      )}

      {trimmed && (
        <>
          {searching && !results.length ? (
            <div className="empty-state">
              <div className="empty-cover spin">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                </svg>
              </div>
              <p>Buscando…</p>
            </div>
          ) : error ? (
            <p className="empty">Não foi possível buscar agora. Verifique sua conexão e tente de novo.</p>
          ) : results.length ? (
            <div className="section">
              <h2 className="section-title">Resultados para “{trimmed}”</h2>
              <div className="online-list">
                {results.map((item, i) => {
                  const active = activeId === item.id
                  const activeFull = active && onlineMode === 'full'
                  const activePreview = active && onlineMode === 'preview'
                  const loadingFull = loadingId === `${item.id}:f`
                  const loadingPreview = loadingId === `${item.id}:p`
                  return (
                    <div className={`track-row ${active ? 'active' : ''}`} key={item.id}>
                      <span className="track-num">{active ? '♪' : i + 1}</span>
                      {cover(item, 40)}
                      <div className="track-main">
                        <span className="track-title">{item.title}</span>
                        <span className="track-artist">{item.artist}</span>
                      </div>
                      <span className="track-album">{item.album}</span>
                      <span className="online-badge audius">Audius</span>
                      <button
                        className={`row-preview ${activePreview ? 'active' : ''}`}
                        onClick={() => previewClick(item)}
                        title="Ouvir prévia de 30s"
                        aria-label={
                          loadingPreview ? 'Carregando prévia' : activePreview && onlinePlaying ? 'Pausar prévia' : 'Ouvir prévia de 30 segundos'
                        }
                      >
                        {loadingPreview ? (
                          <span className="online-spin" style={{ width: 12, height: 12 }} />
                        ) : activePreview && onlinePlaying ? (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                        ) : (
                          '30s'
                        )}
                      </button>
                      <button
                        className="row-play"
                        onClick={() => rowClick(item)}
                        aria-label={
                          loadingFull
                            ? 'Carregando'
                            : activeFull && onlinePlaying
                              ? 'Pausar'
                              : 'Tocar música completa'
                        }
                      >
                        {loadingFull ? (
                          <span className="online-spin" style={{ width: 14, height: 14 }} />
                        ) : activeFull && onlinePlaying ? (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
              {resolveError && (
                <p className="online-note warn">
                  Não consegui carregar o áudio desta faixa agora. Tente outra ou toque de novo.
                </p>
              )}
              <p className="online-note">
                Faixas completas da Audius, sem limite de tempo. Catálogo de artistas
                independentes — se a música que procura não aparecer, tente o nome do artista ou
                a banda/estilo.
              </p>
            </div>
          ) : (
            <p className="empty">Nada encontrado para “{trimmed}”. Tente outra grafia ou artista.</p>
          )}
        </>
      )}

      {onlineTrack && (
        <div className="online-mini">
          {cover(onlineTrack, 44)}
          <div className="om-meta">
            <span className="om-title">{onlineTrack.title}</span>
            <span className="om-artist">{onlineTrack.artist}</span>
            <div className="om-progress">
              <div className="om-progress-inner" style={{ width: `${Math.round(onlineProgress * 100)}%` }} />
            </div>
          </div>
          <span className="om-time">
            {formatTime(onlineElapsed)} <b>/ {formatTime(onlineDuration || onlineTrack.playDuration || 0)}</b>
          </span>
          <button className="om-play" onClick={onToggle} aria-label={onlinePlaying ? 'Pausar' : 'Tocar'}>
            {onlinePlaying ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button className="om-stop" onClick={onStop} aria-label="Parar música">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </section>
  )
}
