// Pequenos efeitos sonoros sintetizados com WebAudio (sem arquivos de mídia).
// Tocam apenas dentro de gestos do usuário (clique/toque/arrasto) p/ autoplay.
let ac = null
let on = true
let musica = false // quando uma música está tocando, os sons ficam baixinhos

export function setSfxEnabled(v) {
  on = !!v
}

// O App avisa: musica tocando = volume discreto; sem musica = som mais alto
export function setMusicPlaying(v) {
  musica = !!v
}

// Volume aplicado: 2.4x quando NAO tem musica, 0.7x quando tem (sempre cap em 0.65)
const aplicaVol = (v) => Math.min(0.65, v * (musica ? 0.7 : 2.4))

function ctx() {
  if (!on) return null
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ac = new AC()
    }
    if (ac.state === 'suspended') ac.resume()
    return ac
  } catch {
    return null
  }
}

function tone({ f0, f1 = f0, dur = 0.1, type = 'sine', vol = 0.25, delay = 0 }) {
  const c = ctx()
  if (!c) return
  const t0 = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(aplicaVol(vol), t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

function noise({ dur = 0.15, vol = 0.12, freq = 900, q = 1, type = 'bandpass', delay = 0 }) {
  const c = ctx()
  if (!c) return
  const t0 = c.currentTime + delay
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(aplicaVol(vol), t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
}

// "nhac nhac nhac" — 3 mordidas curtas
export function sfxEat() {
  for (let i = 0; i < 3; i++) {
    tone({ f0: 300 - i * 40, f1: 150 - i * 20, dur: 0.07, type: 'sine', vol: 0.3, delay: i * 0.09 })
  }
}

// "din-don" de moeda
export function sfxCoin() {
  tone({ f0: 987, dur: 0.06, vol: 0.24, delay: 0 })
  tone({ f0: 1318, dur: 0.16, vol: 0.28, delay: 0.07 })
}

// "tuc" de quique na borda
export function sfxBounce() {
  tone({ f0: 230, f1: 85, dur: 0.08, type: 'triangle', vol: 0.26 })
  noise({ dur: 0.05, vol: 0.08, freq: 1400, q: 0.8 })
}

// "schuuu" de arremesso
export function sfxThrow() {
  noise({ dur: 0.22, vol: 0.1, freq: 900, q: 1.2 })
}

// "puft" de item chegando na sala
export function sfxSpawn() {
  tone({ f0: 240, f1: 460, dur: 0.09, vol: 0.2 })
  tone({ f0: 460, f1: 720, dur: 0.09, vol: 0.14, delay: 0.07 })
}

// chuva de corações suave
export function sfxHeart() {
  tone({ f0: 660, dur: 0.09, vol: 0.2 })
  tone({ f0: 880, dur: 0.14, vol: 0.2, delay: 0.09 })
}

// bocejo grave e tranquilo
export function sfxSleep() {
  tone({ f0: 300, f1: 170, dur: 0.45, type: 'triangle', vol: 0.16 })
  tone({ f0: 420, f1: 220, dur: 0.32, type: 'sine', vol: 0.1, delay: 0.18 })
}

// bolhinhas subindo
export function sfxBubbles() {
  for (let i = 0; i < 5; i++) {
    tone({ f0: 400 + Math.random() * 500, f1: 700 + Math.random() * 600, dur: 0.05, vol: 0.14, delay: i * 0.07 })
  }
}

// arremesso fraquinho (sem pontuação)
// "ploc" de bolha estourando
export function sfxPop() {
  tone({ f0: 720, f1: 220, dur: 0.08, type: 'triangle', vol: 0.22 })
  noise({ dur: 0.05, vol: 0.06, freq: 2600, q: 0.6 })
}

export function sfxWeak() {
  tone({ f0: 160, f1: 110, dur: 0.07, type: 'triangle', vol: 0.16 })
}

// Nota musical (piano curtinho) para o minigame "Nota Certa".
// Cada botão tem uma nota diferente, em ordem crescente (lá, si, dó, ré).
const NOTAS = [440, 493.88, 523.25, 587.33]
export function sfxNota(i) {
  const f = NOTAS[Math.max(0, Math.min(NOTAS.length - 1, i | 0))]
  tone({ f0: f, dur: 0.09, type: 'triangle', vol: 0.26 })
  tone({ f0: f * 2, dur: 0.05, type: 'sine', vol: 0.08, delay: 0.005 })
}