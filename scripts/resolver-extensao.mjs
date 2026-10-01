// Deixa o Node aceitar import sem extensão, como o Vite faz no app.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.endsWith('.js') && !specifier.endsWith('/')) {
    const base = new URL(specifier, context.parentURL)
    if (!existsSync(fileURLToPath(base)) && existsSync(fileURLToPath(new URL(`${base.href}.js`)))) {
      return next(`${specifier}.js`, context)
    }
  }
  return next(specifier, context)
}
