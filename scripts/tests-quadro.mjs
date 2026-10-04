// Leitura de layout por quadro: o defeito que sobrou depois do blur.
//
// Ler o tamanho/posição de um elemento (`getBoundingClientRect`, `clientWidth`,
// `offsetWidth`) obriga o navegador a refazer o layout, mesmo que nada tenha
// mudado de tamanho. Fazendo isso dentro de um laço que roda a cada quadro, o
// custo vira 60 layouts por segundo para sempre — e aí o app congela em
// aparelhos mais lentos, mesmo com o JavaScript quase parado.
//
// Foi o que faltava depois de tirar o blur do fundo:
//   - `NowParticles` e `Visualizer` ("Tocando agora") mediam o canvas por quadro.
//   - `SpaceParticles` (fundo do app) lia `clientWidth`/`clientHeight` por quadro
//     e ainda apagava a tela inteira 60x/s em dpr 2.
//   - `petMove` (arrastar o gato) media a cena DUAS vezes por evento de dedo.
//
// A regra: quem agenda `requestAnimationFrame` não mede elemento. Se o tamanho
// pode mudar, mede no `resize`/rotação e guarda o valor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('../src/', import.meta.url)
const ARQUIVOS = [
  'components/visualizer.jsx',
  'components/background.jsx',
  'components/now-playing.jsx',
  'components/pet.jsx',
  'components/pet-habitat-view.jsx',
]

const MEDIR = /getBoundingClientRect|\bclientWidth\b|\bclientHeight\b|\boffsetWidth\b|\boffsetHeight\b|\bscrollWidth\b|\bscrollHeight\b/

/** Commentários não são código: `// getBoundingClientRect` numa nota não mede. */
function semComentario(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Corpo de cada `function nome(...) {}` / `const nome = (...) => {}`. */
function corpos(texto) {
  const limpo = semComentario(texto)
  const achados = []
  const re = /(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{/g
  let m
  while ((m = re.exec(limpo))) {
    const nome = m[1] || m[2]
    const abre = re.lastIndex
    let i = abre
    let prof = 1
    while (i < limpo.length && prof > 0) {
      const c = limpo[i]
      if (c === '{') prof += 1
      else if (c === '}') prof -= 1
      i += 1
    }
    achados.push({ nome, corpo: limpo.slice(abre, i - 1) })
    re.lastIndex = i
  }
  return achados
}

test('nenhum laço de quadro mede o layout de um elemento', () => {
  const problemas = []
  let loopsVistos = 0

  for (const arq of ARQUIVOS) {
    let texto
    try {
      texto = readFileSync(new URL(arq, RAIZ), 'utf8')
    } catch {
      continue
    }
    for (const { nome, corpo } of corpos(texto)) {
      // Só quem agenda o próximo quadro é laço; `medir`/`resize` medem e pronto,
      // e é exatamente aí que a medição deve ficar.
      if (!/requestAnimationFrame/.test(corpo)) continue
      loopsVistos += 1
      if (MEDIR.test(corpo)) {
        problemas.push(`${arq}: '${nome}' agenda quadro E mede layout no mesmo corpo`)
      }
    }
  }

  assert.ok(loopsVistos > 0, 'esperava achar algum laço de quadro; se nao ha, este teste parou de olhar')
  assert.deepEqual(problemas, [], `medir layout dentro do laço = 60 layouts/s:\n${problemas.join('\n')}`)
})

test('arrastar o gato nao mede a cena a cada evento de dedo', () => {
  const habitat = readFileSync(new URL('components/pet-habitat-view.jsx', RAIZ), 'utf8')
  const petMove = corpos(habitat).find((f) => f.nome === 'petMove')
  assert.ok(petMove, 'nao achei petMove no habitat')

  // `petMove` roda por evento de dedo, entao nao pode medir nada: o retangulo
  // vem do cache (medido no resize e no inicio do arraste).
  assert.doesNotMatch(
    petMove.corpo,
    MEDIR,
    'petMove mede o layout a cada dedo; use o retangulo em cache (sceneRect)',
  )

  // E o `overCat`, chamado de dentro do arraste, tambem nao pode medir.
  const overCat = corpos(habitat).find((f) => f.nome === 'overCat')
  if (overCat) {
    assert.doesNotMatch(
      overCat.corpo,
      /getBoundingClientRect/,
      'overCat mede o layout dentro do arraste; receba o retangulo pronto',
    )
  }
})

test('o canvas do fundo nao apaga a tela em resolucao dobrada', () => {
  const fundo = readFileSync(new URL('components/background.jsx', RAIZ), 'utf8')
  // dpr 2 dobrava os pixels apagados por quadro sem diferenca visivel: sao
  // pontinhos suaves de poucos pixels.
  assert.match(
    fundo,
    /const dpr = 1\b/,
    'o canvas do fundo deve desenhar em dpr 1',
  )
  assert.doesNotMatch(
    semComentario(fundo),
    /Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*2\)/,
    'o canvas do fundo nao deve voltar para dpr 2',
  )
})
