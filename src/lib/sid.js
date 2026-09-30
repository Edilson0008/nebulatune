// "Impressão digital" de cada música: um id estável calculado da IDENTIDADE da
// faixa (título + artista + álbum + duração), e não de uma importação aleatória.
// Assim, o mesmo arquivo importado em qualquer aparelho gera o MESMO sid e as
// estatísticas (mais ouvidas, recentes, favoritas, playlists) se reconhecem.

function norm(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0
  }
  return h
}

// sid base: título | artista | dur | álbum — ordem normalizada.
function baseSid(t) {
  const title = norm(t.title) || '?'
  const artist = norm(t.artist)
  const album = norm(t.album)
  const dur = Math.round(Number(t.duration) || 0)
  return `s${hashStr(`nebulatune|${title}|${artist}|${dur}|${album}`).toString(36)}`
}

// sid de uma faixa a partir da identidade dela (usado quando a faixa veio da
// nuvem sem sid, sem reprocessar um sid que já existe).
export function sidFor(track) {
  return baseSid(track || {})
}

// Garante um sid único para cada faixa da biblioteca. Duas músicas DIFERENTES
// com metadados idênticos (ex.: versões de um mesmo nome) ganham um sufixo por
// ordem estável de id, mantendo a identidade estável entre aparelhos.
export function ensureSids(rows) {
  const seen = new Map()
  const out = []
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue
    const base = baseSid(row)
    let sid = base
    if (seen.has(base)) {
      let n = seen.get(base) + 1
      seen.set(base, n)
      sid = `${base}_${n}`
      let guard = 0
      while (seen.has(sid) && guard < 50) {
        guard += 1
        n += 1
        sid = `${base}_${n}`
      }
      seen.set(sid, 1)
    } else {
      seen.set(base, 1)
    }
    out.push({ ...row, sid })
  }
  return out
}

// Converte uma lista de ids antigos (aleatórios) para sids, usando o mapa
// id → sid da biblioteca. Quem não tem mais música correspondente é descartado.
export function idsToSids(ids, idToSid) {
  const out = []
  const push = new Set()
  for (const id of ids || []) {
    const sid = idToSid[id]
    if (sid && !push.has(sid)) {
      push.add(sid)
      out.push(sid)
    }
  }
  return out
}