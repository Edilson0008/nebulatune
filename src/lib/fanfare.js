export let fanfareCtx = null

export function playFanfare() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    fanfareCtx = fanfareCtx || new AC()
    const ctx = fanfareCtx
    if (ctx.state === 'suspended') ctx.resume()
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t0 = ctx.currentTime + i * 0.12
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, t0)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4)
      osc.connect(g).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.45)
    })
  } catch {
    /* áudio indisponível */
  }
}
