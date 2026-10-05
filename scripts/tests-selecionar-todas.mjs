// "Selecionar todas" deve agir so sobre a lista da tela (a pasta aberta).
// Reproduz o reducer de selectAllDevice + o texto que a tela mostra.
function aplicar(sel, valor, lista) {
  const next = { ...sel }
  for (const t of lista) next[t.id] = valor
  return next
}
const mk = (id, folder) => ({ id, folder })
const apk = [
  mk('1', 'Music/Albuns'),
  mk('2', 'Music/Albuns'),
  mk('3', 'Music/Albuns'),
  mk('4', 'Download/Podcast'),
  mk('5', 'Download/Podcast'),
  mk('6', 'Music/Som'),
]
const daPasta = apk.filter(t => t.folder === 'Music/Albuns')
const falhou = []
const ok = (c, m) => { if (!c) falhou.push(m) }

// 1. marca a pasta aberta
let sel = aplicar({}, true, daPasta)
ok(sel['1'] && sel['2'] && sel['3'], '1: a pasta aberta devia ficar marcada')
ok(!sel['4'] && !sel['5'] && !sel['6'], '1: marcou musica de OUTRA pasta')

// 2. volta, marca outra pasta: as duas somam (nao apaga a primeira)
sel = aplicar(sel, true, apk.filter(t => t.folder === 'Download/Podcast'))
ok(sel['4'] && sel['5'], '2: a segunda pasta devia entrar')
ok(sel['1'] && sel['2'] && sel['3'], '2: marcar a 2a pasta apagou a 1a')

// 3. desmarca so a 2a pasta
sel = aplicar(sel, false, apk.filter(t => t.folder === 'Download/Podcast'))
ok(!sel['4'] && !sel['5'], '3: desmarcar a 2a pasta falhou')
ok(sel['1'] && sel['2'] && sel['3'], '3: desmarcar a 2a pasta apagou a 1a')

// 4. os textos da tela
const marcadas = (lista, s) => lista.filter(t => s[t.id]).length
const totalSelecionadas = Object.values(sel).filter(Boolean).length
ok(marcadas(daPasta, sel) === 3, 'contagem da lista da tela errada')
ok(totalSelecionadas === 3, 'total de selecionadas errado')

// 5. lista vazia nao mexe em nada
const antes = { ...sel }
const depois = aplicar(sel, true, [])
ok(JSON.stringify(antes) === JSON.stringify(depois), 'lista vazia alterou a selecao')

if (falhou.length) { console.error('FALHAS:\n- ' + falhou.join('\n- ')); process.exit(1) }
console.log('ok: "selecionar todas" age so na pasta aberta e soma entre pastas')
