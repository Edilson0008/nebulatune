import { memo, useEffect, useState } from 'react'
import { featuredCovers } from '../data/tracks'
import { resolveAudiusStream, searchAudiusTracks, topTracks } from '../online'
import { useProgress } from '../progress-context.js'
import { Cover } from './Cover.jsx'
import { formatTime, hashStr } from '../lib/format.js'

const ONLINE_GENRES = ['Pop', 'Rock', 'Sertanejo', 'MPB', 'Funk', 'Rap', 'Pagode', 'Eletrônica', 'Bossa Nova', 'Forró']

export const OnlineView = memo(function OnlineView({ onlineTrack, onlinePlaying, onlineMode, onPlay, onToggle, onStop, pendingQuery, onConsumedQuery }) {
  const { elapsed, duration } = useProgress()
  const onlineProgress = duration ? elapsed * (1 / duration) : 0
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

  useEffect(() => {
    let cancelled = false
    topTracks().then((t) => {
      if (!cancelled) setTop(t)
      setTopLoading(false)
    }).catch(() => { if (!cancelled) setTopLoading(false) })
    return () => { cancelled = true }
  }, [])

  const onQueryChange = (value) => {
    setQ(value)
    if (!value.trim()) {
      setResults([])
      setSearching(false)
      setError(false)
      return
    }
    setSearching(true)
    setError(false)
    // Sem esta flag, uma busca antiga que já está em voo sobrescreve o
    // resultado da busca nova (e o `clearTimeout` não cancela o que já saiu).
    let cancelled = false
    const id = setTimeout(() => {
      setSearching(true)
      searchAudiusTracks(value.trim()).then((list) => {
        if (!cancelled) {
          setResults(list)
          setSearching(false)
        }
      }).catch(() => {
        if (!cancelled) {
          setError(true)
          setSearching(false)
        }
      })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }

  const playItem = (item, preview) => {
    if (!item) return
    setLoadingId(`${preview ? 'p' : 'f'}:${item.id}`)
    if (preview) {
      setLoadingId(`p:${item.id}`)
      if (item.previewUrl) {
        setLoadingId(`p:${item.id}`)
        onPlay({
          id: `preview:${item.id}`,
          title: item.title,
          artist: item.artist,
          streamUrl: item.previewUrl,
          cover: item.cover,
          duration: item.duration || 0,
          preview: true,
        })
        return
      }
    }
    setLoadingId(`f:${item.id}`)
    resolveAudiusStream(item.id).then((r) => {
      if (!r || !r.url) throw new Error('Sem stream')
      onPlay({
        id: `audius:${item.id}`,
        title: item.title,
        artist: item.artist,
        streamUrl: r.url,
        cover: item.cover,
        duration: item.duration || r.duration || 0,
      })
    }).catch((e) => {
      console.error(e)
    }).finally(() => { setLoadingId(null) })
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

  const cover = (it, sz) => <Cover colors={it.cover} image={it.coverUrl} size={sz} radius={10} />
  const activeId = onlineTrack?.id

  return (
    <section className="view online-view">
      <div className="online-head">
        <h1 className="greeting">Online</h1>
        <div className="online-search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="online-search-input"
            placeholder="Buscar músicas, artistas, álbuns…"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {searching && <span className="search-spinner" />}
        </div>
      </div>

      {topLoading ? (
        <div className="empty-state"><div className="empty-cover spin"><svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg></div></div>
      ) : q.trim() ? (
        <>
          <h2 className="section-title">Resultados</h2>
          {results.length ? (
            <div className="online-results">
              {results.map((it) => (
                <button key={it.id} className="online-row" onClick={() => rowClick(it)}>
                  <Cover colors={it.cover} image={it.coverUrl} size={44} radius={9} />
                  <div className="om-meta">
                    <span className="om-title">{it.title}</span>
                    <span className="om-artist">{it.artist}</span>
                  </div>
                  <span className="om-dur">{it.duration ? formatTime(it.duration) : '--:--'}</span>
                  <button className="icon-btn om-play" onClick={(e) => { e.stopPropagation(); previewClick(it) }} aria-label={activeId === it.id && onlineMode === 'preview' ? 'Parar prévia' : 'Prévia'}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">Nenhum resultado para “{q}”.</p>
          )}
        </>
      ) : top.length > 0 ? (
        <>
          <h2 className="section-title">Top global</h2>
          <div className="online-results">
            {top.map((it) => (
              <button key={it.id} className="online-row" onClick={() => rowClick(it)}>
                <Cover colors={it.cover} image={it.coverUrl} size={44} radius={9} />
                <div className="om-meta">
                  <span className="om-title">{it.title}</span>
                  <span className="om-artist">{it.artist}</span>
                </div>
                <span className="om-dur">{it.duration ? formatTime(it.duration) : '--:--'}</span>
                <button className="icon-btn om-play" onClick={(e) => { e.stopPropagation(); previewClick(it) }} aria-label={activeId === it.id && onlineMode === 'preview' ? 'Parar prévia' : 'Prévia'}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state"><div className="empty-cover"><svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div><h2>Nada aqui ainda</h2><p>Digite algo acima para buscar.</p></div>
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
            {formatTime(onlineElapsed)} <b>/</b> {formatTime(onlineDuration || onlineTrack.playDuration || 0)}
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
})
