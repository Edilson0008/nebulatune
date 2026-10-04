import { blobToDataUrl } from '../backup'
import { Directory, Filesystem } from '@capacitor/filesystem'
// O plugin Share nunca era importado aqui: `CapShare.share(...)` era uma
// referência solta e estourava ReferenceError ao compartilhar um arquivo.
import { Share as CapShare } from '@capacitor/share'

export async function shareBlobNative(blob, fileName, meta) {
  const done = await shareFilesNative([{ blob, name: fileName }], meta)
  if (!done) throw new Error('arquivo vazio')
}

export async function shareFilesNative(files, meta) {
  const list = (files || []).filter((f) => f && f.blob && f.blob.size > 0)
  if (!list.length) return false
  const uris = []
  for (const f of list) {
    try {
      const dataUrl = await blobToDataUrl(f.blob)
      const base64 = dataUrl ? dataUrl.split(',')[1] : ''
      if (!base64) continue
      const safeName = (f.name || 'arquivo').replace(/[^\w\-. ]+/g, '_').slice(-90)
      await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      })
      const { uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache })
      uris.push(uri)
    } catch {
      // um arquivo que falhou não derruba o restante
    }
  }
  if (!uris.length) return false
  await CapShare.share({ ...meta, files: uris })
  return true
}