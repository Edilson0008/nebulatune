import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const puppeteer = require('/tmp/pptr/node_modules/puppeteer-core')

globalThis.FileReader = class {
  readAsDataURL(b) {
    b.arrayBuffer().then((buf) => {
      this.result = `data:${b.type};base64,${Buffer.from(buf).toString('base64')}`
      this.onload && this.onload()
    })
  }
}

const { signInEmail, getSession, pullBackup } = await import('./cloud.mjs')
await signInEmail('bot-teste-nebulatune@example.com', 'teste123456')
const { user } = await getSession()
const favsOf = (b) => Object.fromEntries((b.tracks || []).map((t) => [t.id, t.fav === true]))

const b0 = await pullBackup(user.id)
console.log('nuvem antes:', JSON.stringify(favsOf(b0)), 'updatedAt', b0.exportedAt)

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 412, height: 900 })
const logs = []
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message))
page.on('console', (m) => {
  if (/nt-sync/.test(m.text())) logs.push(m.text())
})
await page.goto('https://edilson0008.github.io/nebulatune/', { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => localStorage.setItem('nt.view', 'configuracoes'))
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForSelector('.auth-input', { timeout: 20000 })
const inputs = await page.$$('.auth-input')
await inputs[0].type('bot-teste-nebulatune@example.com')
await inputs[1].type('teste123456')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => x.type === 'submit' && /entrar/i.test(x.textContent),
  )
  b && b.click()
})
await new Promise((r) => setTimeout(r, 10000))
await page.evaluate(() => localStorage.setItem('nt.view', 'inicio'))
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 6000))

const info = await page.evaluate(() => {
  const b = document.querySelector('.row-fav')
  if (!b) return null
  const row = b.closest('tr') || b.parentElement
  return { pressed: b.getAttribute('aria-pressed'), titulo: row?.innerText?.split('\n')[0] || '' }
})
console.log('botao favorito:', JSON.stringify(info))
await page.evaluate(() => document.querySelector('.row-fav')?.click())
await new Promise((r) => setTimeout(r, 1000))
const pressedDepois = await page.evaluate(() =>
  document.querySelector('.row-fav')?.getAttribute('aria-pressed'),
)
console.log('aria-pressed depois do clique:', pressedDepois)

await new Promise((r) => setTimeout(r, 20000))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Ajustes/.test(x.textContent))
  b && b.click()
})
await new Promise((r) => setTimeout(r, 1500))
const status = await page.evaluate(() => {
  const t = document.body.innerText
  const i = t.indexOf('Conta e sincroniza')
  return i >= 0 ? t.slice(i, i + 90).replace(/\n+/g, ' | ') : '(nao achei a area de conta)'
})
console.log('status do app:', status)

const b1 = await pullBackup(user.id)
console.log('nuvem depois:', JSON.stringify(favsOf(b1)), 'updatedAt', b1.exportedAt)
const changed = Object.keys(favsOf(b1)).filter((id) => favsOf(b0)[id] !== favsOf(b1)[id])
console.log('musicas cujo favorito mudou na nuvem:', changed.length, changed)
console.log('--- logs de sync ---')
logs.slice(-40).forEach((l) => console.log(l))
await browser.close()
