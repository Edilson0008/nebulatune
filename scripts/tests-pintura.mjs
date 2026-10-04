// Pintura: nenhuma animação contínua pode carregar blur nem mix-blend-mode.
//
// O sintoma é o travamento de tela no aparelho, e ele nunca aparece no lint nem
// nos testes: o código está "certo", o build passa, e o que trava é o navegador
// repintando. Duas coisas causam isso e as duas já mordem aqui:
//
//   1. `filter: blur(70px)` em três nebulas que animam transform sem parar. Um
//      desfoque é recalculado por quadro, e cada quadro é uma repintura de uma
//      camada de 60vw. Pior: as nebulas já são radial-gradient com
//      `transparent 65%`, então o desfoque não desenhava nada de novo. Era
//      trabalho puro.
//   2. `mix-blend-mode: screen` em camada de tela inteira girando, que obriga o
//      navegador a misturar cada pixel com o que está embaixo, todo quadro.
//
// O `mix-blend-mode` do modo de baixo consumo (App.css) só desligava
// `animation` e `backdrop-filter`: o `filter: blur` continuava sendo aplicado.
//
// Isto lê o App.css de verdade e falha se alguém reintroduzir os dois. Sem este
// teste, a reintrodução passa limpa e o problema só volta a aparecer no aparelho.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
// Comentário não é declaração: `SEM filter: blur()` numa nota explicativa não
// pode ser confundido com o blur de volta.
const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, '')

function blocos(cssTexto) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(cssTexto))) out.push({ seletor: m[1].trim(), corpo: m[2] })
  return out
}

// Ele se move sozinho (animation ... infinite). A regra só vale para essas.
const MOVE = /\banimation\b[^;]*\binfinite\b/

test('nenhuma animação contínua carrega filter: blur', () => {
  const infr = blocos(semComentario).filter((b) => MOVE.test(b.corpo))
  assert.ok(infr.length > 0, 'esperava animação contínua no App.css; se não há, este teste parou de olhar')

  const infragueis = infr.filter((b) => /filter:\s*blur/.test(b.corpo)).map((b) => b.seletor)
  assert.deepEqual(infragueis, [], `blur em camada que se move sozinho repinta a tela a cada quadro:\n${infragueis.join('\n')}`)
})

test('nenhuma animação contínua carrega mix-blend-mode', () => {
  const infr = blocos(semComentario).filter((b) => MOVE.test(b.corpo))
  const misturados = infr.filter((b) => /mix-blend-mode/.test(b.corpo)).map((b) => b.seletor)
  assert.deepEqual(misturados, [], `mix-blend-mode em camada animada força mistura por pixel todo quadro:\n${misturados.join('\n')}`)
})

test('a nebulosa e a galaxia continuam sendo gradiente suave (o desenho nao sumiu)', () => {
  // O conserto trocou o desfoque por mais passos de gradiente. Se alguem apagar
  // o radial-gradient achando que o blur fazia o desenho, a tela fica com um
  // disco de cor chapado.
  const nebulosa = blocos(semComentario).filter((b) => /^\.bg-nebula-\d$/.test(b.seletor))
  assert.ok(nebulosa.length >= 3, `esperava as 3 nebulas, achei ${nebulosa.length}`)
  for (const n of nebulosa) {
    assert.match(n.corpo, /radial-gradient/, `${n.seletor} perdeu o gradiente suave`)
  }
  const nebulosaBase = blocos(semComentario).find((b) => b.seletor === '.bg-nebula')
  assert.ok(nebulosaBase, 'faltou .bg-nebula')
  assert.match(nebulosaBase.corpo, /border-radius:\s*50%/, '.bg-nebula precisa continuar arredondada')
})
