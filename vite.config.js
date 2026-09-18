import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// WEB_BASE é usado só na publicação da web (GitHub Pages usa /nebulatune/).
// No app Android fica '/' (padrão).
export default defineConfig({
  base: process.env.WEB_BASE || '/',
  plugins: [react()],
})
