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

// Comidas: catálogo compartilhado entre a lojinha e o card do botão Comida.
// full = quanto a barra de fome sobe quando o gato come.
// kind: 'food' = vai pro estoque e some quando acaba.
export const FOOD_CATALOG = [
  { key: 'frango', name: 'Frango', emoji: '🍗', price: 0, full: 26, happy: 5, kind: 'food' },
  { key: 'pizza', name: 'Pizza', emoji: '🍕', price: 0, full: 30, happy: 8, kind: 'food' },
  { key: 'leite', name: 'Leitinho', emoji: '🥛', price: 0, full: 14, happy: 8, kind: 'food' },
  { key: 'cenoura', name: 'Cenoura', emoji: '🥕', price: 12, full: 18, happy: 4, kind: 'food' },
  { key: 'maçã', name: 'Maçã', emoji: '🍎', price: 18, full: 20, happy: 5, kind: 'food' },
  { key: 'banana', name: 'Banana', emoji: '🍌', price: 20, full: 22, happy: 7, kind: 'food' },
  { key: 'donut', name: 'Donut', emoji: '🍩', price: 25, full: 24, happy: 10, kind: 'food' },
  { key: 'uvinha', name: 'Uvinhas', emoji: '🍇', price: 28, full: 22, happy: 9, kind: 'food' },
  { key: 'morango', name: 'Morango', emoji: '🍓', price: 30, full: 18, happy: 12, kind: 'food' },
  { key: 'melancia', name: 'Melancia', emoji: '🍉', price: 32, full: 26, happy: 11, kind: 'food' },
  { key: 'macarrao', name: 'Macarrão', emoji: '🍝', price: 35, full: 32, happy: 6, kind: 'food' },
  { key: 'burguer', name: 'Burguer', emoji: '🍔', price: 40, full: 38, happy: 12, kind: 'food' },
  { key: 'coxinha', name: 'Coxinha', emoji: '🥐', price: 45, full: 30, happy: 15, kind: 'food' },
  { key: 'pizza-grande', name: 'Pizza Gigante', emoji: '🍕', price: 50, full: 48, happy: 14, kind: 'food' },
  { key: 'bife', name: 'Bife', emoji: '🍖', price: 55, full: 45, happy: 8, kind: 'food' },
  { key: 'costela', name: 'Costelinha', emoji: '🍖', price: 60, full: 50, happy: 10, kind: 'food' },
  { key: 'sashimi', name: 'Sashimi', emoji: '🍣', price: 65, full: 42, happy: 18, kind: 'food' },
  { key: 'salmão', name: 'Salmão', emoji: '🐟', price: 70, full: 40, happy: 16, kind: 'food' },
  { key: 'atum', name: 'Atum', emoji: '🐠', price: 75, full: 46, happy: 15, kind: 'food' },
  { key: 'peixinho', name: 'Peixinho', emoji: '🐠', price: 80, full: 44, happy: 14, kind: 'food' },
  { key: 'caviar', name: 'Caviar', emoji: '🥚', price: 120, full: 40, happy: 30, kind: 'food' },
]

// Brinquedos: comprados uma vez viram permanentes e aparecem no card do botão Brincar.
export const TOY_CATALOG = [
  { key: 'balão', name: 'Balão', emoji: '🎈', price: 25, happy: 14, kind: 'toy' },
  { key: 'pipa', name: 'Pipa', emoji: '🪁', price: 35, happy: 18, kind: 'toy' },
  { key: 'pato', name: 'Pato de Borracha', emoji: '🦆', price: 50, happy: 22, kind: 'toy' },
  { key: 'boliche', name: 'Boliche', emoji: '🎳', price: 60, happy: 26, kind: 'toy' },
  { key: 'roda-giro', name: 'Roda-giro', emoji: '🎡', price: 75, happy: 30, kind: 'toy' },
  { key: 'novelo', name: 'Novelo', emoji: '🧶', price: 90, happy: 36, kind: 'toy' },
]

// Banho: cada item comprado tem um número limitado de usos.
// A Esponjinha (key 'esponja') é a padrão, não se acaba.
export const BATH_CATALOG = [
  { key: 'esponja', name: 'Esponjinha', emoji: '🧽', price: 0, clean: 26, happy: 6, uses: 0, kind: 'bath' },
  { key: 'sabão', name: 'Sabonete', emoji: '🧼', price: 20, clean: 32, happy: 5, uses: 10, kind: 'bath' },
  { key: 'escova', name: 'Escovinha', emoji: '🪥', price: 28, clean: 26, happy: 8, uses: 12, kind: 'bath' },
  { key: 'shampoo', name: 'Shampoo', emoji: '🧴', price: 40, clean: 42, happy: 6, uses: 8, kind: 'bath' },
  { key: 'bálmamo', name: 'Bálmamo', emoji: '💧', price: 55, clean: 38, happy: 18, uses: 6, kind: 'bath' },
  { key: 'secador', name: 'Secador', emoji: '💨', price: 70, clean: 30, happy: 24, uses: 5, kind: 'bath' },
]

// Estoque inicial: o gato sempre começa com o essencial pra não ficar sem comer.
export const START_INVENTORY = { frango: 3, pizza: 2, leite: 2 }

// ---------------------------------------------------------------------------
// Contadores que DIMINUEM (moedas gastas, comida comida, usos de banho).
//
// O merge da sincronização junta duas cópias do mesmo contador tomando "o maior
// dos dois", porque é assim que contadores que só crescem (plays, toques,
// compras) se mantêm corretos. Mas para um contador que diminui isso quebra:
// você gasta 30 moedas e a cópia da nuvem ainda tem o valor antigo, o merge
// devolve 100 e as moedas voltaram sozinhas.
//
// A saída é não fazer o contador diminuir. O saldo continua sendo o valor que
// já era; o que foi consumido passa a contar num "razebook" separado, que só
// cresce e pode ser mesclado com o maior tranquilamente. O saldo é a diferença.
//
// Os razões começam zerados para quem já tinha o app: o saldo antigo continua
// valendo como saldo, então nada muda na hora da atualização.
// ---------------------------------------------------------------------------

// Quantos restam de `key`: o que tem menos o que já foi consumido.
export function disponivelDe(estoque, reasons, key) {
  const tem = Number(estoque && estoque[key]) || 0
  const usou = Number(reasons && reasons[key]) || 0
  return Math.max(0, tem - usou)
}

// Soma `n` ao razão de consumo de `key`. Sempre crescente, então o merge por
// maior valor continua sendo o certo.
export function somaConsumido(consumido, key, n = 1) {
  const base = consumido && typeof consumido === 'object' ? consumido : {}
  return { ...base, [key]: (Number(base[key]) || 0) + n }
}

// Junta dois razões de consumo. Os dois só crescem, então "o maior dos dois"
// é exatamente a união sem duplicar.
export function juntaConsumido(a, b) {
  const out = {}
  const keys = new Set([
    ...(a && typeof a === 'object' ? Object.keys(a) : []),
    ...(b && typeof b === 'object' ? Object.keys(b) : []),
  ])
  for (const k of keys) out[k] = Math.max(Number(a?.[k]) || 0, Number(b?.[k]) || 0)
  return out
}

// Tem estoque sobrando de `key`? (mesma conta, mas booleano)
export function temDisponivel(estoque, reasons, key) {
  return disponivelDe(estoque, reasons, key) > 0
}

// Barras de necessidade (full/happy/sleep/clean). Elas DIMINUEM com o tempo,
// então NÃO podem entrar no "pega o maior dos dois" da sincronização: foi
// exatamente aí que as barras voltavam cheias sozinhas. `settings.js` usa
// estas mesmas listas.
export const MOOD_KEYS = ['full', 'happy', 'sleep', 'clean']
export const MOOD_DEFAULTS = { full: 100, happy: 85, sleep: 90, clean: 90 }
export const MOOD_DECAY = { full: 9, happy: 6, sleep: 8, clean: 11 }
