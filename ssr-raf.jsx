// Entrada dos testes que precisam de DOM de verdade (scripts/dom-harness.mjs).
// O Vite empacota tudo para o Node carregar, resolvendo os imports sem
// extensão que o navegador resolve mas o Node puro não.
export { SpaceParticles } from './src/components/background.jsx'
export { NowParticles, Visualizer } from './src/components/visualizer.jsx'
export { ProgressBar } from './src/components/ProgressBar.jsx'
export { PetHabitatView } from './src/components/pet-habitat-view.jsx'
export { NowPlaying } from './src/components/now-playing.jsx'
export { ProgressCtx } from './src/progress-context.js'
export { usePlayer } from './src/hooks/use-player.js'
export { Equalizer } from './src/components/equalizer.jsx'
export { PlayerBar } from './src/components/player-bar.jsx'
export { Minigames } from './src/components/minigames.jsx'
export { OnlineView } from './src/components/online-view.jsx'