import { memo, useRef, useState } from 'react'
import { useProgress } from '../progress-context.js'
import { formatTime } from '../lib/format.js'

// Barra de tempo isolada em componente proprio para o Now Playing nao ter
// que se re-renderizar inteiro a cada tique de progresso.
//
// Usa as classes .np-time / .np-bar / .np-bar-fill / .np-bar-thumb que ja
// existem em App.css. Antes este componente usava .progress-time /
// .progress-track / .progress-fill, que nao existem em lugar nenhum do CSS —
// por isso a barra aparecia sem estilo, sem trilho e sem alinhamento com o
// tempo nas pontas.
export const ProgressBar = memo(function ProgressBar({ onSeek }) {
  const { elapsed, duration } = useProgress()
  const barRef = useRef(null)
  const [dragRatio, setDragRatio] = useState(null)
  const draggingRef = useRef(false)

  const progress = duration ? elapsed / duration : 0

  const ratioFromEvent = (e) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (!rect.width) return 0
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragRatio(ratioFromEvent(e))
  }

  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
    setDragRatio(ratioFromEvent(e))
  }

  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const r = Math.min(0.999, ratioFromEvent(e))
    setDragRatio(null)
    onSeek?.(r)
  }

  // Durante o arrasto o valor segue o dedo, nao o player.
  const shown = dragRatio !== null ? dragRatio : progress || 0
  const shownTime = (dragRatio !== null ? dragRatio : progress) * (duration || 0)
  const pct = `${Math.round(shown * 100)}%`

  return (
    <>
      <span className="np-time">{formatTime(shownTime)}</span>
      <div
        className={`np-bar ${dragRatio !== null ? 'dragging' : ''}`}
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* scaleX, nunca width/left: mexer em width obriga o navegador a
            refazer o layout a cada tique. Ver comentario em App.css. */}
        <div className="np-bar-fill" style={{ transform: `scaleX(${shown})` }} />
        <div className="np-bar-thumb" style={{ left: pct }} />
      </div>
      <span className="np-time">{formatTime(duration)}</span>
    </>
  )
})