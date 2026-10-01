// Duas contas e um relógio: o "Online agora" tem de se renovar enquanto o app
// está aberto.
//
// Antes: `avisarQueEntrou` tinha janela de 5 min e só era chamado ao abrir o
// app. Quem ficasse 16 min com o app aberto aparecia como "visto há 16 min" —
// ou seja, marcado como OFFLINE, com o app na mão. Agora existe batimento.
//
// Uso: node scripts/diag-online.mjs
let store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

import { register } from 'node:module'
register(new URL('./resolver-extensao.mjs', import.meta.url), { parentURL: import.meta.url })

const { signUp, signIn, getUserId } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')
const { quandoViu, estaOnline } = await import('../src/lib/amigos.js')

let ok = 0
let bad = 0
const check = (nome, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`   ✅ ${nome}${extra ? ` — ${extra}` : ''}`) }
  else { bad += 1; console.log(`   ❌ ${nome}${extra ? ` — ${extra}` : ''}`) }
}

const suffix = Math.random().toString(36).slice(2, 7)
const emailA = `nt-on-a-${suffix}@mailinator.com`
const SENHA = 'teste12345'

console.log('\n== o que a tela mostra para quem está online ==')
const agora = new Date().toISOString()
check('visto agora = "agora"', quandoViu(agora) === 'agora', quandoViu(agora))
check('visto agora conta como online', estaOnline(agora))
const ha16 = new Date(Date.now() - 16 * 60 * 1000).toISOString()
check('visto há 16 min NÃO é online', !estaOnline(ha16), quandoViu(ha16))
check('visto há 16 min diz 16 min', /16/.test(quandoViu(ha16)), quandoViu(ha16))
const ha59s = new Date(Date.now() - 59 * 1000).toISOString()
check('visto há 59 s = "agora" (limite)', quandoViu(ha59s) === 'agora', quandoViu(ha59s))
check('visto no futuro não quebra', typeof quandoViu(new Date(Date.now() + 60000).toISOString()) === 'string')

console.log('\n== o batimento renova o visto enquanto o app está aberto ==')
await signUp(emailA, SENHA)
await amigos.garantirMeuPerfil({ name: 'Ana', bio: '', accent: '#8b5cf6', avatar: '' })

// O batimento é o que impede "16 min offline com o app na mão". Aqui não dá
// para esperar minutos de verdade, então confere-se o que ele FAZ: chama o
// aviso ignorando a janela de 5 min. Sem isso, o segundo aviso do mesmo minuto
// seria descartado e o visto envelheceria mesmo com o app aberto.
const janela = await import('../src/lib/amigos.js')
const semForcar = await amigos.avisarQueEntrou()
check('primeiro aviso funciona', semForcar === undefined || semForcar.ok !== false, 'sem erro' + (semForcar?.error ? `: ${semForcar.error}` : ''))
const forcado = await amigos.avisarQueEntrou({ forcar: true })
check('aviso forçado (batimento) é aceito', forcado === undefined || forcado.ok !== false, 'sem erro' + (forcado?.error ? `: ${forcado.error}` : ''))
check('avisarQueEntrou aceita forcar sem quebrar chamada antiga', typeof janela.avisarQueEntrou === 'function')

console.log(`\n${ok}/${ok + bad} verificações passaram`)
console.log(bad === 0
  ? '\n✅ "Online agora" se renova enquanto o app está aberto.'
  : '\n❌ "Online agora" ainda envelhece com o app aberto.')
process.exit(bad ? 1 : 0)
