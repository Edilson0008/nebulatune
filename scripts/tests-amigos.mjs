// Código de amigo: estável (mesmo em qualquer aparelho), formato fixo e
// legível (sem letras ambíguas). Nada aqui depende de rede/sessão.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { gerarCodigo, normalizarCodigo, formatarCodigo, PREFIXO_CODIGO } from '../src/lib/codigo-amigo.js'
import { conquistasDoResumo, getAchievements, resumoDeJogo } from '../src/lib/stats.js'
import { blobToDataUrl, MAX_CAPA_COMPARTILHADA } from '../src/lib/cover.js'
import { mergeLibrary } from '../src/lib/sync.js'

const UID = '3f2c1b8e-7d4a-4f0e-9b6a-2c8d1e0f5a7b'

test('código tem o formato NEBU-XXXXX', () => {
  const c = gerarCodigo(UID)
  assert.equal(c.slice(0, 5), PREFIXO_CODIGO)
  assert.match(c.slice(5), /^[A-Z2-9]{5}$/)
  assert.equal(c.length, 10)
})

test('código é estável: mesmo uid gera o mesmo código', () => {
  assert.equal(gerarCodigo(UID), gerarCodigo(UID))
  assert.equal(gerarCodigo('outro-uid-com-mesmos-chars'), gerarCodigo('outro-uid-com-mesmos-chars'))
})

test('códigos de uids diferentes são diferentes na prática', () => {
  const vistos = new Set()
  for (let i = 0; i < 200; i += 1) {
    const u = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    vistos.add(gerarCodigo(u))
  }
  assert.equal(vistos.size, 200)
})

test('normalizarCódigo aceita letras minúsculas, espaço e traço', () => {
  assert.equal(normalizarCodigo(' nebu-4f2k9 '), 'NEBU4F2K9')
  assert.equal(normalizarCodigo('nebu-xy12'), 'NEBUXY12')
})

test('normalizarCódigo ignora caracteres inválidos', () => {
  assert.equal(normalizarCodigo('NEBU-!OI0 1'), 'NEBUOI01')
  assert.equal(normalizarCodigo(''), '')
  assert.equal(normalizarCodigo(null), '')
})

test('formatarCódigo aceita com/sem traço, minúsculas e até sem o prefixo', () => {
  assert.equal(formatarCodigo('nebu-4f2k9'), 'NEBU-4F2K9')
  assert.equal(formatarCodigo('NEBU4F2K9'), 'NEBU-4F2K9')
  assert.equal(formatarCodigo('4f2k9'), 'NEBU-4F2K9')
  assert.equal(formatarCodigo(''), 'NEBU-')
})

// ── Conquistas: o perfil do amigo usa o MESMO cálculo do seu perfil ─────────
// Se as duas telas usassem limiares diferentes, elas iam discordar na tela.
test('conquistasDoResumo e getAchievements dão a mesma resposta', () => {
  const library = [
    { plays: 120, fav: true, playDays: { '2026-01-01': 3, '2026-01-02': 4 } },
    { plays: 400, playDays: { '2026-01-02': 9 } },
    { plays: 0 },
  ]
  const daBiblioteca = getAchievements(library, 60, { buys: 4, toys: 2, baths: 1 })
  const doResumo = conquistasDoResumo({
    plays: 520, musicas: 3, favs: 1, dias: 2, touches: 60, buys: 4, toys: 2, baths: 1,
  })
  assert.deepEqual(
    doResumo.map((c) => [c.id, c.done]),
    daBiblioteca.map((c) => [c.id, c.done]),
  )
})

test('conquistasDoResumo marca done/shown/pct pelos limites', () => {
  const c = conquistasDoResumo({ plays: 120, musicas: 3, favs: 1, dias: 2, touches: 60 })
  const por = Object.fromEntries(c.map((x) => [x.id, x]))
  assert.equal(por.first.done, true)
  assert.equal(por.ten.done, false)
  assert.equal(por.ten.shown, 3)
  assert.equal(por.ten.pct, 30)
  assert.equal(por.plays100.done, true)
  assert.equal(por.plays500.done, false)
  assert.equal(por.plays500.pct, 24)
  assert.equal(por.pet50.done, true)
  assert.equal(por.loja1.done, false)
  assert.equal(c.length, 14)
})

test('resumo de jogo trata bagunça do banco sem quebrar', () => {
  const r = resumoDeJogo({ plays: '12', musicas: null, dias: undefined, toys: '3x' })
  assert.equal(r.plays, 12)
  assert.equal(r.musicas, 0)
  assert.equal(r.dias, 0)
  assert.equal(r.toys, 0)
  assert.deepEqual(resumoDeJogo(), { plays: 0, musicas: 0, favs: 0, dias: 0, touches: 0, buys: 0, toys: 0, baths: 0 })
})
// ── Capa no perfil do amigo ────────────────────────────────────────────────
// A capa do arquivo é um blob do aparelho: para o outro ver, ela vira uma
// miniatura de 64px (data URL) guardada em `coverShare`. O áudio continua
// local — só a imagem sobe, e só depois que alguém toca a música.
test('capa do arquivo vira miniatura compartilhável', () => {
  assert.match(blobToDataUrl.toString(), /readAsDataURL/)
  assert.ok(MAX_CAPA_COMPARTILHADA <= 8 * 1024, 'capa grande demais estufa a biblioteca')
})

test('capa compartilhada é a última opção: link do iTunes ganha', () => {
  const comItunes = mergeLibrary(
    [{ sid: 'a', coverRemote: 'https://is.example/c.jpg', coverShare: 'data:image/webp;base64,AAA' }],
    [{ sid: 'a' }],
  )
  assert.equal(comItunes[0].coverRemote, 'https://is.example/c.jpg')

  const soArquivo = mergeLibrary([{ sid: 'a', coverShare: 'data:image/webp;base64,AAA' }], [{ sid: 'a' }])
  assert.equal(soArquivo[0].coverRemote, 'data:image/webp;base64,AAA')
})

test('miniatura da capa sobrevive ao merge entre aparelhos', () => {
  const m = mergeLibrary([{ sid: 'a', title: 'X' }], [{ sid: 'a', coverShare: 'data:image/webp;base64,AAA' }])
  assert.equal(m[0].coverRemote, 'data:image/webp;base64,AAA')
})

test('miniatura da capa não se perde ao reescrever a biblioteca', () => {
  const linhas = [{ sid: 'a', coverShare: 'data:image/webp;base64,AAA', plays: 3 }]
  const volta = mergeLibrary(linhas, [])
  assert.equal(volta[0].coverShare, 'data:image/webp;base64,AAA', 'precisa ir em coverShare, não só em coverRemote')
})
