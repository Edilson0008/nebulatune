import { memo, useEffect, useRef, useState } from 'react'

export const MicButton = memo(function MicButton({ onResult, notify }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const supported =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  const stop = () => {
    try {
      recRef.current?.stop()
    } catch {
      /* já parado */
    }
    recRef.current = null
    setListening(false)
  }

  const toggle = () => {
    if (listening) {
      stop()
      return
    }
    if (!supported) {
      notify?.('Este navegador não tem busca por voz')
      return
    }
    try {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
      const rec = new Rec()
      rec.lang = 'pt-BR'
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.onresult = (e) => {
        let text = ''
        for (let i = 0; i < e.results.length; i += 1) text += e.results[i][0]?.transcript || ''
        text = text.trim()
        if (text) onResult?.(text)
      }
      rec.onerror = (e) => {
        stop()
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
          notify?.('Microfone bloqueado: libere a permissão no navegador')
        }
      }
      rec.onend = () => {
        recRef.current = null
        setListening(false)
      }
      recRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      notify?.('Não consegui abrir o microfone')
    }
  }

  useEffect(() => () => {
    try {
      recRef.current?.abort?.()
    } catch {
      /* ignora */
    }
  }, [])

  return (
    <button
      className={`mic-btn ${listening ? 'on' : ''}`}
      onClick={toggle}
      aria-label={listening ? 'Parar de ouvir' : 'Buscar por voz'}
      title={listening ? 'Parar de ouvir' : 'Buscar por voz'}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
      </svg>
    </button>
  )
})
