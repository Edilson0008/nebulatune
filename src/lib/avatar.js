// Foto do perfil: a tela mostra ela pequena (perfil, lista de amigos, pedido de
// amizade). Guardar o arquivo original inteiro pesa o localStorage e deixa a
// lista de amigos lenta, então reduzimos para 256px webp (~20-40 KB) já na hora
// de escolher a foto — e não só na hora de subir para o servidor.
const MAX = 256
const QUALIDADE = 0.82

const ehImagem = (v) => typeof v === 'string' && /^data:image\//.test(v)

const paraDataUrl = (entrada) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Não deu para ler a imagem'))
    r.readAsDataURL(entrada)
  })

const carregarImagem = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagem inválida'))
    img.src = src
  })

// Nunca lança: se não conseguir reduzir, devolve o que recebeu. Perder a foto
// por causa de um erro de imagem seria pior do que ficar com ela grande.
export async function reduzirAvatar(entrada, max = MAX) {
  if (!entrada) return ''
  try {
    const original = ehImagem(entrada) ? entrada : await paraDataUrl(entrada)
    if (!ehImagem(original)) return ''
    const img = await carregarImagem(original)
    const escala = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * escala))
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    // Safari/antigo não faz webp: cai para jpeg, que sempre sai.
    const webp = canvas.toDataURL('image/webp', QUALIDADE)
    const mini = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALIDADE)
    return mini.length && mini.length < original.length ? mini : original
  } catch {
    return ehImagem(entrada) ? entrada : ''
  }
}

// O que vai para o banco: nunca enviar um data URL gigante (foto antiga, antes
// desta redução existir) porque a linha engorda e a lista de amigos trava.
const LIMITE_ENVIO = 200_000

export async function avatarParaEnvio(avatar) {
  if (!avatar) return ''
  if (typeof avatar === 'string' && avatar.length <= LIMITE_ENVIO) return avatar
  const mini = await reduzirAvatar(avatar)
  return mini.length <= LIMITE_ENVIO ? mini : ''
}
