// O pedido de amizade tem que aparecer RÁPIDO e mesmo com a tela de Amigos
// FECHADA.
//
// Antes, o vigia das amizades vivia dentro da tela de Amigos: sair da aba
// desligava ele. O pedido que chegasse nesse meio-tempo só aparecia quando a
// pessoa voltava à aba — ou seja, parecia que o pedido não tinha chegado.
//
// Este teste roda o vigia de verdade (watchAmigos), com um intervalo curto, e
// confere que ele avisa quando um pedido novo aparece, sem depender da tela.
//
// Uso: node scripts/diag-pedido-tempo-real.mjs
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
if (typeof document === 'undefined') {
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
}

import { register } from 'node:module'
register(new URL('./resolver-extensao.mjs', import.meta.url), { parentURL: import.meta.url })

const { signUp, signIn, getUserId } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')
const { watchAmigos, WATCH_AMIGOS_TESTavel } = await import('../src/lib/sync.js').catch(() => ({}))

let ok = 0
let bad = 0
const check = (nome, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`   ✅ ${nome}${extra ? ` — ${extra}` : ''}`) }
  else { bad += 1; console.log(`   ❌ ${nome}${extra ? ` — ${extra}` : ''}`) }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const suffix = Math.random().toString(36).slice(2, 7)
const emailA = `nt-rt-a-${suffix}@mailinator.com`
const emailB = `nt-rt-b-${suffix}@mailinator.com`
const SENHA = 'teste12345'

const enviadoErro = (r) => (r && r.ok === false ? r.error : '')

// B existe e tem perfil com código
await signUp(emailB, SENHA)
await amigos.garantirMeuPerfil({ name: 'Bia', bio: 'oi', accent: '#8b5cf6', avatar: '' })
const pB = await amigos.meuPerfil()
check('B tem código', Boolean(pB?.code), pB?.code)

// A é quem fica "com a tela fechada" esperando
await signUp(emailA, SENHA)
await amigos.garantirMeuPerfil({ name: 'Ana', bio: '', accent: '#8b5cf6', avatar: '' })

console.log('\n== o vigia percebe o pedido sem a tela estar aberta ==')
let avisou = 0
const parar = watchAmigos(() => { avisou += 1 }, 700)
// deixa o vigia estabelecer a linha de base
await dormir(2500)
check('o vigia começa olhando, sem pedir nada à pessoa', avisou === 0, `avisos=${avisou}`)

// Agora o pedido chega: A pede amizade a B. Precisa entrar como A — o signUp
// da conta B deixou a sessão em B, e mandar para o próprio código é recusado.
const codigoB = pB.code
await signIn(emailA, SENHA)
const enviou = await amigos.enviarPedido(codigoB, 'oi')
check('A conseguiu mandar o pedido para B', enviou?.ok !== false, enviadoErro(enviou))

await dormir(2500)
check('o vigia AVISOU sobre o pedido novo, sem tela', avisou >= 1, `avisos=${avisou}`)
parar()

console.log('\n== e o pedido está de fato lá para ser mostrado ==')
// Do ponto de vista de QUEM RECEBE: é preciso trocar a sessão para B.
await signIn(emailB, SENHA)
const p = await amigos.listarPedidos()
check('o pedido aparece para quem recebeu', p.recebidos.length === 1, `recebidos=${p.recebidos.length}`)
check('vem com o perfil de quem mandou', Boolean(p.recebidos[0]?.perfil?.name), p.recebidos[0]?.perfil?.name)
check('vem com a mensagem', p.recebidos[0]?.mensagem === 'oi', p.recebidos[0]?.mensagem)

console.log('\n== aceitar tira da fila e põe na lista ==')
await amigos.responderPedido(p.recebidos[0].id, true)
const depois = await amigos.listarPedidos()
check('depois de aceitar não há mais pedido pendente', depois.recebidos.length === 0, `recebidos=${depois.recebidos.length}`)
const lista = await amigos.listarAmigos()
check('a pessoa entra na lista de amigos', lista.length === 1, `amigos=${lista.length}`)

// O que este teste NÃO cobre, e é preciso deixar explícito: ele prova que o
// vigia AVISA e que o pedido chega ao banco. Não prova que a TELHA troca a
// lista — isso exigiria renderizar o React, e não há renderer de teste neste
// ambiente (react-test-renderer não instala; npm quebra no esbuild).
//
// Essa parte é conferida por leitura do código (o `sinal` chega na tela e
// dispara `carregar`), o que é mais fraco que um teste. Se um dia o
// react-test-renderer entrar, é o teste que falta aqui.
console.log('\n-- cobertura --')
console.log('   prova: o vigia avisa sem a tela + o pedido chega no banco')
console.log('   NÃO prova: a tela redesenhar a lista a partir do aviso (sem renderer)')

console.log(`\n${ok}/${ok + bad} verificações passaram`)
console.log(bad === 0
  ? '\n✅ Pedido chega rápido, mesmo com a tela fechada.'
  : '\n❌ Pedido ainda demora ou some.')
process.exit(bad ? 1 : 0)
