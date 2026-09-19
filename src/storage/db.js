const DB_NAME = 'nebulatune'
const STORE = 'tracks'
const FILES = 'files'
const VERSION = 2

let dbPromise = null

const META_FIELDS = [
  'id',
  'title',
  'artist',
  'album',
  'duration',
  'cover',
  'coverRemote',
  'addedAt',
  'fav',
  'plays',
  'playDays',
  'hasAudio',
]

export function toMeta(record) {
  const meta = {}
  for (const field of META_FIELDS) {
    if (record[field] !== undefined) meta[field] = record[field]
  }
  meta.hasAudio =
    record.hasAudio === true || Boolean(record.audioBlob && record.audioBlob.size)
  return meta
}

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponível'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('addedAt', 'addedAt')
        db.createObjectStore(FILES, { keyPath: 'id' })
      } else if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES, { keyPath: 'id' })
        // Versão 1 guardava o áudio/capa dentro do registro da música.
        // Migra tudo para a pasta de arquivos separada (metadados ficam leves).
        const tx = event.target.transaction
        const metaStore = tx.objectStore(STORE)
        const fileStore = tx.objectStore(FILES)
        let cursorReq = metaStore.openCursor()
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result
          if (!cursor) return
          const rec = cursor.value
          if (rec && (rec.audioBlob || rec.coverBlob)) {
            fileStore.put({
              id: rec.id,
              audioBlob: rec.audioBlob || null,
              coverBlob: rec.coverBlob || null,
            })
            const meta = { ...rec }
            delete meta.audioBlob
            delete meta.coverBlob
            delete meta.src
            delete meta.coverUrl
            meta.hasAudio = Boolean(rec.audioBlob)
            cursor.update(meta)
          }
          cursor.continue()
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function getAllTracks() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = req.result || []
      rows.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getTrack(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getFile(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES, 'readonly')
    const req = tx.objectStore(FILES).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllFiles() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES, 'readonly')
    const req = tx.objectStore(FILES).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function withBlobs(record) {
  const hasAudio = Boolean(record.audioBlob && record.audioBlob.size)
  const hasCover = Boolean(record.coverBlob && record.coverBlob.size)
  if (hasAudio || hasCover) {
    return {
      id: record.id,
      audioBlob: hasAudio ? record.audioBlob : null,
      coverBlob: hasCover ? record.coverBlob : null,
    }
  }
  return null
}

export async function putTrack(record) {
  const db = await openDB()
  const meta = toMeta(record)
  const files = withBlobs(record)
  return new Promise((resolve, reject) => {
    const stores = files ? [STORE, FILES] : [STORE]
    const tx = db.transaction(stores, 'readwrite')
    tx.objectStore(STORE).put(meta)
    if (files) tx.objectStore(FILES).put(files)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function putTracks(records) {
  if (!records.length) return
  const db = await openDB()
  const fileEntries = records.map(withBlobs).filter(Boolean)
  const stores = fileEntries.length ? [STORE, FILES] : [STORE]
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    const metaStore = tx.objectStore(STORE)
    records.forEach((r) => metaStore.put(toMeta(r)))
    if (fileEntries.length) {
      const fileStore = tx.objectStore(FILES)
      fileEntries.forEach((f) => fileStore.put(f))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteTrack(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, FILES], 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.objectStore(FILES).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearTracks() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, FILES], 'readwrite')
    tx.objectStore(STORE).clear()
    tx.objectStore(FILES).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}