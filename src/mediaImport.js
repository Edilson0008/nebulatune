import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeImport = registerPlugin('MediaImporter')
const isNative = () => Capacitor?.isNativePlatform?.() === true

export function hasNativeMediaImport() {
  return isNative()
}

export async function scanDeviceTracks() {
  if (!isNative()) return { available: false, tracks: [] }
  try {
    const out = await NativeImport.getTracks()
    const list = Array.isArray(out) ? out : out?.tracks || []
    return { available: true, tracks: list }
  } catch (e) {
    return { available: false, tracks: [], error: String(e?.message || e) }
  }
}

// Lê a música que o plugin copiou para o app.
//
// O plugin em vez de devolver o áudio em base64 (que estourava a ponte do
// Capacitor e falhava em silêncio), copia o arquivo e devolve o caminho. Aqui
// esse caminho vira um Blob lendo o arquivo direto do disco.
//
// `fetch` com um caminho `file://` não é padrão, então o Capacitor entra no
// meio: `convertFileSrc` transforma o caminho num endereço que o WebView
// entende. Sem isso, `fetch` estoura em "Network request failed".
export async function importDeviceTrack(track) {
  if (!isNative()) throw new Error('indisponível')
  const res = await NativeImport.importTrack({ id: track.id })

  // APK antigo: o plugin ainda devolvia base64. Serve para não quebrar quem
  // ainda não atualizou.
  if (res?.base64) return { base64: res.base64, mime: res.mime, path: null }

  const caminho = res?.path
  if (!caminho) throw new Error('O plugin não devolveu o arquivo da música')

  const url = Capacitor.convertFileSrc(caminho)
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error('Não consegui ler a música do aparelho')
  const blob = await resposta.blob()
  if (!blob || !blob.size) throw new Error('A música do aparelho veio vazia')

  return { base64: null, mime: res.mime || blob.type || 'audio/mpeg', path: caminho, blob }
}