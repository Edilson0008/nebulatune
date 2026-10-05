// A janela do TrackList. Aqui fica a REGRA DE CÓDIGO, copiada da lógica que o
// componente usa, e os casos que já quebraram na mão da pessoa:
//
//   - a lista cresce (importar músicas);
//   - a capa de uma música chega e a lista é reescrita do mesmo tamanho;
//   - uma música é removida do MEIO e a lista encolhe;
//   - outra lista (busca/filtro) que por acaso começa com as mesmas músicas.
//
// Nos quatro a janela reiniciava e as músicas recém-importadas sumiam da tela.
const POR_PAGINA = 40

function aplicar(janela, tracks) {
  if (janela.lista === tracks) return janela
  const antes = janela.lista
  const listaAntes = Array.isArray(antes) ? antes : []
  const quantasMostrava = Math.min(janela.mostradas, listaAntes.length)
  const idsVisiveis = listaAntes.slice(0, quantasMostrava).map((t) => t && t.id)
  const idsNovos = new Set(tracks.map((t) => t && t.id))
  const quantasSobrepoem = idsVisiveis.reduce((n, id) => n + (idsNovos.has(id) ? 1 : 0), 0)
  const mesmaLista =
    quantasMostrava > 0 &&
    (tracks.length >= listaAntes.length || quantasSobrepoem * 2 >= quantasMostrava)
  return mesmaLista
    ? { lista: tracks, mostradas: tracks.length }
    : { lista: tracks, mostradas: POR_PAGINA }
}

const desenhados = (j, tracks) =>
  tracks.length > j.mostradas ? tracks.slice(0, j.mostradas) : tracks

const naoDesenhadas = (j, tracks) => {
  const v = new Set(desenhados(j, tracks).map((t) => t.id))
  return tracks.filter((t) => !v.has(t.id)).length
}

const falhou = []
const ok = (c, m) => {
  if (!c) falhou.push(m)
}
const visivelTodas = (j, tracks) => naoDesenhadas(j, tracks) === 0

// --- 1. biblioteca grande, importa 5
let lib = Array.from({ length: 200 }, (_, i) => ({ id: `a-${i}` }))
let j = aplicar({ lista: lib, mostradas: POR_PAGINA }, lib)
ok(j.mostradas === POR_PAGINA, `1: a janela inicial deveria ser ${POR_PAGINA}, veio ${j.mostradas}`)

lib = [...lib, ...Array.from({ length: 5 }, (_, i) => ({ id: `nova-${i}` }))]
j = aplicar(j, lib)
ok(visivelTodas(j, lib), `1: as 5 importadas ficaram fora (janela ${j.mostradas})`)

// --- 2. a CAPA de uma música chega: map() cria array novo do mesmo tamanho
lib = lib.map((t) => (t.id === 'nova-0' ? { ...t, coverUrl: 'blob:x' } : t))
j = aplicar(j, lib)
ok(visivelTodas(j, lib), `2: a capa jogou a janela para ${j.mostradas}`)

// --- 2b. várias capas em sequência (o importador pede uma por vez)
for (let k = 0; k < 5; k++) {
  const id = `nova-${k}`
  lib = lib.map((t) => (t.id === id ? { ...t, coverUrl: 'blob:y' } : t))
  j = aplicar(j, lib)
}
ok(visivelTodas(j, lib), '2b: capas em sequência tiraram as músicas da tela')

// --- 3. removeu do MEIO: tudo desloca e o tamanho encolhe
lib = lib.filter((t) => t.id !== 'a-100')
j = aplicar(j, lib)
ok(visivelTodas(j, lib), `3: remover do meio escondeu ${naoDesenhadas(j, lib)}`)

// --- 3b. removeu a ÚLTIMA que estava visível
lib = lib.slice(0, -1)
j = aplicar(j, lib)
ok(visivelTodas(j, lib), `3b: remover do fim escondeu ${naoDesenhadas(j, lib)}`)

// --- 4. mudou de lista (busca) => recomeça em 40
const busca = lib.filter((t) => /nova/.test(t.id))
j = aplicar(j, busca)
ok(j.mostradas === POR_PAGINA, `4: a busca deveria recomeçar em ${POR_PAGINA}, veio ${j.mostradas}`)
ok(desenhados(j, busca).length === busca.length, '4: a busca não mostrou os 5 resultados')

// --- 5. volta pra biblioteca completa: mostra tudo. Pode desenhar mais do que o
// mínimo sem quebrar nada — o `content-visibility: auto` segura o custo.
j = aplicar(j, lib)
ok(visivelTodas(j, lib), `5: voltar pra biblioteca escondeu ${naoDesenhadas(j, lib)}`)

// --- 6. lista nova que começa IGUAL à anterior (mesmo prefixo), mas é outra
const copia = lib.map((t) => ({ ...t }))
j = aplicar({ lista: lib, mostradas: POR_PAGINA }, copia)
ok(visivelTodas(j, copia), '6: a cópia da biblioteca ficou sem músicas')

// --- 7. trocar por lista MENOR que começa igual: recomeça, não herda janela
const so = [{ id: 'a-0' }, { id: 'x-1' }]
j = aplicar({ lista: lib, mostradas: lib.length }, so)
ok(j.mostradas === POR_PAGINA, `7: lista menor herdou janela de ${j.mostradas}`)
ok(desenhados(j, so).length === so.length, '7: as 2 músicas não apareceram')

// --- 8. o caso que mais importa: trocar o MEIO não pode apagar o fim
// A janela cobre tudo, alguém filtra o meio, e as do fim têm de continuar.
let grande = Array.from({ length: 300 }, (_, i) => ({ id: `g-${i}` }))
let jj = aplicar({ lista: grande, mostradas: POR_PAGINA }, grande)
ok(jj.mostradas === POR_PAGINA, `8: a janela inicial deveria ser ${POR_PAGINA}`)
jj = aplicar(jj, [...grande, { id: 'g-300' }])
grande = [...grande.slice(0, 100), ...grande.slice(200)]
jj = aplicar(jj, grande)
ok(visivelTodas(jj, grande), `8: tirar do meio escondeu ${naoDesenhadas(jj, grande)}`)

if (falhou.length) {
  console.error('FALHAS:\n- ' + falhou.join('\n- '))
  process.exit(1)
}
console.log('ok: a janela nunca esconde música que já estava na tela')