import App from './src/App.jsx'
import * as background from './src/components/background.jsx'
import * as Cover from './src/components/Cover.jsx'
import * as equalizer from './src/components/equalizer.jsx'
import * as libraryUi from './src/components/library-ui.jsx'
import * as mediaSessionBridge from './src/components/media-session-bridge.jsx'
import * as micButton from './src/components/mic-button.jsx'
import * as nowPlaying from './src/components/now-playing.jsx'
import * as onlineView from './src/components/online-view.jsx'
import * as pet from './src/components/pet.jsx'
import * as playerBar from './src/components/player-bar.jsx'
import * as profile from './src/components/profile.jsx'
import * as queueSheet from './src/components/queue-sheet.jsx'
import * as settingsView from './src/components/settings-view.jsx'
import * as trackList from './src/components/track-list.jsx'
import * as visualizer from './src/components/visualizer.jsx'

const modulos = {
  background, Cover, equalizer, libraryUi, mediaSessionBridge, micButton,
  nowPlaying, onlineView, pet, playerBar, profile, queueSheet, settingsView,
  trackList, visualizer,
}

export default App
export { modulos }
