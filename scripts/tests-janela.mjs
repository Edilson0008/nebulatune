// A janela do TrackList e a paginacao que segura a biblioteca grande. Este
// teste cobre o caso que quebrou: a lista cresce na importacao e as
// musicas novas entram no FIM, fora do corte.
// Reproduz a logica de janela do TrackList: a lista nova e a antiga + as
// importadas. Antes a janela reiniciava em 40 e as novas ficavam fora.
const POR_PAGINA = 40
function criarJanela(janela, tracks) {
  if (janela.lista !== tracks) {
    const antes = janela.lista
    const meio = Math.floor((antes?.length || 0) / 2)
    const mesmoInicio =
      Array.isArray(antes) &&
      antes.length > 0 &&
      tracks.length > antes.length &&
      antes[0]?.id === tracks[0]?.id &&
      antes[meio]?.id === tracks[meio]?.id &&
      antes[antes.length - 1]?.id === tracks[antes.length - 1]?.id
    const cresceu = mesmoInicio
    janela = cresceu
      ? { lista: tracks, mostradas: tracks.length }
      : { lista: tracks, mostradas: POR_PAGINA }
  }
  return janela
}
const visiveis = (j, tracks) => (tracks.length > j.mostradas ? tracks.slice(0, j.mostradas) : tracks)
const falhou = []
const ok = (c, m) => { if (!c) falhou.push(m) }

// --- caso 1: biblioteca grande, importa 5
let lib = Array.from({ length: 200 }, (_, i) => ({ id: `a-${i}` }))
let j = criarJanela({ lista: lib, mostradas: POR_PAGINA }, lib)
const novas = Array.from({ length: 5 }, (_, i) => ({ id: `nova-${i}` }))
const libComNovas = [...lib, ...novas]
j = criarJanela(j, libComNovas)
lib = libComNovas
let v = visiveis(j, lib)
const tela1 = new Set(v.map(t => t.id))
ok(novas.every(t => tela1.has(t.id)), 'caso 1: as 5 importadas sumiram da tela')

// --- caso 2: importa 60 de uma vez (duas paginas)
lib = [...lib, ...Array.from({ length: 60 }, (_, i) => ({ id: `lote-${i}` }))]
j = criarJanela(j, lib)
v = visiveis(j, lib)
const tela2 = new Set(v.map(t => t.id))
ok(Array.from({ length: 60 }, (_, i) => `lote-${i}`).every(id => tela2.has(id)), 'caso 2: o lote de 60 sumiu')

// --- caso 3: mudou de lista (busca) => recomeca em 40, nao herda o tamanho
const busca = lib.filter(t => /nova|lote/.test(t.id))
j = criarJanela(j, busca)
ok(j.mostradas === POR_PAGINA, `caso 3: busca deveria recomecar em ${POR_PAGINA}, veio ${j.mostradas}`)

// --- caso 4: lista encolheu (removeu musica) => recomeca
j = criarJanela(j, busca.slice(0, 5))
ok(j.mostradas === POR_PAGINA, `caso 4: lista menor deveria recomecar, veio ${j.mostradas}`)

// --- caso 5: lista igual (mesmo conteudo, nova identidade) => nao explode
const mesma = busca.slice(0, 5)
j = criarJanela({ lista: mesma, mostradas: POR_PAGINA }, mesma.slice())
ok(j.mostradas === POR_PAGINA, `caso 5: lista igual deveria recomecar, veio ${j.mostradas}`)

if (falhou.length) { console.error('FALHAS:\n- ' + falhou.join('\n- ')); process.exit(1) }
console.log('ok: a janela acompanha a importacao e nao vaza em busca/remocao')
