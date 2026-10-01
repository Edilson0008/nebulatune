import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readLocal, writeLocal } from './localstore'

const PSTAT_DEFAULTS = { touches: 0, hearts: 0, sleeps: 0, scares: 0, meows: 0, coins: 0 }

// Sistema de humores do gatinho: barras de necessidade que caem com o tempo
export const MOOD_DEFAULTS = { full: 100, happy: 85, sleep: 90, clean: 90 }
export const MOOD_KEYS = ['full', 'happy', 'sleep', 'clean']
// Quanto cada barra cai por hora (%, ponto flutuante)
const MOOD_DECAY = { full: 9, happy: 6, sleep: 8, clean: 11 }

export const ACCENTS = {
  violet: { name: 'Violeta', accent: '#8b5cf6', accent2: '#c084fc' },
  pink: { name: 'Rosa', accent: '#ec4899', accent2: '#f472b6' },
  red: { name: 'Vermelho', accent: '#ef4444', accent2: '#f87171' },
  orange: { name: 'Laranja', accent: '#f97316', accent2: '#fb923c' },
  amber: { name: 'Âmbar', accent: '#f59e0b', accent2: '#fbbf24' },
  green: { name: 'Verde', accent: '#10b981', accent2: '#34d399' },
  teal: { name: 'Turquesa', accent: '#14b8a6', accent2: '#2dd4bf' },
  blue: { name: 'Azul', accent: '#3b82f6', accent2: '#60a5fa' },
  cyan: { name: 'Ciano', accent: '#06b6d4', accent2: '#22d3ee' },
}

function lighten(hex, amount = 0.45) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function resolveAccent(settings) {
  if (settings?.accent === 'custom' && /^#[0-9a-f]{6}$/i.test(settings?.customAccent || '')) {
    return { name: 'Personalizada', accent: settings.customAccent, accent2: lighten(settings.customAccent) }
  }
  return ACCENTS[settings?.accent] || ACCENTS.violet
}

// A cor que o OUTRO precisa ver: sempre o hex resolvido.
//
// Não pode ser `settings.accent` direto: para quem usa tema pronto isso é a
// PALAVRA do tema ('red', 'pink', 'violet'), não uma cor. Mandando a palavra, o
// card do amigo recebia algo que não é cor e caía no azul padrão — sintoma: o
// cartão nunca ficava com a cor do tema da pessoa. Só quem tinha escolhido
// cor personalizada (#rrggbb) aparecia certo.
//
// Também ignora a `customAccent` que sobrou de quando a pessoa usava cor
// personalizada: voltar para um tema pronto tem que apagar a cor antiga. Só a
// `customAccent` vale quando o tema É o personalizado — por isso o desvio
// abaixo, em vez de apagar o campo para todo mundo.
export function corPublicavel(settings) {
  if (settings?.accent === 'custom') return resolveAccent(settings).accent
  return resolveAccent({ accent: settings?.accent }).accent
}

export const SPEEDS = [1, 1.25, 1.5, 2]

const DEFAULTS = {
  accent: 'violet',
  customAccent: '',
  userName: '',
  bio: '',
  speed: 1,
  fetchCovers: true,
  avatar: '',
  bgAnimated: true,
  cosmosAnimated: true,
  petSound: true,
  lowPower: false,
}

function merge(raw) {
  return { ...DEFAULTS, ...raw }
}

export function useSettings() {
  const [settings, setSettings] = useState(() => merge(readLocal('nt.settings')))

  const accentKey = settings.accent
  const customAccentValue = settings.customAccent

  useEffect(() => {
    const a = resolveAccent({ accent: accentKey, customAccent: customAccentValue })
    document.documentElement.style.setProperty('--accent', a.accent)
    document.documentElement.style.setProperty('--accent-2', a.accent2)
  }, [accentKey, customAccentValue])

  useEffect(() => {
    document.documentElement.classList.toggle('low-power', settings.lowPower === true)
  }, [settings.lowPower])

  useEffect(() => {
    writeLocal('nt.settings', settings)
  }, [settings])

  // Espelho do estado para os ajustes saberem o valor atual sem esperar o React
  // redesenhar. É o que permite gravar na mesma hora (veja `aplica`).
  // Mantido num efeito para não atrapalhar a renderização: o `aplica` abaixo já
  // roda sempre com o valor em dia, porque só ele muda o estado.
  const atualRef = useRef(settings)
  useEffect(() => {
    atualRef.current = settings
  }, [settings])

  // Todo ajuste que a PESSOA muda carimba a hora. É isso que faz "mudei o nome
  // aqui e mudou lá": o relógio mais novo ganha, sem depender de qual aparelho
  // fala por último.
  const carimba = () => writeLocal('nt.settingsAt', Date.now())

  // Grava no armazenamento no MESMO instante do clique, não num efeito depois do
  // render. A sincronização lê o aparelho a qualquer momento; se o ajuste só
  // aparecesse no armazenamento depois do redesenho, uma sync que começasse nessa
  // fresta leria o valor velho, gravaria esse valor velho na nuvem com o carimbo
  // novo e traria o tema/foto antigo de volta para a tela.
  const aplica = useCallback((mudar, carimbado = true) => {
    const proximo = mudar(atualRef.current)
    if (carimbado) carimba()
    atualRef.current = proximo
    writeLocal('nt.settings', proximo)
    setSettings(proximo)
  }, [])

  const api = useMemo(
    () => ({
      set: (key, value) => aplica((s) => ({ ...s, [key]: value })),
      // Voltar para um tema pronto tem que APAGAR a cor personalizada: senão ela
      // fica guardada e volta a ser usada no lugar do tema (o card do amigo
      // mostrava a cor antiga depois de a pessoa trocar o tema).
      setAccent: (value) => aplica((s) => ({ ...s, accent: value, customAccent: '' })),
      setCustomAccent: (value) => aplica((s) => ({ ...s, customAccent: value, accent: 'custom' })),
      setUserName: (value) => aplica((s) => ({ ...s, userName: value })),
      setBio: (value) => aplica((s) => ({ ...s, bio: value })),
      setSpeed: (value) => aplica((s) => ({ ...s, speed: value })),
      setFetchCovers: (value) => aplica((s) => ({ ...s, fetchCovers: value })),
      setAvatar: (value) => aplica((s) => ({ ...s, avatar: value })),
      setBgAnimated: (value) => aplica((s) => ({ ...s, bgAnimated: value })),
      setCosmosAnimated: (value) => aplica((s) => ({ ...s, cosmosAnimated: value })),
      setPetSound: (value) => aplica((s) => ({ ...s, petSound: value })),
      setLowPower: (value) => aplica((s) => ({ ...s, lowPower: value })),
      // Usado pela sincronização: aplicar o que veio do outro aparelho NÃO é uma
      // edição da pessoa, então não carimba nada (senão o aparelho "antigo" se
      // firmaria como o mais novo e o cambio nunca entraria).
      setAll: (value) => aplica((s) => ({ ...s, ...(value || {}) }), false),
    }),
    [aplica],
  )

  return { settings, api }
}

export function usePetStats() {
  const [petStats, setPetStats] = useState(() => ({
    ...PSTAT_DEFAULTS,
    ...MOOD_DEFAULTS,
    lt: 0,
    ...(readLocal('nt.petstats') || {}),
  }))

  useEffect(() => {
    writeLocal('nt.petstats', petStats)
  }, [petStats])

  const bumpPet = useMemo(
    () => (key, amount = 1) => setPetStats((s) => ({ ...s, [key]: (s[key] || 0) + amount })),
    [],
  )

  // Recarrega barra(s) de humor (0..100) e marca o horário do último carinho/atividade
  const settlePet = useMemo(
    () => (meters = {}) =>
      setPetStats((s) => {
        const next = { ...s }
        for (const k of MOOD_KEYS) {
          const cur = typeof s[k] === 'number' ? s[k] : MOOD_DEFAULTS[k]
          const add = Number(meters[k]) || 0
          next[k] = Math.max(0, Math.min(100, cur + add))
        }
        next.lt = Date.now()
        return next
      }),
    [],
  )

  // Decaimento por tempo real: persiste mesmo com o app fechado.
  // lt == 0 (save antigo) apenas inicializa o relógio, sem jogar barras em 0.
  useEffect(() => {
    const decay = () => {
      const nowV = Date.now()
      setPetStats((s) => {
        const lt = Number(s.lt) || nowV
        if (!s.lt) return { ...s, lt: nowV }
        const hours = Math.max(0, (nowV - lt) / 3.6e6)
        if (hours < 0.02) return s
        const next = { ...s, lt: nowV }
        for (const k of MOOD_KEYS) {
          const cur = typeof s[k] === 'number' ? s[k] : MOOD_DEFAULTS[k]
          const v = cur - hours * MOOD_DECAY[k]
          const rounded = Math.round(v * 10) / 10
          if (Math.abs(rounded - cur) > 0.001) next[k] = Math.max(0, rounded)
        }
        return next
      })
    }
    decay()
    const id = setInterval(decay, 60000)
    const onVis = () => {
      if (document.visibilityState === 'visible') decay()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Aplica pontuações salvas (backup) sem nunca diminuir os contadores:
  // cada aparelho contribui com os seus toques/corações e o total só cresce.
  const applyPetStats = useMemo(
    () => (value) => {
      if (!value || typeof value !== 'object') return
      setPetStats((s) => {
        const keys = ['touches', 'hearts', 'sleeps', 'scares', 'meows', 'coins', ...MOOD_KEYS, 'lt']
        const merged = { ...s }
        for (const k of keys) {
          const v = Number(value[k]) || 0
          if (v > (Number(s[k]) || 0)) merged[k] = v
        }
        return { ...PSTAT_DEFAULTS, ...MOOD_DEFAULTS, ...merged }
      })
    },
    [],
  )

  // Restauração EXATA (usada ao importar um backup): substitui os contadores
  // pelos valores do arquivo, diferente do applyPetStats que só faz crescer.
  const restorePetStats = useMemo(
    () => (value) => {
      if (!value || typeof value !== 'object') return
      const next = { ...PSTAT_DEFAULTS, ...MOOD_DEFAULTS, ...value }
      setPetStats((s) => ({ ...s, ...next }))
    },
    [],
  )

  return { petStats, bumpPet, settlePet, applyPetStats, restorePetStats }
}