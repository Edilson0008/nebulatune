import { useEffect, useRef, useState } from 'react'
import { ProgressCtx } from './progress-context.js'

export function ProgressProvider({ sinkRef, onProgressRef, children }) {
  const [value, setValue] = useState({ elapsed: 0, duration: 0 })
  const lastRef = useRef(value)

  useEffect(() => {
    sinkRef.current = (p) => {
      if (!p) return
      const last = lastRef.current
      if (p.elapsed !== last.elapsed || p.duration !== last.duration) {
        lastRef.current = { elapsed: p.elapsed, duration: p.duration }
        setValue(lastRef.current)
      }
      if (onProgressRef && onProgressRef.current) onProgressRef.current = lastRef.current
    }
    return () => {
      sinkRef.current = null
    }
  }, [sinkRef, onProgressRef])

  return <ProgressCtx.Provider value={value}>{children}</ProgressCtx.Provider>
}
