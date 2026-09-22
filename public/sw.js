const VERSION = '1.9.18'
const PREFIX = `nebulatune-${VERSION}`
const CACHE_SHELL = `${PREFIX}-shell`
const CACHE_ASSETS = `${PREFIX}-assets`
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './nebula.svg', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(PREFIX))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (url.pathname.includes('version.json') || url.pathname.startsWith('/apk/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE_SHELL).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || caches.match('./')),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone()
            caches.open(CACHE_ASSETS).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached || Response.error())
    }),
  )
})