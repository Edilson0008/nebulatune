import { useEffect, useMemo, useRef, useState } from 'react'
import { transCacheLoad, transCacheSave } from '../lib/translate-cache.js'

export async function translateLine(text) {
  const t = (text || '').trim()
  if (!t) return ''
  const cache = transCacheLoad()
  if (cache[t]) return cache[t]
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.slice(0, 480))}&langpair=autodetect|pt`,
    )
    if (!res.ok) return ''
    const data = await res.json()
    const out = data?.responseData?.translatedText || ''
    if (!out || /MYMEMORY WARNING/i.test(out)) return ''
    cache[t] = out
    transCacheSave()
    return out
  } catch {
    return ''
  }
}

export function useLyricsTranslation(lines) {
  const [enabled, setEnabled] = useState(false)
  // Traduções que acabaram de chegar da internet. O que já estava salvo no
  // aparelho entra por `saved`, calculado direto (sem esperar efeito rodar).
  const [baixadas, setBaixadas] = useState({})
  const [prontas, setProntas] = useState(0)
  const [chaveAtual, setChaveAtual] = useState('')
  const tokenRef = useRef(0)

  // A lista de linhas muda de identidade a cada render (o App cria um array
  // novo sempre), por isso a chave de tudo aqui é o TEXTO das linhas, e não o
  // array. Usar o array como dependência fazia o efeito rodar sem parar e
  // travava a tela preta.
  const chave = useMemo(() => {
    if (!enabled) return ''
    const seen = new Set()
    ;(lines || []).forEach((l) => {
      const t = (l.text || '').trim()
      if (t) seen.add(t)
    })
    return [...seen].join('\n')
  }, [enabled, lines])

  // Ao trocar de música a tradução zera no mesmo render: a tela já nasce certa,
  // sem piscar o texto antigo antes de trocar.
  if (chave !== chaveAtual) {
    setChaveAtual(chave)
    setBaixadas({})
    setProntas(0)
  }

  const { saved, faltando } = useMemo(() => {
    if (!chave) return { saved: {}, faltando: [] }
    const cache = transCacheLoad()
    const prontasNoCache = {}
    const faltando = []
    chave.split('\n').forEach((t) => {
      if (cache[t]) prontasNoCache[t] = cache[t]
      else faltando.push(t)
    })
    return { saved: prontasNoCache, faltando }
  }, [chave])

  useEffect(() => {
    if (!chave || !faltando.length) return undefined
    const myToken = tokenRef.current + 1
    tokenRef.current = myToken
    const queue = [...faltando]
    const _workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        if (tokenRef.current !== myToken) return
        const cur = queue.shift()
        const tr = await translateLine(cur)
        if (tokenRef.current !== myToken) return
        if (tr) setBaixadas((m) => ({ ...m, [cur]: tr }))
        setProntas((p) => p + 1)
      }
    })
    return () => {
      tokenRef.current += 1
    }
  }, [chave, faltando])

  const map = useMemo(() => ({ ...saved, ...baixadas }), [saved, baixadas])
  const pending = faltando.length ? Math.max(0, faltando.length - prontas) : 0
  return { enabled, setEnabled, map, pending }
}
