// Agendador de quadro único para os loops de animação.
//
// Por que existe: cada loop da tela repetia a mesma dances de
// `raf = requestAnimationFrame(loop)` e, na limpeza do efeito, tentava
// `cancelAnimationFrame(raf)`. Numa delas a limpeza zerava `raf` ANTES de
// cancelar — cancelava o zero, o quadro de verdade continuava vivo, e como o
// loop se reagenda sozinho ele rodava 60x por segundo para sempre, mesmo
// depois de sair da tela: queimando CPU e forcando layout no app INTEIRO. Cada
// bola arremessada deixava mais um loop zumbi, por isso o travamento piorava
// com o tempo e saía do habitat.
//
// Aqui o id do quadro só pertence a este objeto, e `dormir()` cancela SEMPRE
// antes de zerar. Não existe caminho em que o id se perca.
export function criarLoop(loop) {
  let raf = 0
  let vivo = true

  // `proximo` agenda o quadro seguinte. O loop decide se quer continuar
  // chamando (movimento) ou não (parou): quem para de pedir, para.
  const proximo = () => {
    raf = requestAnimationFrame(quadro)
  }

  function quadro(agora) {
    if (!vivo) return
    raf = 0
    loop(agora, proximo)
  }

  return {
    // Liga o loop. Chamar de novo enquanto ele já roda não faz nada.
    acordar() {
      if (!vivo || raf) return
      raf = requestAnimationFrame(quadro)
    },
    // Desliga e garante que NENHUM quadro fique pendente. Seguro para chamar
    // quantas vezes quiser.
    dormir() {
      vivo = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    // Só para o loop em si, mantendo o agendador utilizavel. Usado pela
    // física da bolinha quando ela encosta no chão: o agendador continua
    // pronto para o próximo arremesso.
    pausar() {
      cancelAnimationFrame(raf)
      raf = 0
    },
    get rodando() {
      return vivo && raf !== 0
    },
  }
}