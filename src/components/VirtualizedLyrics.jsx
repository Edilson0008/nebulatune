import { memo, useEffect, useRef, useState } from 'react'
import { useProgress } from '../progress-context.js'
import { formatTime } from '../lib/format.js'

export const VirtualizedLyrics = memo(function VirtualizedLyrics({
  lyrics,
  synced,
  elapsed,
  duration,
  syncOffset,
  onSeek,
  lyricTrans,
  searchOpen,
}) {
  const lyricsRef = useRef(null)
  const lines = lyrics?.status === 'done' ? lyrics.lines : []
  const syncedLines = synced && lines.length > 0

  const activeIndexRef = useRef(-1)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })

  // Only compute active index when needed
  const activeIndex = syncedLines ? lines.findIndex(
    (line, i) => line.time != null && line.time <= (elapsed - syncOffset) + 0.25
  ) : -1

  // Scroll to active line
  useEffect(() => {
    if (activeIndex < 0) return
    const box = document.querySelector('.np-lyrics')
    const line = document.querySelectorAll('.np-lyric')[activeIndex]
    if (!line) return
    const top = line.offsetTop - line.parentElement.clientHeight / 2 + line.clientHeight / 2
    line.parentElement.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
  }, [activeIndex])

  // Virtualize: only render visible lines + buffer
  const ITEM_HEIGHT = 48 // approximate line height
  const CONTAINER_HEIGHT = 400 // approximate container height
  const BUFFER = 5

  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const container = document.querySelector('.np-lyrics')
    if (!container) return
    const onScroll = () => setScrollTop(container.scrollTop)
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER)
  const end = Math.min(lines.length, start + Math.ceil(CONTAINER_HEIGHT / ITEM_HEIGHT) + BUFFER * 2)

  if (!syncedLines || lines.length === 0) {
    return (
      <div className="np-lyrics" ref={(el) => { if (el) lyricsRef.current = el }}>
        {lyrics?.status === 'loading' && <p className="np-lyrics-msg">Buscando letra…</p>}
        {lyrics?.status === 'notfound' && (
          <div className="np-lyrics-msg">
            <p>Letra não encontrada para esta música.</p>
          </div>
        )}
        {lyrics?.instrumental && <p className="np-lyrics-msg">🎹 Faixa instrumental</p>}
      </div>
    )
  }

  return (
    <div className="np-lyrics" onScroll={(e) => setScrollTop(e.target.scrollTop)}>
      <div className="np-lyrics-lines" style={{ height: lines.length * 48, paddingTop: start * 48 }}>
        {lines.slice(start, end).map((line, i) => {
          const idx = start + i
          const isActive = synced && line.time != null && line.time <= (elapsed - syncOffset) + 0.25
          const seekable = line.time != null
          return (
            <p
              key={idx}
              className={`np-lyric ${idx === activeIndex ? 'active' : ''} ${seekable ? 'seekable' : ''}`}
              style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={seekable ? () => onSeek?.(Math.min(0.999, line.time / (duration || 1))) : undefined}
            >
              <span className="np-lyric-main">{line.text || '\u00A0'}</span>
              {lyricTrans.enabled && lyricTrans.map[line.text] && (
                <span className="np-lyric-tr">{lyricTrans.map[line.text]}</span>
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
})