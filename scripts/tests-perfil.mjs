// Tempo total ouvido (estimado): reproduções do período × duração.
// O ponto que mais importa aqui é o `NaN`: uma música importada sem duração
// válida contaminaria a soma inteira e o Perfil passaria a mostrar "NaNmin" ou
// sumiria do nada. Por isso o teste exige que a faixa seja IGNORADA, e não
// somada como zero silencioso.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tempoDaBiblioteca, tempoOuvido, playsInPeriod } from '../src/lib/stats.js'
import { fmtTempo } from '../src/lib/format.js'

const hoje = () => new Date().toISOString().slice(0, 10)

function faixa(plays, duration, day = hoje()) {
  const playDays = {}
  if (plays > 0) playDays[day] = plays
  return { id: `t${Math.random()}`, plays, duration, playDays }
}

test('tempoOuvido: multiplica reproduções pela duração', () => {
  assert.equal(tempoOuvido(3, 120), 360)
  assert.equal(tempoOuvido(1, 1), 1)
})

test('tempoOuvido: reprodução ou duração inválida vale zero, nunca NaN', () => {
  assert.equal(tempoOuvido(NaN, 120), 0)
  assert.equal(tempoOuvido(3, NaN), 0)
  assert.equal(tempoOuvido(3, Infinity), 0)
  assert.equal(tempoOuvido(3, null), 0)
  assert.equal(tempoOuvido(3, 0), 0)
  assert.equal(tempoOuvido(3, -120), 0)
})

test('tempoDaBiblioteca: biblioteca vazia ou nula não quebra', () => {
  for (const lib of [[], null, undefined]) {
    assert.deepEqual(tempoDaBiblioteca(lib, 'all'), { segundos: 0, semDuracao: 0 })
  }
})

test('tempoDaBiblioteca: soma as faixas com duração', () => {
  const lib = [faixa(3, 200), faixa(2, 100)]
  const r = tempoDaBiblioteca(lib, 'all')
  assert.equal(r.segundos, 3 * 200 + 2 * 100)
  assert.equal(r.semDuracao, 0)
})

test('tempoDaBiblioteca: faixa sem duração é contada e NÃO soma no total', () => {
  const lib = [faixa(5, 300), faixa(4, 0), faixa(2, null), faixa(1, NaN)]
  const r = tempoDaBiblioteca(lib, 'all')
  assert.equal(r.segundos, 5 * 300, 'só a faixa com duração entra')
  assert.equal(r.semDuracao, 3)
  assert.ok(Number.isFinite(r.segundos), 'o total precisa continuar sendo número')
})

test('tempoDaBiblioteca: faixa sem reprodução no período não conta como sem duração', () => {
  // Caso diferente: a pessoa NUNCA ouviu essa faixa (plays 0). Não há o que
  // estimar, então não vira aviso de "sem duração" para poluir a tela.
  const r = tempoDaBiblioteca([faixa(0, 0)], 'all')
  assert.deepEqual(r, { segundos: 0, semDuracao: 0 })
})

test('tempoDaBiblioteca: bate com playsInPeriod nos quatro períodos', () => {
  for (const period of ['week', 'month', 'year', 'all']) {
    const lib = [faixa(4, 150), faixa(7, 90)]
    const esperado = lib.reduce((acc, t) => acc + playsInPeriod(t, period) * t.duration, 0)
    assert.equal(tempoDaBiblioteca(lib, period).segundos, esperado, `período ${period}`)
  }
})

test('tempoDaBiblioteca: reproduções de outro dia ficam de fora do período', () => {
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lib = [faixa(9, 100, ontem)]
  assert.equal(tempoDaBiblioteca(lib, 'all').segundos, 900, 'em "tudo" o dia anterior conta')
  assert.equal(tempoDaBiblioteca(lib, 'year').segundos, 900, 'e também no ano corrente')
})

test('fmtTempo: escolhe a unidade certa nas bordas', () => {
  assert.equal(fmtTempo(0), '0s')
  assert.equal(fmtTempo(-5), '0s')
  assert.equal(fmtTempo(NaN), '0s')
  assert.equal(fmtTempo(Infinity), '0s')
  assert.equal(fmtTempo(52), '52s')
  assert.equal(fmtTempo(59), '59s')
  assert.equal(fmtTempo(60), '1min')
  assert.equal(fmtTempo(61), '1min')
  assert.equal(fmtTempo(2280), '38min')
})

test('fmtTempo: minuto redondo vira hora, nunca "60min"', () => {
  assert.equal(fmtTempo(3599), '1h')
  assert.equal(fmtTempo(3600), '1h')
  assert.equal(fmtTempo(3900), '1h 05min')
  assert.equal(fmtTempo(51600), '14h 20min')
})