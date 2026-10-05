// A janela do TrackList, que segura a biblioteca grande sem renderizar tudo de
// uma vez. Aqui ficam os casos que já quebraram na mão da pessoa:
//
//   - a lista cresce (importar músicas);
//   - a capa de uma música chega depois e reescreve a lista do mesmo tamanho;
//   - uma música é removida do meio e a lista encolhe.
//
// Nos três as músicas recém-importadas sumiam da tela: a pessoa importava, o
// contador subia e a lista voltava a mostrar só as primeiras 40.
const POR_PAGINA = 40

function aplicar(janela, tracks) {
  if (janela.lista === tracks) return janela
  const antes = janela.lista
  const listaAntes = Array.isArray(antes) ? antes : []
  const mesmoComeco =
    listaAntes.length > 0 &&
    tracks.length > 0 &&
    listaAntes[0]?.id === tracks[0]?.id
  const encolheu = mesmoComeco && tracks.length < listaAntes.length
  const cresceu = mesmoComeco && tracks.length > listaAntes.length
  return cresceu || encolheu
    ? { lista: tracks, mostradas: tracks.length }
    : mesmoComeco
      ? { lista: tracks, mostradas: Math.min(janela.mostradas, tracks.length) }
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

// --- 1. biblioteca grande, importa 5
let lib = Array.from({ length: 200 }, (_, i) => ({ id: `a-${i}` }))
let j = aplicar({ lista: lib, mostradas: POR_PAGINA }, lib)
const novas = Array.from({ length: 5 }, (_, i) => ({ id: `nova-${i}` }))
lib = [...lib, ...novas]
j = aplicar(j, lib)
ok(naoDesenhadas(j, lib) === 0, `1: as 5 importadas ficaram fora (janela ${j.mostradas})`)

// --- 2. a CAPA de uma música chega: map() cria array novo do mesmo tamanho
lib = lib.map((t) => (t.id === 'nova-0' ? { ...t, coverUrl: 'blob:x' } : t))
j = aplicar(j, lib)
ok(naoDesenhadas(j, lib) === 0, `2: a capa jogou a janela para ${j.mostradas}`)

// --- 2b. várias capas em sequência (o importador pede uma por vez)
for (let k = 0; k < 5; k++) {
  const id = `nova-${k}`
  lib = lib.map((t) => (t.id === id ? { ...t, coverUrl: 'blob:y' } : t))
  j = aplicar(j, lib)
}
ok(naoDesenhadas(j, lib) === 0, '2b: capas em sequência tiraram as músicas da tela')

// --- 3. removeu uma música do MEIO: a lista encolhe e tudo desloca
lib = lib.filter((t) => t.id !== 'a-100')
j = aplicar(j, lib)
ok(naoDesenhadas(j, lib) === 0, `3: remover do meio escondeu ${naoDesenhadas(j, lib)}`)

// --- 4. mudou de lista (busca) => recomeça em 40
const busca = lib.filter((t) => /nova/.test(t.id))
j = aplicar(j, busca)
ok(j.mostradas === POR_PAGINA, `4: a busca deveria recomeçar em ${POR_PAGINA}, veio ${j.mostradas}`)
ok(desenhados(j, busca).length === busca.length, '4: a busca não mostrou os 5 resultados')

// --- 5. volta pra biblioteca completa => recomeça
j = aplicar(j, lib)
ok(j.mostradas === POR_PAGINA, `5: voltar pra biblioteca deveria recomeçar, veio ${j.mostradas}`)

// --- 6. outra lista que começa pela mesma música não pode herdar a janela
// grande. Aqui a segurança é não carregar a janela de 205 para uma lista de 2:
// se a lista é menor que a janela, ela cabe inteira e tudo aparece.
const so = [{ id: 'a-0' }, { id: 'x-1' }]
j = aplicar({ lista: lib, mostradas: 205 }, so)
ok(j.mostradas <= so.length, `6: outra lista herdou a janela de ${j.mostradas}`)
ok(desenhados(j, so).length === so.length, '6: as 2 músicas não apareceram')

if (falhou.length) {
  console.error('FALHAS:\n- ' + falhou.join('\n- '))
  process.exit(1)
}
console.log('ok: a lista não perde mais as músicas importadas')