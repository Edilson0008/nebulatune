import { memo, useEffect, useRef, useState } from 'react'
import { useProgress } from '../progress-context.js'
import { SPEEDS } from '../settings'
import { Cover } from './Cover.jsx'
import { Equalizer } from './equalizer.jsx'
import { PetFriend } from './pet.jsx'
import { NowParticles } from './visualizer.jsx'
import { useLyricsTranslation } from '../hooks/use-lyrics-translation.js'
import { coverPalette } from '../lib/cover.js'
import { cleanArtist, cleanTitle } from '../lib/filename.js'
import { fmtSleep, formatTime } from '../lib/format.js'

export const NowPlaying = memo(function NowPlaying({
  track,
  playing,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onClose,
  repeat,
  shuffle,
  onCycleRepeat,
  onToggleShuffle,
  lyrics,
  syncOffset = 0,
  onSync,
  onAlign,
  onSearchLyrics,
  onPickLyrics,
  eq,
  fav = false,
  onToggleFavorite,
  onOpenQueue,
  speed = 1,
  onSetSpeed,
  depth = '',
  onSetDepth,
  isOnline = false,
  sleepMode = null,
  sleepRemaining = null,
  onStartSleep,
  onCancelSleep,
  eqEnabled = false,
  eqPreset = 'flat',
  favPing = 0,
  trackId = null,
  soundOn = true,
  cheer = null,
  idleSinceRef = null,
  onPetAction = null,
  mood = 'neutral',
  userName = '',
}) {
  const barRef = useRef(null)
  const draggingRef = useRef(false)
  const activeRef = useRef(null)
  const depthMenuRef = useRef(null)
  const menuRef = useRef(null)
  const lyricsRef = useRef(null)
  const sleepMenuRef = useRef(null)
  const [dragRatio, setDragRatio] = useState(null)
  const [showEq, setShowEq] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [depthOpen, setDepthOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)
  const palette = coverPalette(track)

  const runSearch = (q) => {
    setSearching(true)
    Promise.resolve(onSearchLyrics?.(q)).then((list) => {
      const arr = Array.isArray(list) ? [...list] : []
      const ref = Number(duration) || 0
      arr.sort((x, y) => {
        const xs = x?.syncedLyrics ? 1 : 0
        const ys = y?.syncedLyrics ? 1 : 0
        if (xs !== ys) return ys - xs
        if (ref) {
          const xd = x?.duration ? Math.abs(x.duration - ref) : 1e9
          const yd = y?.duration ? Math.abs(y.duration - ref) : 1e9
          if (xd !== yd) return xd - yd
        }
        return 0
      })
      setResults(arr)
      setSearching(false)
    })
  }

  const openSearch = () => {
    const q = [cleanArtist(track.artist), cleanTitle(track.title)].filter(Boolean).join(' ')
    setQuery(q)
    setResults([])
    setSearchOpen(true)
    if (q) runSearch(q)
  }

  const pickResult = (item) => {
    onPickLyrics?.(item)
    setSearchOpen(false)
  }

  const lines = lyrics?.status === 'done' ? lyrics.lines : []
  const synced = !!lyrics?.synced
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const lyricTrans = useLyricsTranslation(lines)
  const lyricTime = elapsed - syncOffset
  let activeIndex = -1
  if (synced && lines.length) {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].time <= lyricTime + 0.25) activeIndex = i
      else break
    }
  }

  // O app segue a música ("rola sozinho") centrando a linha ativa. Assim que a
  // pessoa segura a rolagem para ler antes, o app PARA de puxar e respeita até
  // a próxima faixa — o componente remonta a cada troca de música, então o
  // acompanhamento volta sozinho num caso e no outro sem preservar estado.
  const seguindoRef = useRef(true)
  useEffect(() => {
    const box = lyricsRef.current
    if (!box) return undefined
    const parar = () => {
      seguindoRef.current = false
    }
    box.addEventListener('pointerdown', parar)
    box.addEventListener('wheel', parar, { passive: true })
    return () => {
      box.removeEventListener('pointerdown', parar)
      box.removeEventListener('wheel', parar)
    }
  }, [])

  useEffect(() => {
    const box = lyricsRef.current
    if (activeIndex < 0 || !box || !seguindoRef.current) return
    const line = box.querySelectorAll('.np-lyric')[activeIndex]
    if (!line) return
    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeIndex])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (sleepOpen && !isOnline) setSleepOpen(false)
        else if (menuOpen) setMenuOpen(false)
        else if (showEq) setShowEq(false)
        else if (depthOpen) setDepthOpen(false)
        else onClose()
        return
      }
      const tag = e.target?.tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') return
      if (e.key === ' ') {
        e.preventDefault()
        onToggle()
      }
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, onToggle, onNext, onPrev, searchOpen, menuOpen, showEq, depthOpen, sleepOpen, isOnline])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  useEffect(() => {
    if (searchOpen && lyricsRef.current) lyricsRef.current.scrollTop = 0
  }, [searchOpen])

  useEffect(() => {
    if (!depthOpen) return
    const onDown = (e) => {
      if (depthMenuRef.current && !depthMenuRef.current.contains(e.target)) setDepthOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [depthOpen])

  useEffect(() => {
    if (!sleepOpen) return
    const onDown = (e) => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target)) setSleepOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [sleepOpen])

  const pickDepth = (v) => {
    onSetDepth?.(v)
    setDepthOpen(false)
  }

  const ratioFromX = (clientX) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragRatio(ratioFromX(e.clientX))
  }
  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
    setDragRatio(ratioFromX(e.clientX))
  }
  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const r = Math.min(0.999, ratioFromX(e.clientX))
    setDragRatio(null)
    onSeek(r)
  }

  const shown = dragRatio !== null ? dragRatio : progress || 0
  const shownTime = dragRatio !== null ? dragRatio * (duration || 0) : elapsed

  return (
    <div
      className={`now-playing ${searchOpen ? 'searching' : ''}`}
      style={{ '--npc1': palette.c1, '--npc2': palette.c2, '--npc3': palette.c3 }}
    >
      <NowParticles />
      <div className="np-top">
        <button className="np-close" onClick={onClose} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="np-heading">Tocando agora</span>
        <div className="np-top-right">
          <button
            className={`np-close np-fav-btn ${fav ? 'on' : ''}`}
            onClick={() => onToggleFavorite?.(track.id)}
            aria-label={fav ? 'Desfavoritar' : 'Favoritar'}
            aria-pressed={fav}
            title={fav ? 'Desfavoritar' : 'Favoritar'}
            hidden={isOnline}
          >
            {fav ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          </button>
          {!isOnline && (
            <div className={`np-sleep-wrap ${sleepOpen ? 'open' : ''}`} ref={sleepMenuRef}>
              <button
                className={`np-close np-sleep-btn ${sleepMode ? 'on' : ''}`}
                onClick={() => setSleepOpen((v) => !v)}
                aria-label="Timer de desligar"
                aria-expanded={sleepOpen}
                title="Timer de desligar"
              >
                {sleepMode ? (
                  <span className="np-sleep-pill">
                    {sleepMode === 'end' ? 'fim' : fmtSleep(sleepRemaining)}
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19.6 16.7A8.5 8.5 0 0 0 7.3 4.4a7 7 0 1 1-1.7 13.7l1.2-.9a5.4 5.4 0 1 0 1.5-8.3 8.5 8.5 0 0 0 11.3 7.8z" />
                    <path d="M12 7v5l3 2" />
                    <path d="M12.3 3.2 13 1.5M9.4 4 8 2.9" />
                  </svg>
                )}
              </button>
              {sleepOpen && (
                <div className="np-sleep-menu" role="menu">
                  <span className="np-sleep-title">Parar depois de</span>
                  {[10, 20, 30, 60].map((m) => (
                    <button
                      key={m}
                      className={`np-sleep-opt ${sleepMode === String(m) ? 'active' : ''}`}
                      onClick={() => {
                        onStartSleep?.(m)
                        setSleepOpen(false)
                      }}
                    >
                      {m} minutos
                    </button>
                  ))}
                  <button
                    className={`np-sleep-opt ${sleepMode === 'end' ? 'active' : ''}`}
                    onClick={() => {
                      onStartSleep?.('end')
                      setSleepOpen(false)
                    }}
                  >
                    Final desta música
                  </button>
                  {sleepMode && (
                    <button
                      className="np-sleep-opt np-sleep-cancel"
                      onClick={() => {
                        onCancelSleep?.()
                        setSleepOpen(false)
                      }}
                    >
                      Cancelar timer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!isOnline && (
            <div className="np-menu-wrap" ref={menuRef}>
            <button
              className={`np-close np-menu-btn ${menuOpen ? 'active' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Menu"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <circle cx="12" cy="5" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
            {menuOpen && (
              <div className="np-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenQueue?.()
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 6h13M8 12h13M8 18h13" />
                    <path d="M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                  Fila de reprodução
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowEq(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                    <path d="M1 14h6M9 8h6M17 16h6" />
                  </svg>
                  Equalizador
                </button>
              </div>
            )}
          </div>
          )}
          {!isOnline && (
            <button
              className={`np-close np-eq-btn ${showEq ? 'active' : ''} ${eq?.settings?.enabled ? 'eq-on' : ''}`}
              onClick={() => setShowEq((v) => !v)}
              aria-label="Equalizador"
              aria-pressed={showEq}
              title={eq?.settings?.enabled ? 'Equalizador ativado' : 'Equalizador'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                <path d="M1 14h6M9 8h6M17 16h6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showEq && (
        <div className="np-eq-sheet">
          <div className="np-eq-sheet-head">
            <button className="np-eq-sheet-close" onClick={() => setShowEq(false)} aria-label="Fechar equalizador">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="np-eq-sheet-scroll">
            <Equalizer eq={eq} />
          </div>
        </div>
      )}

      <div className="np-main">
        <div className="np-pet">
          <PetFriend
            size={42}
            playing={!!playing}
            eqEnabled={eqEnabled}
            eqPreset={eqPreset}
            favPing={favPing}
            shuffle={shuffle}
            trackId={trackId || track?.id || null}
            sleepMode={sleepMode}
            sleepRemaining={sleepRemaining}
            soundOn={soundOn}
            cheer={cheer}
            idleSinceRef={idleSinceRef}
            onPetAction={onPetAction}
            mood={mood}
            userName={userName}
          />
        </div>
        <div className="np-cover">
          <Cover colors={track.cover} image={track.coverUrl} size="min(56vw, 260px)" radius={22} />
        </div>

        <div className="np-info">
          <h2 className="np-title">{track.title}</h2>
          <p className="np-artist">{track.artist}</p>
          {track.album && <p className="np-album">{track.album}</p>}
          {!isOnline && <p className="np-source">📁 Meus Arquivos</p>}
        </div>

        <div className="np-timeline">
          <span className="np-time">{formatTime(shownTime)}</span>
          <div
            className={`np-bar ${dragRatio !== null ? 'dragging' : ''}`}
            ref={barRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="np-bar-fill" style={{ width: `${shown * 100}%` }} />
            <div className="np-bar-thumb" style={{ left: `${shown * 100}%` }} />
          </div>
          <span className="np-time">{formatTime(duration)}</span>
        </div>

        {SPEEDS.length > 0 && (
          <div className="np-speed">
            {SPEEDS.map((v) => (
              <button
                key={v}
                className={speed === v ? 'active' : ''}
                onClick={() => onSetSpeed?.(v)}
                title={`Velocidade ${v === 1 ? 'normal' : v + 'x'}`}
              >
                {v === 1 ? '1x' : `${v}x`}
              </button>
            ))}
          </div>
        )}

        <div className="np-controls">
          <div className="np-controls-side">
            {!isOnline && (
              <button
                className={`np-toggle ${shuffle ? 'on' : ''}`}
                onClick={onToggleShuffle}
                aria-label="Aleatório"
                aria-pressed={shuffle}
                title="Aleatório"
              >
                <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
              </button>
            )}
            <button className="np-btn" onClick={onPrev} aria-label="Anterior" disabled={isOnline}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
          </div>
          <button className={`np-play ${playing ? 'playing' : ''}`} onClick={onToggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <div className="np-controls-side np-controls-right">
            <button className="np-btn" onClick={onNext} aria-label="Próxima" disabled={isOnline}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.86L12.03 12 8 14.86V9.14zM16 6h2v12h-2z" /></svg>
            </button>
            {!isOnline && (
              <button
                className={`np-toggle ${repeat ? 'on' : ''}`}
                onClick={onCycleRepeat}
                aria-label="Repetir"
                title={repeat === 0 ? 'Repetir: desligado' : repeat === 1 ? 'Repetir: tudo' : 'Repetir: uma'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
                {repeat === 2 && <span className="np-badge">1</span>}
              </button>
            )}
            {!isOnline && (
              <div className="np-depth-wrap">
              <button
                className={`np-toggle np-depth-btn ${depth ? 'on' : ''}`}
                onClick={() => setDepthOpen((v) => !v)}
                aria-label="Profundidade de áudio"
                aria-pressed={!!depth}
                title={depth === '8d' ? 'Áudio 8D ativado' : depth === '3d' ? 'Áudio 3D ativado' : 'Profundidade de áudio'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
                  <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </button>
              {depthOpen && (
                <div className="np-depth-menu" ref={depthMenuRef}>
                  <span className="np-depth-title">Profundidade</span>
                  <button className={`np-depth-opt ${depth === '3d' ? 'active' : ''}`} onClick={() => pickDepth('3d')}>
                    🎧 Áudio 3D
                  </button>
                  <button className={`np-depth-opt ${depth === '8d' ? 'active' : ''}`} onClick={() => pickDepth('8d')}>
                    🌀 Áudio 8D
                  </button>
                  <button className={`np-depth-opt ${depth === '' ? 'active' : ''}`} onClick={() => pickDepth('')}>
                    Desativar
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {synced && lines.length > 0 && !searchOpen && (
        <div className="np-sync">
          <div className="np-sync-row">
            <span className="np-sync-label">Sincronia da letra</span>
            <span className={`np-sync-value ${syncOffset ? 'on' : ''}`}>
              {syncOffset ? `${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(1).replace('.', ',')}s` : '0,0s'}
            </span>
          </div>
          <div className="np-sync-buttons">
            <button onClick={() => onSync?.(-5)} title="Adiantar 5s">
              −5s
            </button>
            <button onClick={() => onSync?.(-1)} title="Adiantar 1s">
              −1s
            </button>
            <button onClick={() => onSync?.(-0.5)} title="Adiantar 0,5s">
              −0,5s
            </button>
            <button onClick={() => onSync?.(0.5)} title="Atrasar 0,5s">
              +0,5s
            </button>
            <button onClick={() => onSync?.(1)} title="Atrasar 1s">
              +1s
            </button>
            <button onClick={() => onSync?.(5)} title="Atrasar 5s">
              +5s
            </button>
          </div>
          <div className="np-sync-actions">
            <button className="np-sync-align" onClick={onAlign} title="Toca até o cantor começar esta linha e toca aqui para alinhar">
              Alinhar pelo 1º verso
            </button>
            {!!syncOffset && (
              <button className="np-sync-reset" onClick={() => onSync?.(-syncOffset)} title="Zerar ajuste">
                zerar
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`np-lyrics ${searchOpen ? 'searching' : ''}`} ref={lyricsRef}>
        {searchOpen ? (
          <div className="np-search">
            <form
              className="np-search-form"
              onSubmit={(e) => {
                e.preventDefault()
                runSearch(query)
              }}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Artista ou nome da música"
                autoFocus
              />
              <button type="submit">Buscar</button>
            </form>

            {searching && <p className="np-lyrics-msg">Buscando…</p>}
            {!searching && results.length === 0 && (
              <p className="np-lyrics-msg">Nenhum resultado. Tente outro nome.</p>
            )}

            <div className="np-search-results">
              {results.map((r) => (
                <button key={r.id} className="np-search-item" onClick={() => pickResult(r)}>
                  <span className="np-search-main">
                    <span className="np-search-title">{r.trackName || '—'}</span>
                    <span className="np-search-artist">
                      {r.artistName}
                      {r.albumName ? ` · ${r.albumName}` : ''}
                    </span>
                  </span>
                  <span className="np-search-meta">
                    {r.syncedLyrics && <span className="np-search-badge">sincronizada</span>}
                    {r.duration ? <span className="np-search-dur">{formatTime(r.duration)}</span> : null}
                  </span>
                </button>
              ))}
            </div>

            <button className="np-search-close" onClick={() => setSearchOpen(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            {lyrics?.status === 'done' && lyrics.source && (
              <div className="np-lyrics-source">
                <span className="np-lyrics-source-text">
                  Letra: {lyrics.source.artistName} — {lyrics.source.trackName}
                </span>
                <button onClick={openSearch}>trocar</button>
              </div>
            )}

            {(!lyrics || lyrics.status === 'loading') && (
              <p className="np-lyrics-msg">Buscando letra…</p>
            )}

            {lyrics?.status === 'notfound' && (
              <div className="np-lyrics-msg">
                <p>Letra não encontrada para esta música.</p>
                <button className="btn-search-lyrics" onClick={openSearch}>
                  Buscar letra manualmente
                </button>
              </div>
            )}

            {lyrics?.status === 'done' && lyrics.instrumental && (
              <div className="np-lyrics-msg">
                <p>🎹 Faixa instrumental</p>
                <button className="btn-search-lyrics" onClick={openSearch}>
                  Buscar letra manualmente
                </button>
              </div>
            )}

            {lyrics?.status === 'done' && lines.length > 0 && (
              <>
                <div className="np-lyrics-bar">
                  <button
                    className={`np-tr-btn ${lyricTrans.enabled ? 'on' : ''}`}
                    onClick={() => lyricTrans.setEnabled((v) => !v)}
                    title={
                      lyricTrans.enabled
                        ? 'Desativar tradução para o português'
                        : 'Traduzir a letra para o português'
                    }
                  >
                    {lyricTrans.enabled ? (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3.5 6h5M6 4v2m-2.5 9c1.2-2 3.4-2.5 5-1.7m-2.5 5.5c1-2.2 3.2-3.4 6-3.7" />
                        <path d="m10 5 4 14M10.8 12h3M18 5c.7 1.4 1.8 2 3 2.2m-3 0c.8 1 2 1.5 3 1.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3.5 6h5M6 4v2m-2.5 9c1.2-2 3.4-2.5 5-1.7m-2.5 5.5c1-2.2 3.2-3.4 6-3.7" />
                        <path d="m10 5 4 14M10.8 12h3M18 5c.7 1.4 1.8 2 3 2.2m-3 0c.8 1 2 1.5 3 1.6" />
                      </svg>
                    )}
                    {lyricTrans.enabled ? 'Mostrar original' : 'Traduzir letra'}
                  </button>
                  {lyricTrans.pending > 0 && (
                    <span className="np-tr-status">Traduzindo… ({lyricTrans.pending})</span>
                  )}
                </div>
                <div className="np-lyrics-lines">
                  {lines.map((line, i) => {
                    const seekable = synced && line.time != null
                    return (
                      <p
                        key={i}
                        ref={i === activeIndex ? activeRef : null}
                        className={`np-lyric ${i === activeIndex ? 'active' : ''} ${seekable ? 'seekable' : ''}`}
                        onClick={
                          seekable
                            ? () => onSeek(Math.min(0.999, line.time / (duration || 1)))
                            : undefined
                        }
                      >
                        <span className="np-lyric-main">{line.text || '\u00A0'}</span>
                        {lyricTrans.enabled && lyricTrans.map[line.text] && (
                          <span className="np-lyric-tr">{lyricTrans.map[line.text]}</span>
                        )}
                      </p>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
})
