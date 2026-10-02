// Comparação de verdade (não só `===`). Existe para uma coisa só: impedir que
// a sincronização redesenhe a tela à toa.
//
// O problema que ela resolve: a sync aplicava o resultado com `setAll` e afins
// INCONDICIONALMENTE a cada rodada. Cada chamada criava um objeto novo, o
// estado mudava, o efeito que agenda a sync via "ficou sujo" disparava de novo
// em 2 segundos, que aplicava de novo… um laço que não parava — e, com a conta
// recém-limpa, cada volta sobrescrevia os ajustes da pessoa pelo padrão.
export function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!deepEqual(a[k], b[k])) return false
  }
  return true
}
