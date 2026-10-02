// Regra única da biblioteca: uma música só existe na tela do aparelho se o
// ÁUDIO estiver neste aparelho.
//
// O porquê: o áudio (o arquivo de verdade) vive no IndexedDB, com a chave
// `${id}:audio` — ele NUNCA vai para a nuvem, porque subir arquivo de música
// para o servidor não faz sentido. A nuvem sabe que a música existe (metadados,
// capa, plays, diasplistados), mas não sabe o arquivo.
//
// Então os dois casos saem da MESMA regra, sem nenhum caso especial:
//   - Entrou no mesmo aparelho que importou: os ids batem, o blob está aqui e
//     a música é reconhecida e toca.
//   - Entrou em outro aparelho: nenhum blob, então a linha não vira música na
//     tela. Nem nome, nem capa, nem contador — e o sintetizador nunca é chamado.
//
// Isso NÃO apaga nada na nuvem: a lista completa continua sendo enviada no
// push (a nuvem vira superconjunto). O filtro é só de tela.

// Normaliza texto para comparar (minúsculas, sem acento).
function norm(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Assinatura do arquivo: mesma música Importada de novo (mesmo nome) tem a
// mesma assinatura, mesmo que o `id` de origem seja outro. É a rede de proteção
// para o caso em que a mesma música entrou por caminhos diferentes.
function assinatura(row) {
  return `${norm(row.title)}|${norm(row.artist)}|${Math.round(Number(row.duration) || 0)}`
}

// Índice do que ESTÁ neste aparelho: (id do arquivo, ou assinatura do nome).
// A assinatura cobre o aparelho que já tinha a música pelo caminho antigo,
// antes do id estável — sem ela, essas músicas sumiriam da tela.
export function indiceDeAudioLocal(biblioteca) {
  const porId = new Set()
  const porAssinatura = new Set()
  for (const row of Array.isArray(biblioteca) ? biblioteca : []) {
    if (!row || typeof row !== 'object') continue
    if (row.src || row.audioBlob) porId.add(String(row.id || ''))
    if (row.src || row.audioBlob) porAssinatura.add(assinatura(row))
  }
  return { porId, porAssinatura }
}

// Uma linha da nuvem só é considerada "desta conta, neste aparelho" se o áudio
// correspondente estiver aqui. Busca por id primeiro; se o id não bater, cai
// para a assinatura, que é o que salva a biblioteca importada em versões
// antigas (id aleatório).
//
// `audioMissing` NÃO é consultado aqui de propósito: essa coluna é um retrato
// do que o aparelho CONSEGUIU carregar da última vez, e ela envelhece. Se o blob
// está aqui agora, o arquivo existe — e uma música do próprio aparelho não pode
// sumir da tela só porque o registro antigo dizia que faltava som.
export function temAudioAqui(row, indice) {
  if (!row || typeof row !== 'object') return false
  if (row.src || row.audioBlob) return true
  const id = String(row.id || '')
  if (id && indice.porId.has(id)) return true
  return indice.porAssinatura.has(assinatura(row))
}

// Filtro PURO: recebe as linhas que vieram da nuvem e o que já existe no
// aparelho, e devolve só as linhas que têm áudio aqui. Sem IndexedDB, sem
// rede — por isso dá para testar de verdade.
//
// O que sai daqui nunca é enviado de volta para a nuvem: o push usa a união
// completa, não esta lista.
export function soComAudioAqui(linhas, bibliotecaLocal = []) {
  const indice = indiceDeAudioLocal(bibliotecaLocal)
  return (Array.isArray(linhas) ? linhas : []).filter((row) => temAudioAqui(row, indice))
}

// Preenche src/capa de uma linha a partir do blob lido do IndexedDB.
// `media` = { audio, cover } ou null quando não havia blob.
// Devolve null se a linha não tem áudio de verdade (ou seja: some da tela).
export function hidratarLinha(row, media) {
  if (!row || typeof row !== 'object') return null
  const audioBlob = media && media.audio instanceof Blob ? media.audio : null
  if (!audioBlob) return null
  const coverBlob = media && media.cover instanceof Blob ? media.cover : null
  // `coverUrl` com blob: é da sessão anterior e não vale mais.
  const coverAnterior = row.coverUrl && String(row.coverUrl).startsWith('blob:') ? null : row.coverUrl || null
  return {
    ...row,
    audioBlob,
    src: URL.createObjectURL(audioBlob),
    coverBlob,
    coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : row.coverRemote || coverAnterior,
    audioMissing: false,
  }
}
