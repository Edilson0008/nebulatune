// Código de amigo: 5 letras legíveis e estáveis a partir do uid (uuid v4).
// Estável = não muda de um aparelho pro outro; legível = sem letras parecidas
// (I/O/0/1 fora). Serve só para ACHAR o perfil público — não dá acesso a nada
// privado (o pedido precisa ser aceito).
const FONTE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const PREFIXO_CODIGO = 'NEBU-'

export const normalizarCodigo = (codigo) =>
  String(codigo || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

// Devolve o código no formato exato que fica no banco (NEBU-XXXXX), aceitando
// digitações com/sem o traço, minúsculas ou mesmo sem o prefixo NEBU.
export function formatarCodigo(codigo) {
  const n = normalizarCodigo(codigo)
  const base = n.startsWith('NEBU') ? n.slice(4) : n
  return `${PREFIXO_CODIGO}${base}`
}

// Espalha todos os caracteres hex do uid por 5 "baldes" usando só aritmética
// de 32 bits (determinístico em qualquer runtime).
export function gerarCodigo(uid) {
  const s = String(uid || '').replace(/[^0-9a-f]/gi, '')
  const balde = [0, 0, 0, 0, 0]
  for (let k = 0; k < s.length; k += 1) {
    const v = parseInt(s[k], 16)
    const b = k % 5
    balde[b] = ((balde[b] * 31 + v + k) >>> 0) % 100000
  }
  return PREFIXO_CODIGO + balde.map((b) => FONTE[b % FONTE.length]).join('')
}