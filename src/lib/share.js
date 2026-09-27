import { blobToDataUrl } from '../backup'
import { Directory, Filesystem } from '@capacitor/filesystem'

export async function shareBlobNative(blob, fileName, meta) {
  const dataUrl = await blobToDataUrl(blob)
  const base64 = dataUrl ? dataUrl.split(',')[1] : ''
  if (!base64) throw new Error('arquivo vazio')
  const safeName = (fileName || 'arquivo').replace(/[^\w\-. ]+/g, '_').slice(-90)
  await Filesystem.writeFile({
    path: safeName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  })
  const { uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache })
  await CapShare.share({ ...meta, files: [uri] })
}
