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

// Carrega os blobs de VÁRIAS músicas abrindo o banco UMA vez só (uma única
// transação de leitura). Muito mais rápido do que abrir uma transação por
// música, e evita travar telas grandes de biblioteca no carregamento.
// Devolve [{ audio, cover }, ...] na mesma ordem dos ids.
export async function loadAllMediaBlobs(ids) {
  if (!ids || !ids.length) return []
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const t = db.transaction(STORE, 'readonly')
      const store = t.objectStore(STORE)
      let pending = ids.length
      const out = new Array(ids.length)
      // Cada música tem UM par de pedidos (áudio + capa) que respondem SEPARADO.
      // Só libera o resultado quando as DUAS respostas do par chegaram; antes,
      // a contagem errada encerrava na metade do caminho e a metade restante
      // ficava sem áudio e sem capa ao reabrir o app.
      const settlePair = (i) => {
        if (--pending === 0) {
          db.close()
          resolve(out)
        }
      }
      ids.forEach((id, i) => {
        const media = { audio: null, cover: null }
        out[i] = media
        let pairDone = 0
        const mark = () => {
          if (++pairDone === 2) settlePair(i)
        }
        const audioReq = store.get(`${id}:audio`)
        const coverReq = store.get(`${id}:cover`)
        audioReq.onsuccess = () => {
          media.audio = audioReq.result || null
          mark()
        }
        audioReq.onerror = () => mark()
        coverReq.onsuccess = () => {
          media.cover = coverReq.result || null
          mark()
        }
        coverReq.onerror = () => mark()
      })
      // Rede de segurança: nunca deixar pendurado.
      t.oncomplete = () => {
        db.close()
        resolve(out)
      }
      t.onerror = () => {
        db.close()
        resolve(out)
      }
      t.onabort = () => {
        db.close()
        resolve(out)
      }
    })
  } catch {
    return []
  }
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