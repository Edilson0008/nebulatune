import { createContext, useContext, useEffect, useRef, useState } from 'react'

// Isola o estado de progresso da música (elapsed/duration) num contexto próprio.
// Os players emitem mudanças a no máximo 2x/s pelo `sinkRef`; só quem consome
// `useProgress()` re-renderiza (PlayerBar, NowPlaying, QueueSheet...), poupando
// a árvore da Home inteira de re-renderizar a cada segundo.

const ProgressCtx = createContext({ elapsed: 0, duration: 0 })

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

export function useProgress() {
  return useContext(ProgressCtx)
}