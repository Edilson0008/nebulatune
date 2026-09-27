import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appConfig = readFileSync(new URL('./src/app-config.js', import.meta.url), 'utf8')
const appVersion = (appConfig.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1] || '0'

// Grava a versão do app dentro do sw.js no build, para o cache offline ser
// invalidado sozinho quando a versão sobe (estava travado em 1.9.26).
// O sw.js vem da pasta public/, que o Vite copia depois do bundle, por isso
// a troca é feita no arquivo já gravado em dist/.
const swVersion = () => ({
  name: 'nebulatune-sw-version',
  apply: 'build',
  closeBundle() {
    const out = new URL('./dist/sw.js', import.meta.url)
    if (!existsSync(out)) return
    const src = readFileSync(out, 'utf8')
    const fixed = src.replaceAll('__APP_VERSION__', appVersion)
    if (fixed !== src) writeFileSync(out, fixed)
  },
})

// https://vite.dev/config/
// WEB_BASE é usado só na publicação da web (GitHub Pages usa /nebulatune/).
// No app Android fica '/' (padrão).
export default defineConfig({
  base: process.env.WEB_BASE || '/',
  plugins: [react(), swVersion()],
})
