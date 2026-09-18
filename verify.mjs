import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.json':'application/json', '.map':'application/json', '.woff2':'font/woff2' }

const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url||'/').split('?')[0])
    if (p.includes('..')) { res.writeHead(403); res.end(); return }
    if (p === '/') p = '/index.html'
    const f = join(root, p)
    const b = await readFile(f)
    res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' })
    res.end(b)
  } catch { res.writeHead(404); res.end('nf') }
})
await new Promise((r) => srv.listen(4396, () => r()))

const res = spawnSync(
  'chromium',
  ['--headless=new','--no-sandbox','--disable-gpu','--enable-logging=stderr','--virtual-time-budget=9000','--dump-dom','http://127.0.0.1:4396/'],
  { encoding: 'utf8', timeout: 55000 },
)
srv.close()
const dom = res.stdout || ''
const errs = (res.stderr || '').split('\n')
  .map((l) => l.replace(/^.*CONSOLE:\d+\] /, ''))
  .filter((l) => /ReferenceError|TypeError|Uncaught|Cannot access|before initialization/is.test(l))
console.log('exit:', res.status)
console.log('DOM len:', dom.length)
console.log('tem Início:', dom.includes('>Início</'), '| tem Biblioteca:', dom.includes('Biblio'), '| tem Configurações:', dom.includes('Config'))
console.log('erros de console:', errs.slice(0, 4).length)
errs.slice(0, 4).forEach((e) => console.log('   ERRO:', e.slice(0, 160)))
console.log('APK public:', (await new Promise((rres) => rres()))
  ? '' : '')
process.exit(0)
