// Teste local da tela do habitat, sem navegador e sem device.
//
// O ponto aqui nao e_rx_ _: e provar que um loop de animação nao sobrevive a
// saida da tela. Foi exatamente isso que travou o app inteiro: a limpeza da
// fisica da bolinha zerava o id do quadro antes de cancelar, o cancelamento
// nao cancelava nada, e a fisica continuava 60x por segundo para sempre.
//
// O "navegador" aqui e um contador de quadros pendentes: se o teste esquece
// um quadro agendado, o numero nao volta a zero e o teste falha.
import assert from 'node:assert/strict'
import { criarLoop } from '../src/lib/raf-loop.js'

let pendentes = new Map()
let proximoId = 1

globalThis.requestAnimationFrame = (fn) => {
  const id = proximoId++
  pendentes.set(id, fn)
  return id
}
globalThis.cancelAnimationFrame = (id) => {
  pendentes.delete(id)
}

// roda a fila de quadros ate parar (teto de seguranca)
function correr(limite = 50) {
  let n = 0
  while (pendentes.size && n < limite) {
    const [id, fn] = [...pendentes][0]
    pendentes.delete(id)
    fn(16.7 * ++n)
  }
  return n
}

const casos = []
const caso = (nome, fn) => casos.push([nome, fn])

caso('o agendador roda enquanto o loop pede o proximo quadro', () => {
  const l = criarLoop((_t, proximo) => proximo())
  l.acordar()
  assert.equal(pendentes.size, 1, 'acordar deve agendar exatamente 1 quadro')
  correr()
  assert.ok(pendentes.size > 0, 'o loop pediu o proximo quadro, entao continua')
  l.dormir()
  assert.equal(pendentes.size, 0, 'nada pode ficar pendente depois de dormir')
})

caso('o loop para sozinho quando nao pede o proximo quadro', () => {
  // e o caso da bolinha parada no chao: ela nao chama proximo(), e o agendador
  // tem que ficar sem quadro agendado (antes isso rodava a toa 60x/s).
  const l = criarLoop(() => {})
  l.acordar()
  assert.equal(pendentes.size, 1)
  correr()
  assert.equal(pendentes.size, 0, 'loop que nao pede nada nao pode deixar quadro agendado')
  assert.equal(l.rodando, false)
})

caso('dormir cancela o quadro mesmo com o loop no meio', () => {
  const l = criarLoop((_t, proximo) => proximo())
  l.acordar()
  assert.equal(pendentes.size, 1)
  l.dormir()
  assert.equal(pendentes.size, 0, 'dormir tem que cancelar o quadro pendente')
  assert.equal(l.rodando, false)
})

caso('o loop NAO sobrevive a saida da tela (o bug que travou o app)', () => {
  const l = criarLoop((_t, proximo) => proximo())
  l.acordar()
  for (let i = 0; i < 5; i++) correr()
  assert.ok(pendentes.size > 0, 'o loop esta rodando antes de sair da tela')
  // saiu da tela: a limpeza do efeito chama dormir()
  l.dormir()
  assert.equal(pendentes.size, 0, 'SAIU DA TELA e ficou quadro agendado -> loop zumbi')
  // e nada pode conseguir reanimar ele
  correr()
  assert.equal(pendentes.size, 0, 'loop zumbi continuaria consumindo CPU aqui')
})

caso('o padrao antigo (zerar antes de cancelar) vaza — este teste nao pode falhar', () => {
  // prova de que o teste acima tem forca: o codigo QUE EXISTIA no app
  let raf = 0
  const loop = (t) => {
    raf = requestAnimationFrame(loop)
    void t
  }
  raf = requestAnimationFrame(loop)
  for (let i = 0; i < 5; i++) correr()
  // a limpeza errada do app:
  raf = 0
  cancelAnimationFrame(raf)
  const vazou = pendentes.size > 0
  pendentes.clear()
  assert.ok(vazou, 'o padrao antigo deveria vazar; se nao vazar, o teste acima nao prova nada')
})

caso('pausar libera o quadro sem matar o agendador', () => {
  let continua = true
  const l = criarLoop((_t, proximo) => { if (continua) proximo() })
  l.acordar()
  correr()
  l.pausar()
  assert.equal(pendentes.size, 0, 'pausar tem que liberar o quadro agendado')
  assert.equal(l.rodando, false)
  continua = true
  l.acordar()
  assert.equal(pendentes.size, 1, 'depois de pausar, o agendador ainda volta a rodar')
  l.dormir()
  assert.equal(pendentes.size, 0)
})

caso('acordar duas vezes nao agenda dois loops', () => {
  const l = criarLoop((_t, proximo) => proximo())
  l.acordar()
  l.acordar()
  l.acordar()
  assert.equal(pendentes.size, 1, 'so pode existir um loop por agendador')
  l.dormir()
  assert.equal(pendentes.size, 0)
})

caso('dormir duas vezes nao faz nada de ruim', () => {
  const l = criarLoop((_t, proximo) => proximo())
  l.acordar()
  l.dormir()
  l.dormir()
  assert.equal(pendentes.size, 0)
})

let ok = 0
let falhas = 0
for (const [nome, fn] of casos) {
  try {
    fn()
    ok++
    console.log(`  ok  ${nome}`)
  } catch (e) {
    falhas++
    console.log(`  FALHOU  ${nome}\n        ${e.message}`)
  }
}
console.log(`\nhabitat: ${ok} ok, ${falhas} falhando`)
if (falhas) process.exit(1)