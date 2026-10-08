// Estado de reprodução em tempo real compartilhado entre os efeitos.
//
// O App avisa aqui quando começa/para de tocar (música de arquivo, online ou
// demonstração), e o visualizador + FxLayer perguntam nesta hora. Não dá para
// usar engine.isPlaying(): esse flag só acompanha o sintetizador de
// demonstração, então com música de verdade (que toca num <audio>) ele fica
// sempre falso e nenhum efeito pulsava.
let current = false

export const getPlayState = () => current

export function setPlayState(v) {
  current = !!v
}