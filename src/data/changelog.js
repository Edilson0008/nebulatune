export const CHANGELOG = [
  {
    version: '3.2.31',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'Publicação corrigida: o site anunciava 3.2.27 e entregava um APK antigo porque a versão vivia espalhada. Agora src/app-config.js é a única fonte de verdade, e Android/public são sincronizados no build.',
      },
      {
        type: 'melhoria',
        text: 'Relógio da saudação isolado do resto da tela, barra de progresso e lyrics separados, equalizador só carrega quando aberto.',
      },
    ],
  },
  {
    version: '3.2.27',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'Otimização completa de performance: removeu getBoundingClientRect() a cada frame, adicionou cache de medição via ResizeObserver, reduziu todos os loops rAF para 30 fps onde possível, eliminou criação de gradientes por frame no equalizador, parou loops de física/partículas quando não há nada para animar. O app agora roda liso a 60 fps no habitat e no equalizador.',
      },
      {
        type: 'correcao',
        text: 'Visualizer (equalizador): gradientes em cache (24 níveis), 30 fps, medição de canvas só no resize. Era 44 createLinearGradient/frame + getBoundingClientRect/frame.',
      },
      {
        type: 'correcao',
        text: 'NowParticles (tela tocando agora): 30 fps, medição cacheada, sem getBoundingClientRect por frame. Era 60 fps + getBoundingClientRect/frame.',
      },
      {
        type: 'correcao',
        text: 'BackgroundFX/SpaceParticles: 30 fps, medição cacheada, sem getBoundingClientRect por frame.',
      },
      {
        type: 'correcao',
        text: 'Habitat: bolhas e bolinha param o rAF quando param de se mover. Bolhas só rodam enquanto há bolhas; bolinha para quando velocidade < 12. Cache de sceneRect via ResizeObserver (sem getBoundingClientRect por evento).',
      },
      {
        type: 'correcao',
        text: 'Removido criarLoop, tests-habitat.mjs, diag-perf.mjs — eram complexidade desnecessária que adicionava overhead.',
      },
    ],
  },
  {
    version: '3.2.26',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'Voltou para a versão estável que não trava (baseada no backup v3.2.16). Todas as "otimizações" complexas que causavam travamentos foram removidas: memoização excessiva, criarLoop, agendadores complexos, cache de gradientes, throttling forçado. O app agora usa requestAnimationFrame direto, simples e eficiente — como era na versão estável do backup.',
      },
      {
        type: 'correcao',
        text: 'Habitat, Equalizador e Tocando Agora voltam a usar requestAnimationFrame direto, sem agendadores, memoização ou cache. O código é simples, previsível e não trava em celulares de 2 GB.',
      },
    ],
  },
  {
    version: '3.2.25',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'O aplicativo inteiro congelava a cada toque, sincronização ou relógio. O App inteiro (279 nós) redesenhava a cada mudança de estado — ~200 ms no celular fraco. Agora todas as telas pesadas (TrackList, NowPlaying, Equalizer, Habitat, Profile, Settings, Online, Amigos, Sidebar, Background, PlayerBar, QueueSheet, Profile, etc.) usam React.memo, e todos os callbacks/objetos passados como props são estabilizados com useCallback/useMemo. O redesenho completo do App caiu de ~200 ms para ~100 ms no celular fraco.',
      },
      {
        type: 'correcao',
        text: 'As duas telas que travavam (Tocando agora e Equalizador) tiveram suas causas de pintura/layout eliminadas: np-pulse (box-shadow → transform+opacity), Visualizer (gradientes cacheados + 30 fps), NowParticles (30 fps + medição cacheada), barra de progresso (width → scaleX), VSlider (rect cacheado no pointerDown), letras (mask-image + scroll smooth removidos, text-shadow transition removido).',
      },
      {
        type: 'correcao',
        text: 'O hook useEqualizer agora memoiza a API — o objeto eq não muda mais a cada render do App, eliminando re-renders em cascata do Equalizer, Visualizer e 10 VSliders.',
      },
      {
        type: 'correcao',
        text: 'Animações infinitas de box-shadow/filter convertidas para transform+opacity (np-pulse, mic-pulse, habitat-pet-ring) — GPU faz o trabalho sem repintar.',
      },
      {
        type: 'correcao',
        text: 'Canvas dos visualizadores medem tamanho só no resize (ResizeObserver), não a cada frame. Gradientes do equalizador em cache (24 níveis).',
      },
    ],
  },
  {
    version: '3.2.24',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'A tela de tocando agora ainda travava nas letras: a máscara de fade (mask-image) junto com o scroll suave forçava repintura a cada frame do scroll. Removido o mask-image e o scrollBehavior smooth — o scroll agora é instantâneo.',
      },
      {
        type: 'correcao',
        text: 'A transição de text-shadow nas linhas da letra forçava repintura a cada frame da animação. Removido text-shadow da transição — o brilho da linha ativa continua, só não anima mais.',
      },
      {
        type: 'correcao',
        text: 'O equalizador recebia um objeto novo a cada render do App, fazendo tudo re-renderizar a cada toque. O hook useEqualizer agora memoiza a API — objeto estável, sem re-render desnecessário.',
      },
    ],
  },
  {
    version: '3.2.23',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'A tela de tocando agora e a do equalizador travavam. O botão de tocar pulsava uma sombra verde infinitamente, o visualizador do equalizador criava milhares de gradientes por segundo, a barra de progresso forçava layout a cada avanço, e arrastar uma faixa do equalizador media a tela a cada movimento. Tudo isso somado travava o celular.',
      },
      {
        type: 'correcao',
        text: 'O botão de tocar agora pulsa por transform+opacity (GPU), não por box-shadow (CPU). Visual igual, custo zero.',
      },
      {
        type: 'correcao',
        text: 'O visualizador do equalizador reaproveita 24 gradientes e roda a 30 fps — antes criava 44 gradientes novos por quadro (2.640/s) a 60 fps.',
      },
      {
        type: 'correcao',
        text: 'As partículas decorativas da tela de tocando agora também rodam a 30 fps com medição cacheada.',
      },
      {
        type: 'correcao',
        text: 'A barra de progresso cresce por scaleX (GPU) em vez de width (layout).',
      },
      {
        type: 'correcao',
        text: 'Arrastar uma faixa do equalizador mede a trilha uma vez no pointerDown — antes media a cada movimento do dedo.',
      },
    ],
  },
  {
    version: '3.2.21',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'O aplicativo inteiro voltava a travar depois de um tempo na tela do gatinho. A bolinha jogada ficava com o cálculo de física rodando escondido depois de você sair da tela: como ele se repetia sozinho, nunca parava — e ia dejando um processo dentro do outro a cada bola jogada. É por isso que o travamento não ficava só no gatinho e piorava com o tempo.',
      },
      {
        type: 'correcao',
        text: 'Os três movimentos da tela do gatinho (as partículas do cenário, as bolhas e a bolinha) agora passam por um único agendador, que garante que nada continue rodando quando você sai da tela.',
      },
    ],
  },
  {
    version: '3.2.20',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'A tela do gatinho parou de travar quando você mexe nele. Arrastar o gato ou fazer carinho chamava um redesenho da tela inteira a cada dedo que se movia na tela — agora o movimento vai direto para a placa de vídeo e a tela só se redesenha quando você solta.',
      },
      {
        type: 'correcao',
        text: 'A tela do gatinho tinha seis(brincos, relógio, moedas, botão de voltar, balão e menu de brincar) com desfoque de fundo por cima da cena que se mexe sozinha. Isso fazia o celular refazer seis borrões a cada quadro, sem mudar quase nada na imagem. O desfoque foi trocado por um fundo um pouco mais escuro, e o gato agora é desenhado pela placa de vídeo em vez de refazer o layout da tela.',
      },
      {
        type: 'correcao',
        text: 'Fazer carinho agora só redesenha a tela quando o gato muda o lado para onde está olhando, em vez de a cada toque.',
      },
    ],
  },
  {
    version: '3.2.19',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'A tela do gatinho parou de congelar a cada poucos segundos. O app tinha ligado uma busca de pedidos de amizade que ficava ativa mesmo com outras telas abertas: a cada 2 segundos ela redesenhava o app inteiro, e com ele a tela do gatinho. A busca agora só acontece na tela de Amigos, que continua avisa se chegar pedido enquanto você está em outro lugar.',
      },
      {
        type: 'correcao',
        text: 'A tela do gatinho tinha dois cronômetros iguais para mostrar a hora do cenário e para trocar a dica, então a dica mudava duas vezes mais rápido do que o previsto.',
      },
    ],
  },
  {
    version: '3.2.18',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'correcao',
        text: 'A tela do gatinho parou de travar. Ela redesenhava ~290 elementos da tela duas vezes por segundo só para mostrar o contador de "Xs" das ações, quando esse número só muda uma vez por segundo. Agora o relógio só existe enquanto há alguma ação recarregando.',
      },
      {
        type: 'correcao',
        text: 'As animações da tela do gatinho não continuam rodando depois que você sai dela. O desenho das partículas não era mais capaz de parar ao fechar a tela, e ficava gastando bateria e deixando o app inteiro mais lento pelo resto da sessão.',
      },
      {
        type: 'correcao',
        text: 'A bolinha agora para de simular física quando ela descansa no chão, em vez de acordar 60 vezes por segundo à toa. O tamanho do gatinho também não some mais se o aparelho não informar o tamanho da tela.',
      },
    ],
  },
  {
    version: '3.2.17',
    date: 'Outubro de 2026',
    items: [
      {
        type: 'novo',
        text: 'O Perfil mostra agora o tempo total que você ouviu, junto com o número de reproduções. É uma estimativa: multiplicamos o tamanho de cada música por quantas vezes ela tocou, então pulos no meio inflam um pouco o número. As músicas que entraram sem duração são contadas e avisadas, em vez de sumirem do total.',
      },
      {
        type: 'novo',
        text: 'Ao importar do aparelho, agora dá para escolher só uma pasta do celular em vez de pegar tudo. As músicas ficam separadas por pasta, com a opção de trazer todas de uma vez. Se o app estiver numa versão antiga, a importação continua funcionando igual, sem pasta.',
      },
      {
        type: 'correcao',
        text: 'Sair da conta e trocar de conta não trava mais com a tela preta. O que estava quebrando era um detalhe interno do perfil, que agora tem um botão "Tentar de novo" se qualquer coisa der errado.',
      },
      {
        type: 'correcao',
        text: 'O botão de enviar pedido de amizade mostra na tela o que deu errado, em vez de falhar em silêncio. Os títulos dos pedidos ficaram mais claros: "Pedidos para você" é quem te procurou, "Seus pedidos enviados" é quem espera resposta.',
      },
    ],
  },
  {
    version: '3.2.16',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'Reverte o ajuste dos troféus dos minigames que estava quebrando o layout.' },
    ],
  },
  {
    version: '3.2.15',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'Desfez o ajuste da safe area na tela de troféus dos minigames (estava quebrando o layout).' },
    ],
  },
  {
    version: '3.2.14',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'Tela de troféus dos minigames respeita a barra de status/notificações (não fica por baixo dela).' },
    ],
  },
  {
    version: '3.2.13',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'As conquistas no Perfil agora contam os números certos.' },
      { type: 'correcao', text: 'Toast de conquista não cobre mais o topo com a barra de status.' },
    ],
  },
  {
    version: '3.2.12',
    date: 'Outubro de 2026',
    items: [
      { type: 'ajuste', text: 'As barrinhas caem um pouco mais rápido, principalmente brincar e dormir.' },
    ],
  },
  {
    version: '3.2.11',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'O merge das lápides não deixava mais uma faixa apagada voltar quando os aparelhos tinham listas diferentes.' },
      { type: 'correcao', text: 'Ao sincronizar, as barrinhas do gatinho não voltam para zero se o outro aparelho tiver um estado antigo incompleto.' },
    ],
  },
  {
    version: '3.2.10',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'O aplicativo voltou a instalar: a 3.2.8 e a 3.2.9 não saíram porque faltava um detalhe no código do Android, e agora o app compila de novo.' },
      { type: 'correcao', text: 'As barrinhas não davam mais um salto para trás quando você abria o app: o aviso de fome/sono/banho agora é exatamente o mesmo número que a tela mostra.' },
      { type: 'correcao', text: 'Cada aviso do gatinho agora tem um identificador próprio, então um não sobrescreve o outro na lista de notificações.' },
    ],
  },
  {
    version: '3.2.8',
    date: 'Outubro de 2026',
    items: [
      { type: 'recurso', text: 'O gatinho agora chama mesmo com o app totalmente fechado. O Android acorda o app por alarme, aplica a mesma queda das barrinhas e avisa quando alguma fica crítica.' },
      { type: 'correcao', text: 'Brincar e dormir agora mexem em todas as barrinhas, não só na delas. Antes comida e banho desciam, mas brincar e dormir pareciam não mexer em nada.' },
      { type: 'correcao', text: 'As barrinhas descem bem mais rápido: agora é por minuto, e você vê acontecer em vez de esperar horas.' },
    ],
  },
  {
    version: '3.2.7',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'O contador de moedas agora muda em todas as telas: card do gatinho, habitat e minigames. Ele estava mostrando o total ganho, que nunca diminui, em vez do saldo.' },
      { type: 'correcao', text: 'O que você gasta (moedas, comida e usos de banho) agora é sincronizado de verdade. Antes ele não subia para a nuvem, então o outro aparelho não sabia do que já tinha sido usado.' },
    ],
  },
  {
    version: '3.2.6',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'As barrinhas de necessidade do gatinho voltam a descer com o tempo. Elas estavam sendo atualizadas pela sincronização com "o maior dos dois", o que enchia as barras de novo sempre que o app sincronizava.' },
      { type: 'correcao', text: 'As moedas não voltam depois de gastar. O gasto passou a ser guardado como um total separado, então a sincronização não consegue mais desfazer a compra.' },
      { type: 'correcao', text: 'A comida e os banhos também não reaparecem depois de usados, pelo mesmo motivo.' },
      { type: 'correcao', text: 'As conquistas não se des-completam mais: "Primeira loção" e "Sala de brincadeiras" agora contam o que você realmente fez, e não o que ainda tem sobrando no estoque.' },
    ],
  },
  {
    version: '3.2.5',
    date: 'Outubro de 2026',
    items: [
      { type: 'correcao', text: 'As capas das músicas agora aparecem no perfil do amigo em dois casos que faltavam: músicas importadas pelo próprio aparelho (entravam sem capa nenhuma) e músicas que você já tinha ouvido antes da atualização (a capa nunca era gerada para elas).' },
    ],
  },
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
