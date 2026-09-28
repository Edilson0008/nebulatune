// Ideias de mensagens que o gatinho usa para chamar a pessoa de volta ao app.
export const PET_NUDGE_IDEAS = [
  'Cadê você? Tô aqui esperando! 🐾',
  'Posso te fazer companhia pra ouvir um som? 🎶',
  'Senti sua falta, viu! Vem dar um oi. 💜',
  'Aquele seu play favorito tá com saudade. ▶️',
  'Tem moedinha esperando aqui pra você? Toque em mim! 🪙',
  'Vem ver o que mudou por aqui... tem coisa nova! ✨',
  'O espaço tá bonito hoje... vem admirar comigo. 🌌',
  'Tô com uma música boa na cabeça... e você? 🎧',
  'Que tal um cafuné hoje? Eu deixo! 🐱',
  'Sua biblioteca continua guardada... vem curtir! 🎼',
  'O gatinho quer saber como está seu dia. 🥰',
  'Bora descobrir uma música nova juntos? 🚀',
]

export function pickPetNudge() {
  return PET_NUDGE_IDEAS[Math.floor(Math.random() * PET_NUDGE_IDEAS.length)]
}

// Chamadas de "vem me visitar" quando uma barra de necessidade cai.
export const PET_NEEDS_INFO = {
  full: { emoji: '🍗', label: 'Fome', cor: '#fbbf24' },
  happy: { emoji: '💗', label: 'Carinho', cor: '#f472b6' },
  sleep: { emoji: '😴', label: 'Sono', cor: '#a78bfa' },
  clean: { emoji: '🫧', label: 'Banho', cor: '#38bdf8' },
}

export const PET_NEED_PHRASES = {
  full: [
    'tô com uma fome, {n}... vem me dar comida? 🍗',
    'que barriga vazia! dá uma comidinha pra mim? 🥺',
    'tô rambando aqui, {n}! me visita logo 🍗',
  ],
  happy: [
    'tô meio sozinho, {n}... vem fazer carinho? 💗',
    'faz tempo que não te vejo, {n}! vem aqui 🥰',
    'me dá um afago? tô precisando, {n} 💗',
  ],
  sleep: [
    'que soninho pesado, {n}... vem dormir comigo? 😴',
    'tô de olho pesado, me vem deitar? 💤',
    'sem você eu não durmo, {n}! 😴',
  ],
  clean: [
    'tô sujinho, {n}... me dá um banho? 🫧',
    'que coceira! vem me limpar logo 🧼',
    'preciso de um banho, {n}! 🛁',
  ],
}

const URGENT_PHRASES = {
  full: ['tô desmaiando de fome, {n}!! 🍗 me salva', 'SOCORRO, {n}, tô com fome demais! 😿'],
  happy: ['tô precisando de você, {n}! vem agora 💗', 'me ignora mais não, {n}... 🥺'],
  sleep: ['não aguento mais, {n}! vou dormir agora 😴', 'tô capotando de sono, {n}! 💤'],
  clean: ['tô fedendo já, {n}! me limpa agora 🫧', 'preciso de banho urgente, {n}!! 🛁'],
}

// Frase da barra baixa (com o nome da pessoa quando existe)
export function pickNeedNudge(key, name, urgent = false) {
  const pool = urgent && URGENT_PHRASES[key] ? URGENT_PHRASES[key] : PET_NEED_PHRASES[key]
  if (!pool) return ''
  const frase = pool[Math.floor(Math.random() * pool.length)]
  const n = (name || '').trim()
  return frase.replace('{n}', n || 'amigo')
}