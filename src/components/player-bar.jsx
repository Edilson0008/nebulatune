import { memo, useRef } from 'react'
import { useProgress } from '../progress-context.js'
import { Cover } from './Cover.jsx'
import { fmtSleep, formatTime } from '../lib/format.js'

export const PlayerBar = memo(function PlayerBar({ track, playing, onToggle, onNext, onPrev, onSeek, onOpen, fav = false, onToggleFavorite, onOpenQueue, isOnline = false, sleepMode = null, sleepRemaining = null, onCancelSleep, shuffle = false, repeat = 0, onToggleShuffle = null, onCycleRepeat = null }) {
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const pct = Math.round((progress || 0) * 100)
  const barRef = useRef(null)
  const draggingRef = useRef(false)

  const ratioFromEvent = (e) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onBarDown = (e) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onBarMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
  }
  const onBarUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    onSeek(ratioFromEvent(e))
  }

  return (
    <footer className="player">
      <div className="player-track">
        <button className="player-open" onClick={onOpen} aria-label="Abrir tela de reprodução">
          <Cover colors={track.cover} image={track.coverUrl} size={48} radius={9} />
          <div className="player-meta">
            <span className="player-title">{track.title}</span>
            <span className="player-artist">{track.artist}</span>
          </div>
          <svg className="player-open-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m18 15-6-6-6 6" />
          </svg>
          <button className="icon-btn player-cast" aria-label="Transmitir" title="Transmitir para outro aparelho" hidden={isOnline}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 16.1A5 5 0 0 1 5.9 20" />
              <path d="M2 12.05A9 9 0 0 1 9.95 20" />
              <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
              <circle cx="2" cy="20" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </button>
        <button
          className={`icon-btn ${fav ? 'fav-on' : ''}`}
          aria-label={fav ? 'Desfavoritar' : 'Curtir'}
          aria-pressed={fav}
          onClick={onToggleFavorite}
          hidden={isOnline}
        >
          {fav ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )}
        </button>
      </div>

      <div className="player-controls">
        <div className="controls-row">
          {!isOnline && (
            <button
              className={`icon-btn ${shuffle ? 'ctl-on' : ''}`}
              aria-label="Aleatório"
              title="Modo aleatório"
              aria-pressed={shuffle}
              onClick={onToggleShuffle}
            >
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
            </button>
          )}
          <button className="icon-btn" onClick={onPrev} aria-label="Anterior" disabled={isOnline}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>
          <button className={`play-btn ${playing ? 'paused' : ''}`} onClick={onToggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button className="icon-btn" onClick={onNext} aria-label="Próxima" disabled={isOnline}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.86L12.03 12 8 14.86V9.14zM16 6h2v12h-2z" /></svg>
          </button>
          {!isOnline && (
            <button
              className={`icon-btn ${repeat > 0 ? 'ctl-on' : ''}`}
              aria-label="Repetir"
              title={`Repetir: ${repeat === 1 ? 'uma música' : repeat === 2 ? 'tudo' : 'desligado'}`}
              aria-pressed={repeat > 0}
              onClick={onCycleRepeat}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
              {repeat === 1 && <span className="rep-one-dot" />}
            </button>
          )}
        </div>
        <div className="progress-row">
          <span className="time">{formatTime(elapsed)}</span>
          <div
            className="progress"
            ref={barRef}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerCancel={onBarUp}
          >
            <div className="progress-inner" style={{ width: `${pct}%` }} />
          </div>
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        {sleepMode && onCancelSleep && (
          <button
            className="icon-btn np-sleep-mini"
            aria-label="Tirar o timer de desligar"
            title={`Timer de desligar ativo${sleepMode === 'end' ? '' : ` (${fmtSleep(sleepRemaining)})`} — toque para cancelar`}
            onClick={onCancelSleep}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19.6 16.7A8.5 8.5 0 0 0 7.3 4.4a7 7 0 1 1-1.7 13.7l1.2-.9a5.4 5.4 0 1 0 1.5-8.3 8.5 8.5 0 0 0 11.3 7.8z" />
              <path d="M12 7v5l3 2" />
              <path d="M12.3 3.2 13 1.5M9.4 4 8 2.9" />
            </svg>
            {sleepMode !== 'end' && sleepRemaining != null && (
              <span className="np-sleep-mini-time">{fmtSleep(sleepRemaining)}</span>
            )}
          </button>
        )}
        <button className="icon-btn" aria-label="Fila" title="Fila" onClick={onOpenQueue} hidden={isOnline}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </button>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
        <div className="progress progress-slim">
          <div className="progress-inner" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </footer>
  )
})
