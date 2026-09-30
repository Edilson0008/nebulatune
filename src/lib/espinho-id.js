// Id de espinho é STRING (não número). Um bug antigo lia esse id com Number()
// e os cactos nunca eram posicionados/movidos (ficavam invisíveis). O id só
// serve de chave dos mapas internos do jogo.
export const novoEspinhoId = () => Math.random().toString(36).slice(2)