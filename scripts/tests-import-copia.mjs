// Confere que o plugin novo nao manda conteudo de arquivo pela ponte, e que o
// JS le o caminho. Le os dois arquivos-fonte de verdade.
import fs from 'node:fs'
const java = fs.readFileSync(
  'android/app/src/main/java/br/com/nebulatune/app/MediaImporterPlugin.java',
  'utf8',
)
const js = fs.readFileSync('src/mediaImport.js', 'utf8')
const falhou = []
const ok = (c, m) => { if (!c) falhou.push(m) }

// --- lado Android ---
ok(!/Base64/.test(java), 'ainda converte o arquivo em Base64')
ok(!/readFile/.test(java), 'ainda tem o readFile que lia tudo')
ok(/copiarArquivo/.test(java), 'faltou copiarArquivo')
ok(/FileOutputStream/.test(java), 'nao grava o arquivo com FileOutputStream')
ok(/out\.put\("path"/.test(java), 'nao devolve o caminho para o JS')
ok(/out\.put\("size"/.test(java), 'nao devolve o tamanho')
ok(/OutOfMemoryError/.test(java), 'sem tratamento de falta de memoria')
// o loop tem que ler em pedacos, nao "ler tudo de uma vez"
ok(/while \(\(n = in\.read\(chunk\)\) > 0\)/.test(java), 'nao copia em pedacos')

// --- lado JavaScript ---
ok(/convertFileSrc/.test(js), 'nao usa convertFileSrc para ler o caminho')
ok(/fetch\(url\)/.test(js), 'nao le o arquivo com fetch')
ok(/!blob\.size/.test(js), 'nao verifica se o blob veio vazio')
// compatibilidade: APK antigo ainda devolve base64 e precisa funcionar
ok(/res\?\.base64/.test(js), 'perdeu a compatibilidade com o APK antigo (base64)')

// --- o App consome os dois formatos ---
const app = fs.readFileSync('src/App.jsx', 'utf8')
ok(/res\?\.blob \|\| dataUrlToBlob/.test(app), 'o App nao aceita blob nem base64')
ok(/falhas \+= 1/.test(app), 'o App ainda engole a falha em silencio')
ok(/Não consegui ler nenhuma dessas músicas/.test(app), 'sem aviso quando nada entra')

if (falhou.length) { console.error('FALHAS:\n- ' + falhou.join('\n- ')); process.exit(1) }
console.log('ok: o audio vai por arquivo, a ponte so carrega o caminho')
