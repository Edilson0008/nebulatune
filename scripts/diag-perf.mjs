// Mede quanto cada tela custa para DESENHAR: quantos nós de DOM ela cria e
// quanto tempo leva. Sem navegador — o React renderiza em memória.
//
// Isto responde a pergunta que importa no travamento: um redesenho do App
// inteiro acontece a cada toque em qualquer tela, em cada sincronização e a
// cada relógio. Se o App for grande, esse redesenho sozinho já é um engasgo no
// celular fraco, e nenhum conserto pontual resolve: o caminho é render menos.
//
//   node scripts/diag-perf.mjs
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const shim = (await import('../scripts/browser-shim.mjs')).default
shim()

const raiz = new URL('../', import.meta.url)
const mod = await import(new URL('ssr-out/ssr-smoke.js', raiz).href)
const { modulos } = mod
const App = mod.default

const base = {
  settings: { userName: 'Teste', theme: 'dark' },
  library: [],
  petStats: { plays: 3 },
  playlists: [],
  lyricSync: {},
  settingsApi: {},
  api: {},
  tracks: [],
  track: { id: 'x', title: 'T', artist: 'A', album: 'B', duration: 100, cover: [] },
  onPlay: () => {},
  children: null,
}

// conta tags de abertura no HTML — um proxy honesto do numero de nos
const nos = (html) => (html.match(/<[a-zA-Z]/g) || []).length

// tempo por redesenho: quantas vezes o componente roda, e o custo de 1
function medir(nome, Componente, reps = 12) {
  let html = ''
  try {
    renderToString(createElement(Componente, base))
  } catch {
    return null // componente que exige props: nao da para medir
  }
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < reps; i++) html = renderToString(createElement(Componente, base))
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps
  return { nome, nos: nos(html), ms }
}

const alvos = []
alvos.push(medir('App (tela inteira)', App, 6))
for (const [modNome, modulo] of Object.entries(modulos)) {
  for (const [chave, C] of Object.entries(modulo)) {
    if (!/^[A-Z]/.test(chave)) continue
    if (typeof C !== 'function' && !(C && typeof C === 'object' && C.$$typeof)) continue
    alvos.push(medir(`${modNome}.${chave}`, C))
  }
}
const ok = alvos.filter(Boolean).sort((a, b) => b.ms - a.ms)

console.log('\n=== redesenho mais caro por tela (1 render, em Node) ===')
console.log('nós = tags de DOM criadas | tempo = 1 render\n')
for (const m of ok.slice(0, 14)) {
  const barra = '#'.repeat(Math.max(1, Math.round(m.ms * 4)))
  console.log(`${m.ms.toFixed(2).padStart(6)} ms  ${String(m.nos).padStart(5)} nós  ${m.nome}  ${barra}`)
}

const app = ok.find((m) => m.nome.startsWith('App'))
if (app) {
  console.log(`\nO App inteiro desenha ${app.nos} nós em ${app.ms.toFixed(2)} ms por redesenho.`)
  console.log('Um celular ~5x mais lento que este Node gasta ~' + (app.ms * 5).toFixed(0) + ' ms por redesenho.')
  console.log('Um redesenho do App inteiro acontece a cada toque, a cada sync e a cada relógio.')
}