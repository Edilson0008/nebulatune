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

// Falha de gravação. Isto NÃO é enfeite: `localStorage` tem cota (~5 MB), e
// quando ela estoura o `setItem` lança. O `catch` antigo comia o erro em
// silêncio e o efeito era o pior possível — a pessoa preenchia o nome, apertava
// F5 e o nome tinha simplesmente evaporado, sem nenhuma pista do porquê.
//
// Guardamos a última falha para o app conseguir MOSTRAR o problema (e para os
// testes poderemprová-lo).
let ultimaFalha = null
export function ultimaFalhaDeGravacao() {
  return ultimaFalha
}
export function limparFalhaDeGravacao() {
  ultimaFalha = null
}

export function writeLocal(key, value) {
  try {
    const texto = JSON.stringify(value)
    localStorage.setItem(key, texto)
    ultimaFalha = null
    return true
  } catch (e) {
    const cheio = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
    ultimaFalha = { key, cheio: Boolean(cheio), mensagem: (e && e.message) || String(e) }
    // Mesmo cheia, tenta uma última vez SEM a foto de perfil: ela é o item mais
    // grosso da chave e sozinha pode estourar a cota. Perder a foto é muito
    // melhor do que perder nome, bio e todos os outros ajustes junto — e a
    // pessoa pode recolocar a foto num instante.
    if (cheio && key === 'nt.settings' && value && typeof value === 'object' && value.avatar) {
      try {
        const semFoto = { ...value }
        delete semFoto.avatar
        localStorage.setItem(key, JSON.stringify(semFoto))
        ultimaFalha = { ...ultimaFalha, salvouSemFoto: true }
        return true
      } catch {
        /* nem assim coube */
      }
    }
    return false
  }
}

// Quanto do armazenamento do navegador já foi usado. Serve para o app avisar
// ANTES de a perda acontecer, em vez de a pessoa descobrir pelo F5.
export function storageStatus() {
  let bytes = 0
  let max = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      bytes += (localStorage.getItem(k) || '').length + (k.length || 0)
    }
    //const cota não é exposta: 5 MB é o padrão da maioria dos navegadores.
    max = 5 * 1024 * 1024
  } catch {
    /* sem localStorage */
  }
  return { bytes, max, pct: max ? Math.min(100, Math.round((bytes / max) * 100)) : 0 }
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
      const settlePair = () => {
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
          if (++pairDone === 2) settlePair()
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

// ── Liberar espaço ───────────────────────────────────────────────────────────
// Ao trocar de versão, remover músicas ou importar o mesmo arquivo várias vezes
// sobram blobs no banco que nenhuma música da biblioteca usa mais. Como o app é
// 100% local, esse lixo ocupa espaço do aparelho para sempre até a limpeza de
// cache ser apertada. Estas duas funções permitem achá-lo e apagá-lo.

const orphanKey = (key) => (key || '').split(':')[0]

/**
 * Lista os ARQUIVOS DE ÁUDIO que estão no aparelho, com o id de cada um.
 *
 * A chave no banco é `${id}:audio` (e `${id}:cover`). Isso permite achar
 * músicas órfãs: áudio existe, mas a linha sumiu do `nt.library` (foi o que
 * o apagão da troca de conta causou). O arquivo continua inteiro no aparelho —
 * só a lista é que se perdeu. O nome do blob vai junto porque, sem a linha, é
 * o que sobrou para identificar a música.
 */
export function listAudioIds() {
  return runTx('readonly', (s) => {
    const out = []
    return new Promise((resolve) => {
      const req = s.openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) {
          resolve(out)
          return
        }
        const key = String(cur.key || '')
        if (key.endsWith(':audio')) {
          const blob = cur.value
          out.push({
            id: key.slice(0, -':audio'.length),
            nome: (blob && typeof blob.name === 'string' && blob.name) || '',
            tipo: (blob && blob.type) || '',
            bytes: (blob && typeof blob.size === 'number' && blob.size) || 0,
          })
        }
        cur.continue()
      }
      req.onerror = () => resolve(out)
    })
  }).catch(() => [])
}

/* Bytes guardados e quantos blobs existem, sem carregar o conteúdo. */
export function mediaStorageInfo() {
  return runTx('readonly', (s) => {
    let bytes = 0
    let count = 0
    return new Promise((resolve) => {
      const req = s.openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) {
          resolve({ bytes, count })
          return
        }
        const v = cur.value
        if (v && typeof v.size === 'number') bytes += v.size
        count += 1
        cur.continue()
      }
      req.onerror = () => resolve({ bytes, count })
    })
  }).catch(() => ({ bytes: 0, count: 0 }))
}

/* Ids que têm áudio/capa guardado mas NÃO estão mais na biblioteca. */
export async function findOrphanMedia(libraryIds) {
  const validos = new Set((libraryIds || []).filter(Boolean))
  if (!validos.size) return []
  const chaves = await runTx('readonly', (s) => {
    return new Promise((resolve) => {
      const req = s.getAllKeys()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  }).catch(() => [])
  const orfaos = new Set()
  chaves.forEach((k) => {
    const id = orphanKey(k)
    if (id && !validos.has(id)) orfaos.add(id)
  })
  return [...orfaos]
}

/* Apaga os blobs que sobraram. Devolve quantos ids foram limpos. */
export async function purgeOrphanMedia(libraryIds) {
  const orfaos = await findOrphanMedia(libraryIds)
  if (!orfaos.length) return 0
  await runTx('readwrite', (s) => {
    orfaos.forEach((id) => {
      s.delete(`${id}:audio`)
      s.delete(`${id}:cover`)
    })
  }).catch(() => {})
  return orfaos.length
}

function typeOf(v) {
  if (v === undefined) return 'undefined'
  return 'object'
}