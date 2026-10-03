import { useRef } from 'react'
import { PRESETS } from '../audio/equalizer'
import { EQ_FREQS } from '../audio/graph'
import { Visualizer } from './visualizer.jsx'

export function VSlider({ value, onChange, min = -12, max = 12, step = 1, label, suffix }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  // Medir a trilha a cada pointermove obriga o navegador a refazer o layout a
  // cada evento do dedo — dozens por segundo enquanto se arrasta. A medida só
  // muda se a janela girar, e isso acontece no meio do arrasto raramente. O
  // habitat ja faz assim (rect cacheado no pointerDown); aqui e o mesmo.
  const rectRef = useRef(null)
  const pct = ((value - min) / (max - min)) * 100

  const setFromPointer = (clientY) => {
    const el = trackRef.current
    if (!el) return
    const r = rectRef.current
    if (!r || !r.height) return
    const ratio = 1 - (clientY - r.top) / r.height
    const raw = min + Math.max(0, Math.min(1, ratio)) * (max - min)
    onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)))
  }

  return (
    <div className="vslider">
      <span className={`vslider-val ${value ? 'changed' : ''}`}>
        {value > 0 ? `+${value}` : `${value}`}
      </span>
      <div
        className="vslider-track"
        ref={trackRef}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          rectRef.current = trackRef.current?.getBoundingClientRect() || null
          setFromPointer(e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) setFromPointer(e.clientY)
        }}
        onPointerUp={(e) => {
          draggingRef.current = false
          e.currentTarget.releasePointerCapture?.(e.pointerId)
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
      >
        <div className="vslider-zero" />
        <div className="vslider-thumb" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="vslider-label">{label}</span>
      {suffix && <span className="vslider-sub">{suffix}</span>}
    </div>
  )
}

export function Equalizer({ eq }) {
  const { settings, setBand, setVolume, setPreampDb, applyPreset, toggle, reset } = eq
  return (
    <div className="eq">
      <div className="eq-head">
        <div>
          <h1 className="greeting">Equalizador</h1>
          <p className="eq-sub">10 bandas · 31 Hz a 16 kHz · compressor anti-distorção</p>
        </div>
        <div className="eq-actions">
          <button className="btn-ghost btn-ghost-danger" onClick={reset} title="Voltar ao padrão">
            Restaurar
          </button>
          <button
            role="switch"
            aria-checked={settings.enabled}
            className={`eq-switch ${settings.enabled ? 'on' : ''}`}
            onClick={toggle}
            title={settings.enabled ? 'Desativar equalizador' : 'Ativar equalizador'}
          >
            <span className="eq-switch-knob" />
          </button>
        </div>
      </div>

      {!settings.enabled && (
        <div className="eq-banner">
          Equalizador desativado — o som segue em resposta plana.
        </div>
      )}

      <div className={`eq-body ${settings.enabled ? '' : 'eq-off'}`}>
        <div className="eq-presets">
          {Object.entries(PRESETS)
            .filter(([id]) => id !== 'personalizado')
            .map(([id, p]) => (
            <button
              key={id}
              className={`eq-chip ${settings.preset === id ? 'active' : ''}`}
              onClick={() => applyPreset(id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Visualizer />

        <div className="eq-bands">
          {EQ_FREQS.map((f, i) => (
            <VSlider
              key={f}
              label={f >= 1000 ? `${f / 1000}k` : `${f}`}
              suffix="Hz"
              value={settings.bands[i]}
              onChange={(v) => setBand(i, v)}
            />
          ))}
        </div>

        <div className="eq-panels">
          <div className="eq-card">
            <div className="eq-card-head">
              <h3>Volume</h3>
              <span className="eq-card-val">{Math.round(settings.volume * 100)}%</span>
            </div>
            <p className="eq-card-desc">
              Ajuste geral do NebulaTune, independente do volume do aparelho.
            </p>
            <input
              type="range"
              className="eq-range"
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <div className="eq-range-scale">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="eq-card">
            <div className="eq-card-head">
              <h3>Ganho de entrada</h3>
              <span className="eq-card-val">{Number(settings.preampDb || 0).toFixed(1)} dB</span>
            </div>
            <p className="eq-card-desc">
              Força do sinal antes do equalizador. Abaixe se o som distorcer com graves altos.
            </p>
            <input
              type="range"
              className="eq-range"
              min={-12}
              max={6}
              step={0.5}
              value={Number(settings.preampDb || 0)}
              onChange={(e) => setPreampDb(Number(e.target.value))}
            />
            <div className="eq-range-scale">
              <span>-12 dB</span>
              <span>0 dB</span>
              <span>+6 dB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
