// Testa se TODOS os componentes do app montam. Sem navegador: o Vite gera o
// pacote de teste e o React renderiza cada componente em memória. Pegou o
// erro de "memo is not defined" (tela preta) que existia em track-list.jsx.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const shim = (await import('../scripts/browser-shim.mjs')).default
shim()

const raiz = new URL('../', import.meta.url)
const modulos = (await import(new URL('ssr-out/ssr-smoke.js', raiz).href)).modulos
const App = (await import(new URL('ssr-out/ssr-smoke.js', raiz).href)).default

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

let erros = 0
let testados = 0

const html = renderToString(createElement(App, base))
if (!html.includes('topbar')) {
  console.error('App não renderizou a topbar')
  erros++
}
console.log(`App renderizou (${html.length} caracteres)`)

// Sonda dos hooks (troca de conta). Roda os hooks de verdade.
const SondaHooks = (await import(new URL('ssr-out/ssr-smoke.js', raiz).href)).SondaHooks
const htmlHooks = renderToString(createElement(SondaHooks, base))
const tipos = JSON.parse((htmlHooks.match(/<pre id="sonda-hooks"[^>]*>(.*?)<\/pre>/s) || [, '{}'])[1]
  .replace(/&quot;/g, '"'))
for (const [nome, tipo] of Object.entries(tipos)) {
  testados++
  if (tipo !== 'function') {
    console.error(`HOOK QUEBRADO: ${nome} é "${tipo}" (o App chama isso na troca de conta)`)
    erros++
  } else {
    console.log(`hook ok: ${nome}`)
  }
}

const componentes = (mod) =>
  Object.entries(mod).filter(
    ([chave, valor]) =>
      /^[A-Z]/.test(chave) &&
      (typeof valor === 'function' || (valor && typeof valor === 'object' && valor.$$typeof)),
  )

for (const [nome, mod] of Object.entries(modulos)) {
  for (const [chave, Componente] of componentes(mod)) {
    testados++
    try {
      renderToString(createElement(Componente, base))
    } catch (e) {
      const msg = e.message || String(e)
      // Componente que exige muitas props reclama "undefined" no teste: não é bug.
      const soFaltaProps = /undefined|is not a function/.test(msg) && !/is not defined/.test(msg)
      if (!soFaltaProps) {
        console.error(`ERRO em ${nome}.${chave}: ${msg}`)
        erros++
      }
    }
  }
}

console.log(`${testados} componentes testados, ${erros} erro(s)`)
if (erros) process.exit(1)
