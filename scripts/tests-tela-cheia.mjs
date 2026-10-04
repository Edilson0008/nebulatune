// Nao mede nada: confere as REGRAS do CSS que impedem o modal de passar da tela.
import fs from 'node:fs'
const css = fs.readFileSync('src/App.css', 'utf8')

function corpo(sel) {
  const i = css.indexOf(sel + ' {')
  if (i < 0) return ''
  const abre = css.indexOf('{', i)
  const fecha = css.indexOf('}', abre)
  if (fecha < 0) return ''
  // sem comentarios: o CSS deste projeto explica bastante dentro de /* */
  return css.slice(abre + 1, fecha).replace(/\/\*[\s\S]*?\*\//g, '')
}

const falhou = []
const ok = (cond, msg) => { if (!cond) falhou.push(msg) }

const imp = corpo('.device-import-modal')
ok(/max-width:\s*calc\(100vw/.test(imp), 'modal do importador sem teto pela largura da tela')

const cnt = corpo('.playlist-picker-count')
ok(!/flex-shrink:\s*0/.test(cnt), 'contador ainda com flex-shrink: 0 (artista longo estoura a tela)')
ok(/text-overflow:\s*ellipsis/.test(cnt), 'contador sem reticencias')

const nome = corpo('.playlist-picker-name')
ok(/min-width:\s*0/.test(nome), 'nome sem min-width: 0 (nao encolhe)')

const overlay = corpo('.modal-overlay')
ok(/position:\s*fixed/.test(overlay), 'overlay nao e fixed')
ok(/inset:\s*0/.test(overlay), 'overlay nao cobre a tela toda')

const item = corpo('.playlist-picker-row')
ok(/width:\s*100%/.test(item), 'linha sem width 100%')

const pill = corpo('.mg-trof-pill')
ok(pill.length > 0, 'botao de conquistas centralizado sem estilo')
const centro = corpo('.mg-trof-centro')
ok(/justify-content:\s*center/.test(centro), 'faixa do trofeu nao centraliza')
ok(!/^\.mg-trof-btn \{/m.test(css), 'ainda existe o botao de trofeu no canto')

if (falhou.length) { console.error('FALHAS:\n- ' + falhou.join('\n- ')); process.exit(1) }
console.log('ok: modal cabe na tela e o trofeu esta centralizado')
