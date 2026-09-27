export const TRANS_KEY = 'nt.trans'

export let transCache = {}

export function transCacheLoad() {
  if (transCache) return transCache
  return transCache
}

export function transCacheSave() {
  const entries = Object.entries(transCache || {})
  if (entries.length > 600) {
    transCache = Object.fromEntries(entries.slice(entries.length - 600))
  }
}
