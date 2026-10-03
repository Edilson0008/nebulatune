import { memo, useEffect, useRef, useState } from 'react'
import { useProgress } from '../progress-context.js'
import { Cover } from './Cover.jsx'
import { formatTime } from '../lib/format.js'

export const QueueSheet = memo(function QueueSheet({ track, queue, onPlayItem, onRemoveItem, onMoveItem, onClear, onReorder, onClose }) {
  const { elapsed, duration } = useProgress()
  const progress = duration ? elapsed / duration : 0
  const listRef = useRef(null)
  const [dragSession, setDragSession] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  useEffect(() => {
    if (!dragSession) return undefined
    const onMove = (e) => {
      const d = dragSession
      if (!d.engaged) {
        const dx = Math.abs(e.clientX - d.x)
        const dy = Math.abs(e.clientY - d.y)
        if (dx + dy < 10) return
        d.engaged = true
      }
      try {
        e.preventDefault()
      } catch {}
      const box = listRef.current
      if (!box) return
      const rows = box.querySelectorAll('.queue-row')
      if (!rows.length) return
      let target = d.from
      const y = e.clientY
      rows.forEach((el) => {
        const r = el.getBoundingClientRect()
        const idx = Number(el.dataset.idx)
        if (Number.isFinite(idx) && y >= r.top + r.height / 2) target = idx
      })
      if (target !== d.lastTarget) d.lastTarget = target
      setDragSession({ ...d, lastTarget: target })
    }
    const onUp = () => {
      const d = dragSession
      if (d && d.engaged && d.lastTarget != null && d.lastTarget !== d.from) {
        onReorder?.(d.from, d.lastTarget)
      }
      setDragSession(null)
    }
    const onCancel = () => setDragSession(null)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [dragSession, onReorder])

  const rowPointerDown = (e, i) => {
    if (e.target.closest('button')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    setDragSession({ from: i, x: e.clientX, y: e.clientY, engaged: false, lastTarget: i })
  }

  return (
    <div className="queue-sheet">
      <div className="queue-bar">
        <button className="queue-close" onClick={onClose} aria-label="Fechar fila">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="queue-title">Fila de reprodução</div>
      </div>

      <div className="queue-scroll">
        <div className="queue-now-head">
          <h3>Tocando agora</h3>
          <span className="queue-now-time">
            {formatTime(elapsed)} / {formatTime(duration)}
          </span>
        </div>
        <button className="queue-row now" onClick={onClose}>
          <Cover colors={track.cover} image={track.coverUrl} size={44} radius={9} />
          <div className="queue-meta">
            <span className="queue-row-title">{track.title}</span>
            <span className="queue-row-artist">{track.artist}</span>
          </div>
          <span className="queue-now-eq"><i /><i /><i /></span>
        </button>
        <div className="queue-progress">
          <div className="queue-progress-inner" style={{ width: `${Math.round((progress || 0) * 100)}%` }} />
        </div>

        <div className="queue-list-head">
          <h3>A seguir ({queue.length})</h3>
          {queue.length > 0 && (
            <button className="queue-clear" onClick={onClear}>Limpar</button>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="queue-empty">
            Nada na fila. As próximas músicas seguem a ordem da biblioteca. Toque em uma
            música da sua lista para ela entrar na fila automaticamente.
          </p>
        ) : (
          <div className="queue-list" ref={listRef}>
            {queue.map((t, i) => (
              <div
                className={`queue-row ${dragSession && dragSession.engaged && dragSession.from === i ? 'dragging' : ''} ${dragSession && dragSession.engaged && dragSession.lastTarget === i && dragSession.lastTarget !== dragSession.from ? 'drag-over' : ''}`}
                key={t.id}
                data-idx={i}
                onPointerDown={(e) => rowPointerDown(e, i)}
              >
                <button className="queue-row-main" onClick={() => onPlayItem(t.id)}>
                  <span className="queue-num">{i + 1}</span>
                  <Cover colors={t.cover} image={t.coverUrl} size={40} radius={8} />
                  <div className="queue-meta">
                    <span className="queue-row-title">{t.title}</span>
                    <span className="queue-row-artist">{t.artist}</span>
                  </div>
                  <span className="queue-dur">{t.duration ? formatTime(t.duration) : '--:--'}</span>
                </button>
                <div className="queue-actions">
                  <button className="icon-btn" onClick={() => onMoveItem(t.id, -1)} aria-label="Subir na fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 15 6-6 6 6" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => onMoveItem(t.id, 1)} aria-label="Descer na fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <button className="icon-btn" onClick={() => onRemoveItem(t.id)} aria-label="Remover da fila">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
