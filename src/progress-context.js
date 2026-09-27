import { createContext, useContext } from 'react'

// Contexto de progresso separado do provider (progress.jsx) para o Fast Refresh
// do React funcionar: um arquivo que só exporta componente é OK, um que
// mistura componente e hook não é.

// Isola o estado de progresso da música (elapsed/duration) num contexto próprio.
// Os players emitem mudanças a no máximo 2x/s pelo `sinkRef`; só quem consome
// `useProgress()` re-renderiza (PlayerBar, NowPlaying, QueueSheet...), poupando
// a árvore da Home inteira de re-renderizar a cada segundo.
export const ProgressCtx = createContext({ elapsed: 0, duration: 0 })

export function useProgress() {
  return useContext(ProgressCtx)
}
