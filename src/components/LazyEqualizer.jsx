import { useEffect, useState } from 'react'

export function LazyEqualizer({ eq, open, onClose }) {
  const [mounted, setMounted] = useState(false)
  const [EqualizerComp, setEqualizerComp] = useState(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      import('./equalizer.jsx').then((mod) => {
        setEqualizerComp(() => mod.Equalizer)
      })
    }
  }, [open])

  if (!open) return null

  return (
    <div className="np-eq-sheet">
      <div className="np-eq-sheet-head">
        <button className="np-eq-sheet-close" onClick={onClose} aria-label="Fechar equalizador">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="np-eq-sheet-scroll">
        {mounted && EqualizerComp && <EqualizerComp eq={eq} />}
      </div>
    </div>
  )
}