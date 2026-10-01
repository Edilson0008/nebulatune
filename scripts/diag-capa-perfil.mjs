// A capa das músicas tem que aparecer no perfil do amigo, inclusive quando a
// capa veio do ARQUIVO (não da internet).
//
// Antes: a RPC pegava só o `coverRemote` (link do iTunes). Música com capa do
// próprio arquivo ficava sem capa no perfil. Agora o aparelho manda uma
// miniatura de 64px (data URL) em `coverShare`, e a RPC usa ela quando não há
// link.
//
// Este teste é de ponta a ponta contra o banco real: duas contas, amizade
// aceita, biblioteca com capa de arquivo e leitura do perfil pelo amigo.
//
// Uso: node scripts/diag-capa-perfil.mjs
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

const { signUp, signIn } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')
const { syncNow } = await import('../src/lib/sync.js')

let ok = 0
let bad = 0
const check = (nome, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`   ✅ ${nome}${extra ? ` — ${extra}` : ''}`) }
  else { bad += 1; console.log(`   ❌ ${nome}${extra ? ` — ${extra}` : ''}`) }
}

const MIN = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const suffix = Math.random().toString(36).slice(2, 7)
const emailA = `nt-cap-a-${suffix}@mailinator.com`
const emailB = `nt-cap-b-${suffix}@mailinator.com`
const SENHA = 'teste12345'

console.log('\n== duas contas, uma amizade ==')
await signUp(emailB, SENHA)
await amigos.garantirMeuPerfil({ name: 'Bia', bio: '', accent: '#8b5cf6', avatar: '' })
const pB = await amigos.meuPerfil()
check('B tem código', Boolean(pB?.code), pB?.code)

await signUp(emailA, SENHA)
await amigos.garantirMeuPerfil({ name: 'Ana', bio: '', accent: '#8b5cf6', avatar: '' })
const pedido = await amigos.enviarPedido(pB.code, 'oi')
check('A mandou pedido para B', pedido?.ok !== false, pedido?.error || '')

await signIn(emailB, SENHA)
const pend = await amigos.listarPedidos()
check('B recebeu o pedido', (pend?.recebidos?.length || 0) >= 1, `recebidos=${pend?.recebidos?.length}`)
const aceito = await amigos.responderPedido(pend.recebidos[0].id, true)
check('B aceitou', aceito?.ok !== false, aceito?.error || '')

console.log('\n== a música de A tem capa do ARQUIVO, sem link do iTunes ==')
await signIn(emailA, SENHA)
const uidA = (await import('../src/lib/account.js')).getUserId
const euA = await uidA()
store.set('nt.sync.owner', euA)
store.set('nt.library', JSON.stringify([
  { id: 't1', sid: 't1', title: 'So Comigo', artist: 'Zeca', plays: 12, fav: false, coverShare: MIN, coverRemote: null, cover: ['#111', '#222'] },
]))
await syncNow()
const guardado = JSON.parse(store.get('nt.sync.merged') || '{}')
const linhas = guardado.merged?.library || guardado.library || []
const capa = linhas.find((x) => x.sid === 't1')?.coverRemote || ''
check('a miniatura foi enviada para a nuvem', capa.startsWith('data:'),
  `coverRemote=${String(capa).slice(0, 22)}`)

console.log('\n== o amigo vê a capa ==')
await signIn(emailB, SENHA)
const perfil = await amigos.verPerfilAmigo(euA)
const top = perfil?.estatisticas?.top || []
check('o perfil tem "mais tocadas"', top.length >= 1, `top=${top.length}`)
const comCapa = top.find((t) => typeof t.capa === 'string' && t.capa.startsWith('data:'))
check('a capa que aparece é uma miniatura', Boolean(comCapa), comCapa ? `${comCapa.capa.slice(0, 24)}…` : 'veio sem capa')

console.log(`\n${ok}/${ok + bad} verificações passaram`)
console.log(bad === 0
  ? '\n✅ A capa do arquivo aparece no perfil do amigo.'
  : '\n❌ A capa ainda não aparece. Rode COLE-ISSO-NO-SUPABASE-4.txt no Supabase.')
process.exit(bad ? 1 : 0)
