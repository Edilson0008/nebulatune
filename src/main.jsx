import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Reset de fábrica ONE-SHOT (v1.9.7): na primeira abertura desta versão, o app
// limpa o aparelho de verdade — apaga chaves órfãs que versões antigas deixavam
// no navegador (biblioteca, favoritos, playlists, gatinho, ajustes, letras) e
// a sessão antiga, virando "de fábrica" e confirmando o pedido do usuário de
// não guardar nada no celular.
// A biblioteca NÃO mora mais aqui: nada é salvo no aparelho — dados vêm da
// conta (nuvem) sob demanda.
// Obs.: NÃO apagamos o IndexedDB aqui de propósito — a migração dos dados
// legados de OUTROS usuários lê as linhas antigas (index.json) no primeiro
// login; o migrate do cloud.js apaga esses arquivos por conta, sozinho.
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    if (!localStorage.getItem('nt.v2reset')) {
      const FABRICA = /^localStorage\b/ 
      const keys = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)
        if (k) keys.push(k)
      }
      keys.forEach((k) => {
        try {
          localStorage.removeItem(k)
        } catch {
          /* chave presa */
        }
      })
      try {
        localStorage.setItem('nt.v2reset', '1')
      } catch {
        /* armazenamento indisponível */
      }
      // Depois que limpa, recarrega uma vez para o app montar com tudo zerado.
      if (typeof location !== 'undefined') window.location.reload()
    }
  } catch {
    /* armazenamento indisponível */
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
