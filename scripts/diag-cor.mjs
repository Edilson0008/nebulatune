// A cor que o outro vê no card tem que ser a COR que a pessoa está usando.
//
// Antes, o que ia para o banco era `customAccent || accent`: para quem usa tema
// pronto isso é a PALAVRA do tema ('red', 'pink'), não uma cor. O card do amigo
// recebia uma palavra e caía no azul padrão — ou seja, quem usava tema vermelho
// viajava com a borda azul. E, ao voltar para um tema depois de usar cor
// personalizada, a cor velha continuava mandando.
// `settings.js` importa './localstore' sem a extensão (padrão do Vite). O Node
// puro não resolve isso, então este arquivo vira o próprio carregador.
import { register } from 'node:module'

register(new URL('./resolver-extensao.mjs', import.meta.url), {
  parentURL: import.meta.url,
})

const { ACCENTS, corPublicavel, resolveAccent } = await import('../src/settings.js')

const HEX = /^#[0-9a-f]{6}$/i
let ok = 0
let bad = 0
const check = (nome, cond, extra = '') => {
  if (cond) {
    ok += 1
    console.log(`   ✅ ${nome}${extra ? ` — ${extra}` : ''}`)
  } else {
    bad += 1
    console.log(`   ❌ ${nome}${extra ? ` — ${extra}` : ''}`)
  }
}

console.log('\n== tema pronto tem que virar uma COR (hex), não a palavra ==')
for (const k of Object.keys(ACCENTS)) {
  const v = corPublicavel({ accent: k })
  check(`tema ${k} publica hex`, HEX.test(v), v)
  check(`tema ${k} publica a cor certa`, v === ACCENTS[k].accent)
}

console.log('\n== sem configuração, e com tema inválido ==')
check('sem nada, cai no violeta', corPublicavel({}) === ACCENTS.violet.accent, corPublicavel({}))
check('tema desconhecido cai no violeta', corPublicavel({ accent: 'xixi' }) === ACCENTS.violet.accent)
check('settings nulo não quebra', corPublicavel(null) === ACCENTS.violet.accent)

console.log('\n== cor personalizada continua valendo ==')
check('custom válida é usada', corPublicavel({ accent: 'custom', customAccent: '#ff0000' }) === '#ff0000')
check('custom inválida não vaza pro card', HEX.test(corPublicavel({ accent: 'custom', customAccent: 'lixo' })))

console.log('\n== voltar ao tema apaga a cor personalizada que sobrou ==')
// É o que `setAccent` monta hoje: troca o tema e limpa `customAccent`.
const depoisDeTrocar = { accent: 'red', customAccent: '' }
check('era vermelho custom, agora publica o vermelho do tema', corPublicavel(depoisDeTrocar) === ACCENTS.red.accent, corPublicavel(depoisDeTrocar))
check('a cor custom antiga não manda mais', corPublicavel(depoisDeTrocar) !== '#ff0000')

console.log('\n== o card tem que bater com a tela da pessoa ==')
for (const k of Object.keys(ACCENTS)) {
  // Resíduo de quando a pessoa tinha cor personalizada e depois trocou de tema.
  const st = { accent: k, customAccent: '#ff0000' }
  check(`${k}: publicado == tela`, corPublicavel(st) === resolveAccent(st).accent, `${corPublicavel(st)} vs ${resolveAccent(st).accent}`)
}
const stC = { accent: 'custom', customAccent: '#123456' }
check('custom: publicado == tela', corPublicavel(stC) === resolveAccent(stC).accent)

console.log('\n== não pode publicar a palavra do tema ==')
for (const k of Object.keys(ACCENTS)) {
  check(`"${k}" não é publicado como está`, corPublicavel({ accent: k }) !== k)
}

console.log(`\n${ok}/${ok + bad} verificações passaram`)
console.log(bad === 0 ? '\n✅ A cor do card é a cor do tema da pessoa.' : '\n❌ A cor do card ainda não bate com o tema.')
process.exit(bad === 0 ? 0 : 1)
