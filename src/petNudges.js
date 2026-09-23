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