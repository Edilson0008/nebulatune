export const random = (a, b) => a + Math.random() * (b - a)

export const PET_GREETINGS = [
  () => 'Sua biblioteca está vazia! Adicione algumas músicas para começarmos. ✨',
  (n) => (n ? `Olá, ${n}! ✨` : 'Olá! ✨'),
  (n) => (n ? `Oi, ${n}! Tudo bem? 🐾` : 'Oi! Tudo bem? 🐾'),
  (n) => (n ? `Opa, ${n}! Que bom te ver! 💜` : 'Opa! Que bom te ver! 💜'),
  (n) => (n ? `${n}, bora ouvir um som? 🎶` : 'Bora ouvir um som? 🎶'),
  (n) => (n ? `E aí, ${n}! Pronto pra curtir? ✨` : 'E aí! Pronto pra curtir? ✨'),
  (n) => (n ? `${n}, você chegou! 🥰` : 'Você chegou! 🥰'),
  (n) => (n ? `${n}, hoje a gente se diverte! 🎵` : 'Hoje a gente se diverte! 🎵'),
  (n) => (n ? `Que bom te ver de novo, ${n}! 💜` : 'Que bom te ver de novo! 💜'),
  () => 'Tava te esperando! 😻',
  () => 'Me dá um toque pra eu ronronar. 🐱',
  () => 'Bora cantar junto? 🎤',
  () => 'Hoje o clima tá perfeito pra uma música boa! 🌙',
  () => 'Que tal explorar aquele equalizador? 🎛️',
]

export function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  if (hour >= 18) return 'Boa noite'
  return 'Boa madrugada'
}
