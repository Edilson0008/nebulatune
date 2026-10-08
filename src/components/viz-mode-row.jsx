import { VIZ_MODES, setVizMode, useVizMode } from '../lib/viz-mode.js'

// Linha de Config: escolhe como o analisador do Equalizador desenha o som.
export function VizModeRow() {
  const mode = useVizMode()
  return (
    <div className="settings-row">
      <div className="settings-info">
        <span className="settings-label">Visual do espectro</span>
        <span className="settings-desc">Como o analisador do Equalizador desenha o som. Tocar nele também troca.</span>
      </div>
      <select
        className="settings-select"
        aria-label="Visual do espectro"
        value={mode}
        onChange={(e) => setVizMode(Number(e.target.value))}
      >
        {VIZ_MODES.map((name, i) => (
          <option key={name} value={i}>{name}</option>
        ))}
      </select>
    </div>
  )
}