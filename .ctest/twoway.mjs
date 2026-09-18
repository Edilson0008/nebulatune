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

const favsOf = (backup) => Object.fromEntries((backup.tracks || []).map((t) => [t.id, t.fav === true]))
const before = favsOf(await pullBackup(user.id))
console.log('favoritos antes:', JSON.stringify(before))

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const logs = []
page.on('pageerror', (e) => logs.push(e.message))
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
await new Promise((r) => setTimeout(r, 5000))
const favBtn = await page.$('.row-fav')
console.log('achou botao favorito:', !!favBtn)
if (favBtn) await favBtn.click()
await new Promise((r) => setTimeout(r, 11000))

const after = favsOf(await pullBackup(user.id))
console.log('favoritos depois:', JSON.stringify(after))
const changed = Object.keys(after).filter((id) => before[id] !== after[id])
console.log('musicas cujo favorito mudou na nuvem:', changed.length, changed)
console.log('erros:', logs.slice(-3))
await browser.close()
