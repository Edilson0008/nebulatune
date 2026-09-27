import { useMediaSession } from '../hooks/use-media-session.js'

export function MediaSessionBridge({ track, playing, speed, onToggle, onNext, onPrev, onSeek }) {
  useMediaSession({ track, playing, speed, onToggle, onNext, onPrev, onSeek })
  return null
}
