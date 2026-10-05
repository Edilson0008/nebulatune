// A tela "Adicionar músicas a uma playlist" saia torta e cortada pela tela.
//
// O motivo esta no CSS, e nao no componente: o `TrackPicker` usava so `.modal`,
// que nao tem teto de altura nem de largura. A lista (`max-height: 60vh`) empurrava
// titulo e botoes para fora, e o `place-items: center` do fundo cortava o topo e
// a baixo. O `.device-import-modal` e o `.shop-modal` ja tinham a correcao; este
// aqui ficou de fora.
//
// O teste le o CSS e o JSX de verdade: se alguem tirar a regra, ele falha.
import fs from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')
const css = fs.readFileSync(path.join(raiz, 'src/App.css'), 'utf8')
const jsx = fs.readFileSync(path.join(raiz, 'src/components/library-ui.jsx'), 'utf8')

function bloco(sel, alvo = css) {
  const i = alvo.indexOf(sel)
  if (i < 0) return null
  const j = alvo.indexOf('{', i)
  if (j < 0) return null
  const k = alvo.indexOf('}', j)
  return k < 0 ? null : alvo.slice(j + 1, k)
}

const falhou = []
const ok = (c, m) => {
  if (!c) falhou.push(m)
}

// --- a classe precisa estar no componente, senao o CSS nao faz nada
ok(
  /className="modal track-picker-modal"/.test(jsx),
  'a classe track-picker-modal nao esta no componente TrackPicker',
)

// --- o modal tem que caber na tela nas duas pontas
const modal = bloco('.track-picker-modal {') || ''
ok(/max-height:\s*calc\(100dvh/.test(modal), 'o modal nao tem teto de altura pela tela')
ok(
  /max-height:[^;]*env\(safe-area-inset-bottom\)/.test(modal),
  'o modal ignora a barra de navegacao (safe-area-inset-bottom)',
)
ok(/max-width:\s*calc\(100vw/.test(modal), 'o modal nao tem teto de largura pela tela')
ok(/flex-direction:\s*column/.test(modal), 'o modal nao e coluna, entao a lista nao cede espaco')

// --- a lista e quem rola, e cede espaco
const lista = bloco('.track-picker-modal .track-picker-list {') || ''
ok(/min-height:\s*0/.test(lista), 'a lista nao pode encolher (falta min-height: 0)')
ok(/max-height:\s*none/.test(lista), 'a lista ainda tem o teto antigo de altura')
ok(/overflow-y:\s*auto/.test(lista), 'a lista nao rola')

// --- titulo e acoes fixos, para a lista ser a unica parte que mexe
const fixos = bloco('.track-picker-modal > .modal-title,\n.track-picker-modal > .modal-actions {') || ''
ok(/flex:\s*0 0 auto/.test(fixos), 'titulo/acoes estao podendo encolher e sumir')

// --- nome de playlist comprido nao pode estourar a largura
const titulo = bloco('.track-picker-modal > .modal-title {') || ''
ok(
  /overflow-wrap:\s*anywhere/.test(titulo),
  'o nome da playlist pode estourar a largura da caixa',
)

// --- o CSS precisa continuar bem formado
ok(
  (css.match(/{/g) || []).length === (css.match(/}/g) || []).length,
  'o App.css ficou com chave de abrir/fechar desbalanceada',
)

if (falhou.length) {
  console.error('FALHAS:\n- ' + falhou.join('\n- '))
  process.exit(1)
}
console.log('ok: a tela de adicionar música na playlist cabe na tela')
