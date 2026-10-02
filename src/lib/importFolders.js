// Escolher a PASTA antes de escolher as músicas.
//
// Antes, o importador despejava todas as músicas do aparelho numa caixa só. Com
// um celular cheio de áudio isso é inutilizável: a pessoa precisa rolar cientos
// de linhas até achar a pasta que importa.
//
// Este módulo é função pura (sem React, sem Capacitor) para poder ser testada
// sozinha. O agrupamento acontece aqui, no JavaScript: o plugin nativo só
// precisa devolver a PASTA de cada faixa, e quem monta a árvore é este código.

const SEM_PASTA = 'Sem pasta'

// O Android devolve o caminho com barra no fim ("Music/WhatsApp/"). A barra
// sobrando viraria "Music/WhatsApp/" e não bateria com outra ocorrência do
// mesmo lugar, quebrando a contagem da pasta.
function limparPasta(valor) {
  const texto = String(valor == null ? '' : valor).trim()
  if (!texto) return SEM_PASTA
  return texto.replace(/[\\/]+$/, '') || SEM_PASTA
}

// "Music/WhatsApp" -> "WhatsApp". A última parte é o nome que a pessoa
// reconhece; o caminho inteiro fica guardado em `caminho` para o título.
function nomeDaPasta(caminho, indice, total) {
  const partes = String(caminho).split('/').filter(Boolean)
  if (partes.length) return partes[partes.length - 1]
  // Mais de uma pasta sem caminho (armazenamento SD, por exemplo): precisam de
  // nomes diferentes, senão a pessoa vê "Sem pasta" várias vezes sem saber qual
  // é qual.
  return total > 1 ? `${SEM_PASTA} ${indice + 1}` : SEM_PASTA
}

/**
 * Agrupa faixas por pasta.
 *
 * @param {Array} faixas  faixas com { id, title, folder? }
 * @returns {{pastas: Array, porPasta: Map, temPasta: boolean}}
 *   `pastas` vem ordenado: maior primeiro (é o que a pessoa quer quase sempre),
 *   desempatando pelo nome.
 *
 * `temPasta` diz se vale a pena mostrar a etapa de escolher pasta. Num APK
 * antigo, que não devolve `folder`, ela é `false` e a tela segue mostrando
 * tudo junto — sem quebrar nada.
 */
export function agruparPorPasta(faixas) {
  const lista = Array.isArray(faixas) ? faixas.filter(Boolean) : []
  const mapa = new Map()
  const semPasta = []
  // APK antigo não devolve `folder`: aí NENHUMA faixa tem pasta e a tela segue
  // mostrando tudo junto. Sem esta flag, o agrupamento inventava uma pasta
  // "Sem pasta" com tudo dentro — que é justamente o que a gente quer evitar.
  let algumComPasta = false

  for (const faixa of lista) {
    const bruto = limparPasta(faixa.folder)
    if (bruto === SEM_PASTA) {
      semPasta.push(faixa)
      continue
    }
    algumComPasta = true
    if (!mapa.has(bruto)) mapa.set(bruto, [])
    mapa.get(bruto).push(faixa)
  }

  // Nenhuma faixa tem pasta (APK antigo, ou web): não existe pasta nenhuma.
  // Devolver uma pasta "Sem pasta" com tudo dentro seria inventar um lugar que
  // não existe na tela — a pessoa entraria numa pasta e veria a lista inteira.
  if (!algumComPasta) return { pastas: [], porPasta: new Map(), temPasta: false }

  const totalDePastas = mapa.size + (semPasta.length ? 1 : 0)
  const pastas = []
  const porPasta = new Map()

  let i = 0
  for (const [caminho, faixasDaPasta] of mapa) {
    const pasta = {
      caminho,
      nome: nomeDaPasta(caminho, i, totalDePastas),
      faixas: faixasDaPasta,
      total: faixasDaPasta.length,
    }
    pastas.push(pasta)
    porPasta.set(caminho, pasta)
    i += 1
  }
  // As faixas sem pasta viram uma pasta também, no fim da lista: é o lugar
  // menos provável de estar o que a pessoa quer.
  if (semPasta.length) {
    const pasta = {
      caminho: SEM_PASTA,
      nome: nomeDaPasta('', pastas.length, totalDePastas),
      faixas: semPasta,
      total: semPasta.length,
    }
    pastas.push(pasta)
    porPasta.set(SEM_PASTA, pasta)
  }

  pastas.sort((a, b) => (b.total - a.total) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return { pastas, porPasta, temPasta: algumComPasta }
}

/**
 * Escolhe quais faixas mostrar.
 *
 * @param {Array} faixas
 * @param {string|null} pasta  caminho da pasta escolhida, ou null para todas
 */
export function faixasDaPasta(faixas, pasta) {
  const lista = Array.isArray(faixas) ? faixas.filter(Boolean) : []
  if (!pasta) return lista
  return lista.filter((f) => limparPasta(f.folder) === pasta)
}

export { SEM_PASTA }