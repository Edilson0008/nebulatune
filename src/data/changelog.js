export const CHANGELOG = [
  {
    version: '3.2.4',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'Apagar uma música agora apaga de verdade. Antes ela voltava sozinha na sincronização seguinte, e as reproduções dela continuavam aparecendo no card do seu amigo — como se a música ainda estivesse lá.' },
      { type: 'novo', text: 'A lista de músicas apagadas fica guardada na nuvem, então a limpeza vale em qualquer aparelho onde você entrar.' },
    ],
  },
  {
    version: '3.2.3',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'As capas das músicas aparecem no perfil do amigo. A miniatura estava sendo gerada, mas se perdia ao salvar a biblioteca — por isso a capa nunca chegava. Agora ela fica salva e vai para a nuvem.' },
    ],
  },
  {
    version: '3.2.2',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'A capa das músicas aparece no perfil do amigo. Antes, só aparecia quando a capa vinha da internet (iTunes) — música com capa do próprio arquivo ficava sem capa no perfil de quem é seu amigo.' },
      { type: 'novo', text: 'Só a capa é enviada, em miniatura: 64 pixels, no máximo 6 KB. O áudio continua 100% no seu aparelho, como sempre.' },
      { type: 'correcao', text: '"Online agora" some mais rápido quando você fecha o app. O app avisa na hora ao ser fechado e a janela caiu de 5 minutos para 2.' },
      { type: 'correcao', text: 'Amigos e o resto da nuvem são atualizados mais rápido: pedidos e lista a cada 2 segundos (antes 3), o resto a cada 5 segundos (antes 8).' },
    ],
  },
  {
    version: '3.2.1',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'O pedido de amizade aparece na hora, mesmo com a aba Amigos fechada. Antes o app só olhava os pedidos enquanto você estava NA tela de Amigos: saía da aba e o pedido ficava escondido até você voltar.' },
      { type: 'correcao', text: 'Voltar para o app já mostra o que chegou enquanto você estava em outra tela. A lista de amigos também é atualizada sozinha a cada 3 segundos, em vez de 8.' },
      { type: 'correcao', text: '"Online agora" para de sumir: com o app aberto, o status se renova sozinho a cada minuto. Antes, quem ficava 5 minutos com o app na mão aparecia como "visto há 16 min" — marcado como offline com o app aberto.' },
    ],
  },
  {
    version: '3.2.0',
    date: 'Outubro de 2026',
    items: [
      { type: 'novo', text: 'A tela de Amigos: cada conta tem um código, você encontra a pessoa por ele e o pedido pode ser aceito ou recusado. A lista de amigos mostra foto, bio e se a pessoa está online agora.' },
      { type: 'novo', text: 'Abrindo o perfil de um amigo dá para ver as estatísticas dele: músicas, reproduções e dias ouvindo. Dá para remover a amizade de lá também.' },
      { type: 'novo', text: 'A cor do card do amigo é a cor do tema que a pessoa está usando. Se ela está no tema vermelho, a borda da foto e o nome aparecem em vermelho — e mudam junto se ela trocar de tema.' },
      { type: 'correcao', text: 'As músicas, fichas e conquistas de uma conta não aparecem mais na conta seguinte. Ao trocar de conta no mesmo aparelho, o app agora começa pelo zero em vez de herdar o que era da outra conta.' },
      { type: 'correcao', text: 'Nome, bio e foto que você edita aparecem na hora no card do outro, sem precisar mexer em nada. Antes às vezes a foto ou a bio mudavam e o outro lado continuava vendo a versão antiga.' },
      { type: 'correcao', text: 'Abrir o app com a conta trocada não trava mais: o perfil voltava a não ser publicado e o outro continuava vendo a versão antiga para sempre.' },
    ],
  },
  {
    version: '3.1.3',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Os cactos do minigame "Pule os Espinhos" aparecem de verdade agora. O problema era de posicionamento (o espinho ficava invisível, mas a colisão continuava ativa), não do desenho.' },
    ],
  },
  {
    version: '3.1.2',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'O backup agora é só de músicas. Exportar guarda suas músicas COM o som e a capa num arquivo só — é como elas passam de aparelho (na nuvem elas nunca sobem).' },
      { type: 'novo', text: 'Importar backup adiciona as músicas do arquivo e não mexe mais em configurações, gatinho nem playlists: esses vêm pela sua conta.' },
      { type: 'novo', text: 'Ao importar o backup, as estatísticas (plays e favorita) já combinam com a conta na hora.' },
      { type: 'correcao', text: 'Músicas sem arquivo de som no aparelho ficam de fora do backup com um aviso, em vez de saírem mudas no arquivo.' },
    ],
  },
  {
    version: '3.1.1',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'A música em si (o arquivo de áudio) nunca sai do aparelho — e agora ela também não aparece mais como faixa "sem áudio" no outro celular. Nada vai ficar poluindo sua lista.' },
      { type: 'novo', text: 'As estatísticas continuam viajando: ao importar o mesmo arquivo de música no outro aparelho, reproduções, favorita e dias ouvidos voltam sozinhos (o app reconhece a música pelo título, artista e duração).' },
      { type: 'correcao', text: 'Removidas automaticamente as faixas fantasma "sem áudio" que a versão 3.1.0 tinha deixado na lista.' },
    ],
  },
  {
    version: '3.1.0',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'Conta (opcional): entre em Configurações › Minha conta. Tudo continua funcionando sem entrar — o app segue 100% no seu aparelho.' },
      { type: 'novo', text: 'Sincronização automática: com a conta conectada, o que você muda num celular aparece no outro sozinho — favoritas, reproduções, playlists, moedas do gatinho, recordes dos minijogos, nome e tema.' },
      { type: 'novo', text: 'Esqueceu a senha? Agora dá para criar uma nova pelo link que chega no e-mail.' },
      { type: 'correcao', text: 'A busca por versão nova voltou a funcionar: ela estava travada na 1.9.28 e não avisava das últimas versões.' },
    ],
  },
  {
    version: '3.0.1',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'A barra de baixo (Início, Biblioteca...) não cobre mais os botões do habitat do gatinho: ela some enquanto o habitat está aberto.' },
      { type: 'correcao', text: 'Os cactos do minigame "Pule os Espinhos" agora aparecem de verdade: antes ficavam invisíveis em alguns aparelhos.' },
      { type: 'correcao', text: 'Som 3D/8D corrigido — não causa mais tela preta ao ligar.' },
    ],
  },
  {
    version: '3.0.0',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'Minijogos: Corte as Frutas! Fatia as frutas com o dedo, elas voam alto, e cuidado: se cortar a bomba o jogo acaba. São 3 rodadas cada vez mais difíceis.' },
      { type: 'novo', text: 'Minijogos: Chuva de Moedas arrumada — as moedas não ficam mais presas no topo e a meta agora conta só moedas (a bomba virou desafio extra).' },
      { type: 'novo', text: 'Medalhas em cada minijogo: bronze, prata e ouro de acordo com a pontuação.' },
      { type: 'novo', text: 'Bônus diário com sequência de dias: quanto mais dias seguidos, maior o bônus (até 20+).' },
      { type: 'novo', text: '8 troféus/conquistas para desbloquear e resgatar moedas: primeiro jogo, veterano, maratonista, campeão, mestre dos 7 jogos, medalhista e dias seguidos.' },
      { type: 'novo', text: 'Pausa em qualquer jogo, com opções de som e saída. Recomeçar a contagem e os objetos congelam de verdade.' },
      { type: 'novo', text: 'Sons mais altos quando não tem música tocando — e discretos quando tem.' },
    ],
  },
  {
    version: '1.9.28',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Corrigido o bug que deixava a tela preta ao abrir o app.' },
      { type: 'novo', text: 'Novo botão "Liberar espaço das músicas" nas Configurações: apaga o que sobrou de músicas que você já removeu, sem mexer nas suas músicas atuais.' },
      { type: 'novo', text: 'O app ficou bem mais leve de abrir: Perfil, Online e Configurações só carregam quando você abre.' },
      { type: 'correcao', text: 'O app não guarda mais no aparelho a música que toca da internet, então ele para de encher sozinho. As capas e as letras traduzidas voltam a atualizar direito.' },
    ],
  },
  {
    version: '1.9.27',
    date: 'Setembro de 2026',
    items: [
      { type: 'novo', text: 'Busca por voz na barra de pesquisa, Recentes de verdade no início, Conquistas com banner de desbloqueio, Top do mês automática, sino com avisos úteis, cores novas e cor personalizada, e Modo leve para celular simples.' },
      { type: 'correcao', text: 'Biblioteca e Perfil mais limpos, letras que acham música com acento, controle de ganho no equalizador e conserto do Importar do aparelho.' },
    ],
  },
  {
    version: '1.9.26',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Corrigido o bug que fazia metade das músicas voltar sem capa (e às vezes sem som) ao reabrir o app ou o site: a leitura das músicas era encerrada no meio do caminho. Agora todas carregam completas.' },
    ],
  },
  {
    version: '1.9.25',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Agora TODAS as capas aparecem: as que vieram da internet (busca automática) tinham sumido ao reabrir o app, só voltavam as que vêm de dentro do próprio arquivo. Todas voltam agora.' },
    ],
  },
  {
    version: '1.9.24',
    date: 'Setembro de 2026',
    items: [
      { type: 'correcao', text: 'Corrigido um bug que fazia as capas das músicas sumirem e o áudio não carregar (ele tocava um som de "quem aprende piano", que era um áudio de teste de reserva). Agora cada música volta a abrir com capa e som corretos.' },
    ],
  },
]
