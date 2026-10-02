// REGRA DA CASA, em duas metades que não podem se misturar:
//
// 1) O CATÁLOGO é a memória do que a conta possui. Ele NUNCA perde uma linha:
//    é ele que vai para `nt.library` e para a nuvem. Se a linha sumisse daqui, a
//    música seria apagada de verdade quando a biblioteca fosse reescrita.
//
// 2) A TELA é o que dá para tocar AGORA: só as linhas com arquivo neste
//    aparelho. A tela nunca mostra música sem áudio.
//
// A confusão entre as duas é o que fazia as músicas sumirem: descartar a linha
// da biblioteca também a apagava do `nt.library`, e o que foi para a nuvem
// sumia junto. Aqui as duas coisas andam separadas, e por isso uma música pode
// estar no catálogo (conta tem, nuvem tem) sem estar na tela (arquivo não está
// neste aparelho) — que é exatamente o pedido: sem música sem áudio, e sem
// perder nada.
//
// Why Map: as linhas chegam de fontes diferentes (nuvem, retrato, importação
// local) e o mesmo id volta o tempo todo. A fuller version sempre vence, e
// plays/dias/favorita nunca voltam atrás.

import { hidratarLinha } from './biblioteca.js'
import { sidFor } from './sid.js'

function norm(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Chave frouxa de "é a mesma música": título + artista + álbum, SEM duração.
// A duração não entra de propósito. A mesma música aparece uma vez com a
// duração de verdade (veio da nuvem, ou foi lida do arquivo) e outra com
// duração 0 (ainda não lida, ou vinda de um retrato antigo) — com duração na
// chave, as duas viravam músicas diferentes e a biblioteca aparecia duplicada.
function chaveFrouxa(t) {
  return `${norm(t.title)}|${norm(t.artist)}|${norm(t.album)}`
}

// Registro de uma linha no catálogo, preservando o que já era conhecido.
function junta(a, b) {
  if (!a) return b ? { ...b } : null
  if (!b) return { ...a }
  // `b` não pode apagar o que `a` sabia: uma linha da nuvem costuma vir sem
  // capa, sem duração e com campos vazios, e sobrescrever com `undefined`
  // fazia a música aparecer sem capa e com "duração indefinida".
  const sobrescrita = {}
  for (const k of Object.keys(b)) {
    if (b[k] === undefined || b[k] === null || b[k] === '') continue
    sobrescrita[k] = b[k]
  }
  const out = { ...a, ...sobrescrita }
  // Contagens são sempre o MAIOR entre o que se sabia antes e o que veio agora:
  // um retrato velho ou uma resposta atrasada da nuvem não pode zerar o que a
  // pessoa já fez.
  out.plays = Math.max(Number(a.plays) || 0, Number(b.plays) || 0)
  out.fav = a.fav === true || b.fav === true
  out.playDays = { ...(a.playDays || {}), ...(b.playDays || {}) }
  if (a.audioMissing === true && b.audioMissing === true) out.audioMissing = true
  else out.audioMissing = false
  // Capa e duração: só melhoram, nunca pioram.
  if (!(out.duration > 0) && a.duration > 0) out.duration = a.duration
  if (!out.cover && a.cover) out.cover = a.cover
  if (!out.coverShare && a.coverShare) out.coverShare = a.coverShare
  if (!out.coverRemote && a.coverRemote) out.coverRemote = a.coverRemote
  if (!out.album && a.album) out.album = a.album
  if (!out.artist && a.artist) out.artist = a.artist
  if (!out.title && a.title) out.title = a.title
  return out
}

export function criarCatalogo() {
  // `pronto` = o catálogo já foi carregado com o que a conta TEM.
  //
  // Sem esta marca, o efeito do app que reescreve o `nt.library` viajava antes
  // do catálogo estar pronto e gravava uma lista VAZIA por cima da biblioteca
  // de verdade — apagando as músicas do aparelho a cada troca de conta. Por
  // isso o app não grava nada enquanto `pronto` for falso.
  return { linhas: new Map(), pronto: false }
}

// O catálogo já foi carregado? (o app usa isto para saber se pode gravar)
export function catalogoPronto(catalogo) {
  return Boolean(catalogo && catalogo.pronto === true)
}

// Marca o catálogo como carregado. Chame só DEPOIS de ele estar com as linhas da
// conta dentro — nunca antes, ou a biblioteca vazia volta a ser gravada.
export function marcarCatalogoPronto(catalogo, pronto = true) {
  if (catalogo) catalogo.pronto = pronto
  return catalogo
}

// Guarda uma linha no catálogo e devolve a versão final, já unida com o que
// era conhecido dela.
//
// A MESMA música pode chegar com ids diferentes: o retrato deste aparelho e a
// linha que veio da nuvem foram montados em lugares diferentes, e antes de o
// arquivo ser lido a duração é 0 de um lado e o valor real do outro. Com o
// sid completo (que inclui a duração) as duas pareciam músicas diferentes, e a
// biblioteca aparecia DUPLICADA — uma sem capa e com "duração indefinida".
// Aqui a identidade é a chave frouxa (título+artista+álbum): as duas viram uma
// música só, e quem sobrevive é a linha que já tinha id, capa e arquivo.
export function guardarNoCatalogo(catalogo, linha) {
  if (!catalogo || !linha || typeof linha !== 'object' || !linha.id) return linha
  const chave = chaveFrouxa(linha)
  if (chave !== '||') {
    for (const [id, atual] of catalogo.linhas) {
      if (id === linha.id) continue
      if (chaveFrouxa(atual) !== chave) continue
      const final = junta(atual, linha)
      final.id = id
      final.sid = atual.sid || linha.sid || sidFor(final)
      catalogo.linhas.set(id, final)
      return final
    }
  }
  const atual = catalogo.linhas.get(linha.id)
  const final = junta(atual, linha)
  if (!final.sid) final.sid = sidFor(final)
  catalogo.linhas.set(linha.id, final)
  return final
}

// Trocar de conta esvazia o catálogo. Ele guarda a memória do que a CONTA tem,
// e as músicas de uma conta não podem ficar no registro da outra: foi o que fez
// as músicas vazarem e se juntarem na troca. O catálogo da conta que entra é
// reconstruído a partir do RETRATO dela neste aparelho (se ela já usou este
// aparelho); o resto chega com a sincronização.
export function trocarCatalogo(catalogo, retrato) {
  const novo = criarCatalogo()
  // Aceita o retrato (`{ library: [...] }`) ou a lista de linhas direto.
  const linhas = Array.isArray(retrato) ? retrato : (retrato && retrato.library) || []
  for (const linha of linhas) guardarNoCatalogo(novo, linha)
  catalogo.linhas = novo.linhas
  // Trocar de conta esvazia o catálogo: ele ainda NÃO está pronto, e é
  // exatamente nesse intervalo que a biblioteca de verdade não pode ser
  // sobrescrita por uma lista vazia.
  marcarCatalogoPronto(catalogo, false)
  return catalogo
}

// Quais linhas do catálogo TEM áudio neste aparelho? É o que autoriza a tela a
// mostrar a música. A prova é o arquivo, nunca a coluna `audioMissing` (ela
// envelhece e mente).
export function comAudioNoAparelho(catalogo, mediaPorId) {
  const saida = []
  for (const linha of catalogo.linhas.values()) {
    const pronta = hidratarLinha(linha, mediaPorId(linha))
    if (pronta) saida.push(pronta)
  }
  return saida
}

// O catálogo inteiro, na ordem em que as músicas entraram. É isto que vai para
// o `nt.library` e para a nuvem.
export function linhasDoCatalogo(catalogo) {
  return [...catalogo.linhas.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
}

// Tirar do catálogo. O catálogo guarda a memória do que a conta tem, então
// apagar uma música precisa tirá-la de lá também: do contrário ela voltaria na
// reescrita seguinte do `nt.library` (foi o que aconteceu ao testar).
export function tirarDoCatalogo(catalogo, id) {
  if (!catalogo || !id) return
  catalogo.linhas.delete(id)
}
