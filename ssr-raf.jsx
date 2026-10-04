// Entrada dos testes que precisam de DOM de verdade (scripts/dom-harness.mjs).
// O Vite empacota tudo para o Node carregar, resolvendo os imports sem
// extensão que o navegador resolve mas o Node puro não.
export { SpaceParticles } from './src/components/background.jsx'
export { NowParticles, Visualizer } from './src/components/visualizer.jsx'
export { PetHabitatView } from './src/components/pet-habitat-view.jsx'
export { NowPlaying } from './src/components/now-playing.jsx'
export { usePlayer } from './src/hooks/use-player.js'
export { Equalizer } from './src/components/equalizer.jsx'
export { PlayerBar } from './src/components/player-bar.jsx'
export { Minigames } from './src/components/minigames.jsx'
export { OnlineView } from './src/components/online-view.jsx'
export { TrackList } from './src/components/track-list.jsx'

// ---instrumentacao de custo (so para os testes) ---------------------------
// Reproduz a tela da biblioteca: uma linha por musica, com a capa de verdade.
import { createElement, useRef } from 'react'
import { Cover } from './src/components/cover.jsx'
import { ProgressProvider } from './src/progress.jsx'
import { useProgress } from './src/progress-context.js'

export const contador = { lista: 0, ticked: 0 }

export function Linha({ t }) {
  return createElement(
    'div',
    { className: 'track-row' },
    createElement(Cover, { colors: t.cover, image: t.coverUrl, size: 48, radius: 12 }),
    createElement('span', { className: 'track-title' }, t.title),
    createElement('span', { className: 'track-artist' }, t.artist),
  )
}

export function Lista({ tracks }) {
  contador.lista += 1
  return createElement(
    'div',
    { className: 'library' },
    tracks.map((t, i) => createElement(Linha, { key: t.id || i, t })),
  )
}

// Fica por tras do "Tocando agora" e NAO consome o contexto: e o caso real da
// lista de musicas enquanto a tela de tocar esta aberta por cima.
export const cenario = { sink: null }

export function Cenario({ tracks, children }) {
  const sinkRef = useRef(null)
  const onRef = useRef(null)
  cenario.sink = (p) => sinkRef.current?.(p)
  return createElement(
    ProgressProvider,
    { sinkRef, onProgressRef: onRef },
    createElement(Lista, { tracks }),
    children,
  )
}

export function Tique({ sinkRef }) {
  const { elapsed } = useProgress()
  contador.ticked += 1
  return createElement('span', null, String(Math.floor(elapsed)))
}
