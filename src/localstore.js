// Persistência 100% local (sem nuvem).
// Metadados da biblioteca vão para localStorage (`nt.library`) e os arquivos de
// áudio/capa vão para o IndexedDB (`nebulatune-media`), para aguentar bastante
// música sem estourar a cota de localStorage.

export function readLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* armazenamento cheio/indisponível */
  }
}

const DB_NAME = 'nebulatune-media'
const STORE = 'blobs'

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function runTx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        try {
          const out = fn(store)
          t.oncomplete = () => {
            db.close()
            resolve(out)
          }
          t.onerror = () => {
            db.close()
            reject(t.error)
          }
          t.onabort = () => {
            db.close()
            reject(t.error)
          }
        } catch (e) {
          db.close()
          reject(e)
        }
      }),
  )
}

export function saveMediaBlobs(id, blobs) {
  if (!blobs) return Promise.resolve()
  return runTx('readwrite', (s) => {
    if (typeOf(blobs.audio) !== 'undefined') s.put(blobs.audio, `${id}:audio`)
    if (typeOf(blobs.cover) !== 'undefined') s.put(blobs.cover, `${id}:cover`)
  }).catch(() => {})
}

export function loadMediaBlobs(id) {
  return runTx('readonly', (s) => {
    const audio = s.get(`${id}:audio`)
    const cover = s.get(`${id}:cover`)
    return Promise.all([audio, cover]).then(([a, c]) => ({
      audio: a || null,
      cover: c || null,
    }))
  }).catch(() => ({ audio: null, cover: null }))
}

export function deleteMediaBlobs(id) {
  return runTx('readwrite', (s) => {
    s.delete(`${id}:audio`)
    s.delete(`${id}:cover`)
  }).catch(() => {})
}

export function clearAllMedia() {
  return runTx('readwrite', (s) => s.clear()).catch(() => {})
}

function typeOf(v) {
  if (v === undefined) return 'undefined'
  return 'object'
}