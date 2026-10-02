// NOME, FOTO e BIO: os três campos que a pessoa preenche à mão e que não
// podem ser apagados por engano.
//
// Existe por causa de um sintoma bem específico: "nome e foto somem ao dar F5".
// A conta tinha nome e foto gravados no aparelho, mas na nuvem estava
// `userName: ''` e `avatar: ''` — de quando o estado foi zerado pela limpeza da
// mistura. Ao abrir o app, a sincronização trazia esse vazio de volta e o
// `setAll` sobrescrevia o que estava certo. Resultado: os campos sumiam pouco
// depois de cada refresh, sem a pessoa ter feito nada de errado.
//
// A regra é simples: um valor VAZIO vindo da nuvem é ausência de informação,
// não é "apague isso". Estes campos só podem ser trocados por um valor
// VERDADEIRO vindo da nuvem. Assim trocar a foto no outro aparelho continua
// funcionando, e um vazio nunca destrói o que está bom aqui.
//
// Fica num arquivo próprio (e sem dependências) para poder ser testado direto:
// `settings.js` importa `./localstore` sem extensão e o runner de teste não
// resolve isso.

// Texto preenchido (sem só espaço) ou um objeto (a imagem). Campo vazio NÃO é
// "a pessoa não quer mais foto".
export function temValorDeIdentidade(v) {
  if (typeof v === 'string') return v.trim() !== ''
  return typeof v === 'object' && v !== null
}

/**
 * Devolve os ajustes da nuvem com nome, foto e bio protegidos: o que o
 * aparelho tem de verdade fica se a nuvem veio vazia nesses campos.
 */
export function protegerIdentidade(settingsDaNuvem, settingsDoAparelho) {
  const alvo = settingsDaNuvem && typeof settingsDaNuvem === 'object' ? { ...settingsDaNuvem } : {}
  const local = settingsDoAparelho && typeof settingsDoAparelho === 'object' ? settingsDoAparelho : {}
  for (const campo of ['userName', 'avatar', 'bio']) {
    if (temValorDeIdentidade(local[campo]) && !temValorDeIdentidade(alvo[campo])) alvo[campo] = local[campo]
  }
  return alvo
}
