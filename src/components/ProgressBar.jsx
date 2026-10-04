import { memo, useEffect, useRef, useState } from 'react'
import { useProgress } from '../progress-context.js'
import { formatTime } from '../lib/format.js'

export const ProgressBar = memo(function ProgressBar({ track, playing, onSeek, onToggle, onOpen }) {
  const { elapsed, duration } = useProgress()
  const barRef = useRef(null)
  const [dragRatio, setDragRatio] = useState(null)
  const draggingRef = useRef(false)

  const progress = duration ? elapsed / duration : 0

  const getRatioFromEvent = (e) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragRatio(getRatioFromEvent(e))
  }

  const onPointerMove = (e) => {
    if (!draggingRef.current) return
    e.preventDefault()
    setDragRatio(getRatioFromEvent(e))
  }

  const onPointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const r = Math.min(0.999, getRatioFromEvent(e))
    setDragRatio(null)
    onSeek?.(r)
  }

  const shownProgress = dragRatio !== null ? dragRatio : progress || 0
  const shownTime = (dragRatio !== null ? dragRatio : progress) * (duration || 0)

  return (
    <div className="progress-bar" onClick={onOpen}>
      <span className="progress-time">{formatTime((dragRatio !== null ? dragRatio : progress) * (duration || 0))}</span>
      <div
        className={`progress-track ${dragRatio !== null ? 'dragging' : ''}`}
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="progress-fill" style={{ width: `${Math.round((dragRatio !== null ? dragRatio : progress) * 100)}%` }} />
      </div>
      <span className="progress-time">{formatTime(duration || 0)}</span>
    </div>
  )
})