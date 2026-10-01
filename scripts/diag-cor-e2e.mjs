// Prova ao vivo de que a COR que o outro vê no card é a cor do tema.
//
// Percorre os nove temas numa conta de verdade e confere o que foi gravado no
// banco. Antes o que ia para a nuvem era `customAccent || accent`, que para
// tema pronto é a PALAVRA do tema ('red'), não uma cor — o card do amigo caía
// no azul padrão. E a cor personalizada velha não era apagada ao voltar para um
// tema, então continuava mandando depois da troca.
//
// Uso: node scripts/diag-cor-e2e.mjs
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

const { signUp, signIn, getUserId, authedFetch } = await import('../src/lib/account.js')
const amigos = await import('../src/lib/amigos.js')
const { corPublicavel, ACCENTS } = await import('../src/settings.js')

const suf = Math.random().toString(36).slice(2, 7)
const emailA = `nt-cor-a-${suf}@mailinator.com`
const emailB = `nt-cor-b-${suf}@mailinator.com`
const SENHA = 'teste12345'
const HEX = /^#[0-9a-f]{6}$/i
let ok = 0
let bad = 0
const check = (nome, cond, extra = '') => {
  if (cond) { ok += 1; console.log(`   ✅ ${nome}${extra ? ` — ${extra}` : ''}`) }
  else { bad += 1; console.log(`   ❌ ${nome}${extra ? ` — ${extra}` : ''}`) }
}
const ler = async (uid) => {
  const r = await authedFetch(`/rest/v1/user_profiles?uid=eq.${uid}&select=name,bio,accent,avatar`)
  return r.data?.[0] || null
}

await signUp(emailA, SENHA)
await signUp(emailB, SENHA)
const uB = await getUserId()
// Força a sessão de volta para A, para não gravar no perfil de B.
await signIn(emailA, SENHA)
const uA = await getUserId()

// A usa tema VERMELHO pronto. O que o app publica é corPublicavel(settings).
const temaA = { accent: 'red', customAccent: '' }
await amigos.garantirMeuPerfil({ name:'Ana', bio:'b', accent: corPublicavel(temaA), avatar: '' })
await signIn(emailA, SENHA)
const linhaA = await ler(uA)
check('A tema vermelho: o banco tem a COR, não a palavra', HEX.test(linhaA.accent || ''), linhaA.accent)
check('A: a cor é a do tema vermelho', linhaA.accent===ACCENTS.red.accent, `${linhaA.accent} vs ${ACCENTS.red.accent}`)

// A tinha usado cor personalizada #00ff00 e trocou para tema vermelho
await amigos.garantirMeuPerfil({ name:'Ana', bio:'b', accent: corPublicavel({ accent: 'custom', customAccent: '#00ff00' }), avatar: '' })
const depoisCustom = await ler(uA)
check('A: com custom #00ff00 publica essa cor', depoisCustom.accent === '#00ff00', depoisCustom.accent)
// agora volta pro tema vermelho (setAccent limpa o custom)
await amigos.garantirMeuPerfil({ name:'Ana', bio:'b', accent: corPublicavel({ accent: 'red', customAccent: '' }), avatar: '' })
const depoisTema = await ler(uA)
check('A: voltar ao tema vermelho manda o vermelho, não o verde', depoisTema.accent===ACCENTS.red.accent, depoisTema.accent)
check('A: a cor personalizada antiga NÃO sobrou', depoisTema.accent !== '#00ff00')

// todos os 9 temas saem como cor válida
let todosHex = true
let todosCertos = true
for(const k of Object.keys(ACCENTS)){
  await amigos.garantirMeuPerfil({ name: 'Ana', bio: 'b', accent: corPublicavel({ accent: k }), avatar: '' })
  const l = await ler(uA)
  if (l.accent !== ACCENTS[k].accent) {
    console.log(`      (tema ${k}: esperava ${ACCENTS[k].accent}, veio ${l.accent}) uidA=${uA.slice(0,8)}`)
    const quem=await getUserId()
    console.log(`      sessao agora=${String(quem).slice(0,8)}  mesma? ${quem===uA}`)
    const quemB=await ler(uB)
    console.log(`      perfil de B: ${quemB?.accent}`)
  }
  if (!HEX.test(l.accent || '')) todosHex = false
  if (l.accent !== ACCENTS[k].accent) todosCertos = false
}
check('os 9 temas gravam hex no banco', todosHex)
check('os 9 temas gravam exatamente a cor do tema', todosCertos)

console.log(`\n${ok}/${ok + bad} verificações passaram`)
console.log(bad === 0
  ? '\n✅ A cor que o card mostra é a cor do tema da pessoa.'
  : '\n❌ A cor do card ainda não bate com o tema.')
process.exit(bad ? 1 : 0)
