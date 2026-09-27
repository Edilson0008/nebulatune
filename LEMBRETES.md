# Lembretes

## FEITO em 27/09 (1.9.28/54) — tela preta + APK leve + menos espaço
- **Tela preta ao abrir: era um import faltando.** `src/components/track-list.jsx`
  usava `memo(...)` sem ter o `memo` importado do `react` — a lista de músicas
  quebrava ao montar e derrubava o app inteiro. Corrigido.
- Segundo bug do mesmo tipo que eu mesmo introduzi: `use-lyrics-translation`
  refazia a lista de linhas a cada render e disparava a tradução em laço
  (tela travada). A chave passou a ser o **texto** das linhas, não o array.
- **Novo teste que pega esse tipo de erro** (`scripts/tests-render.mjs`):
  monta os **29 componentes** do app em memória, sem navegador, e falha se
  algum não renderizar. Ele achou o `memo` faltando. Roda no `pnpm test`
  (14 testes). O shim de navegador está em `scripts/browser-shim.mjs`.
- `.gitignore` novo: `dist`, `ssr-out`, `android/build`, `node_modules`.
- APK: o `build-android.sh` agora apaga também `public/projeto` do
  `assets/public` (12,4 MB = 75% do APK era o próprio código-fonte). O APK
  sai de 16,7 MB para ~4,5 MB. **Falta recompilar no PC** (sem JDK/SDK aqui
  e o `aapt2` x86_64 não roda em Android/ARM).
- **Pendência: a chave de assinatura `android/keystore/nebulatune-release.jks`
  não está no celular.** O `keystore.properties` (senhas) está no git e
  confere, mas o `.jks` não aparece em nenhum lugar do armazenamento. Sem ela
  o Android não aceita atualizar mantendo as instalações. O arquivo precisa ser
  transferido para o PC (e NÃO commitado — ver `.gitignore`).

## FEITO em 27/09 — manutenção do código (sem mudança de visual, sem bump de versão)
- `src/App.jsx` estava com **7.650 linhas** (275 KB). Foi quebrado em:
  `src/components/` (uma tela por arquivo: `now-playing`, `pet`, `player-bar`,
  `track-list`, `library-ui`, `settings-view`, `online-view`, `profile`,
  `queue-sheet`, `equalizer`, `visualizer`, `background`, `Cover`, `mic-button`,
  `media-session-bridge`), `src/hooks/` (`use-player`, `use-online-player`,
  `use-mood-detector`, `use-lyrics-translation`, `use-media-session`) e
  `src/lib/` (função pura: `format`, `cover`, `filename`, `lyrics`, `stats`,
  `pet`, `fanfare`, `share`, `sleep-native`, `translate-cache`, `env`) +
  `src/data/changelog.js`. **`App.jsx` ficou com 2.121 linhas** (estado global
  e tela inicial). Nenhuma linha de código foi perdida (conferido por diff de
  linhas) e o comportamento é o mesmo — build, lint e testes iguais.
- Corrigido de verdade: os 2 arquivos de teste estavam quebrados
  (`mediaNotification.test.mjs` importava `src/` por caminho absoluto do PC do
  autor; `scripts/tests-mediaNotification.mjs` apontava para `scripts/src/` que
  não existe) e 2 testes affirmavam coisa errada (sem capa a notificação
  **usa o ícone do app**, de propósito).
- `pnpm test` e `pnpm verify` novos no `package.json`; CI `.github/workflows/
  check.yml` roda lint + testes + build a cada push.
- Lint: 20 avisos → **0**. `no-func-assign` resolvido trocando `X = memo(X)`
  por `const X = memo(function X(...))`; `only-export-components` resolvido
  parando de exportar constante junto de componente (`useProgress` foi para
  `src/progress-context.js`); `set-state-in-effect` resolvido puxando o reset
  de humor/tradução para o render (a tela também deixa de piscar o valor
  antigo). Os 4 `exhaustive-deps`(sumiram) eram dependências de `useCallback`
  estáveis — foram adicionadas de verdade.
- `AGENTS.md` corrigido: a nuvem/login foi removida DE VEZ (1.9.17) — não é mais
  pendência, e o texto antigo mandava lembrar o usuário de algo que não existe.

## FEITO em 27/09 — menos espaço e mais fluidez (sem bump de versão)
- **APK 17,5 MB → ~4,5 MB.** Descobri que 12,4 MB do APK (75%!) era o próprio
  código-fonte: `public/projeto/nebulatune-src.zip` estava sendo copiado para
  dentro do app. O `build-android.sh` já apagava `apk/` e `backup/` do APK
  (senão o app embolia uma cópia de si mesmo), mas esquecia do `projeto/`.
  Agora apaga os três. O zip continua disponível no site.
- **O app não guarda mais o áudio streaming nem as respostas de API.** O
  service worker (`public/sw.js`) guardava *qualquer* GET, inclusive a música
  que tocava do Audius (isso enchia o aparelho de sobra) e a letra antiga
  continuava aparecendo mesmo com a internet funcionando. Agora só guarda o
  app em si e as capas; áudio, vídeo e API ficam de fora.
- `sw.js` não sabia mais a própria versão (tava travado em `1.9.26`, então o
  cache offline não se limpava sozinho nas versões novas). A versão agora é
  escrita no build pelo `vite.config.js` — não dá para esquecer de novo.
- **Novo botão "Liberar espaço das músicas"** em Configurações: apaga só os
  arquivos de músicas que você já removeu da biblioteca (antes esses blobs
  ficavam ocupando espaço para sempre, sem como limpá-los). A "Limpar cache"
  antiga continua igual, porque ela **não** pode apagar isso.
- Telas `Perfil`, `Online` e `Configurações` passaram a carregar só quando são
  abertas (`lazy` + `Suspense`), em vez de pesar na abertura do app.
- Pacote principal: 422 KB → 410 KB (o resto virou 3 arquivinhos de 3 a 7 KB
  que só vêm quando a tela é aberta).

## FEITO em 25/09 (1.9.27/53) — leva de melhorias + conserto do importar
- Busca por voz na barra de pesquisa (início e topo); aba Buscar removida,
  pesquisa centralizada no topo do início. Recentes de verdade (histórico salvo
  no aparelho). Biblioteca e Perfil minimalistas (menu ⋯, sem duplicatas nas
  Configurações). Conquistas com banner de desbloqueio + som + recolhível.
  Top do mês automática. Sino com avisos úteis (atualização, gatinho, sem áudio,
  última conquista). Cores novas + personalizada. Modo leve (celular simples).
  Letras sem acento + manual ordenada. Ganho de entrada no equalizador.
- Consertado Importar do aparelho (lista vinha em formato errado e quebrava a
  tela; permissão agora responde). Limpeza: supabase/setup.sql e
  src/storage/db.js apagados, backup.js enxutado. Tela preta do Top do mês
  corrigida (mesmo dia).

## FEITO e PUBLICADO em 22/09 (1.9.26/52) — metade das músicas sem capa/som ao reabrir
- BUG real de `loadAllMediaBlobs` (localstore.js): contava respostas errado —
  esperava N respostas, mas cada música dispara 2 (áudio+capa) → resolvia no
  meio, deixando ~metade com blobs null. Por isso capas iam e voltavam.
  Corrigido: cada par sinaliza UMA vez (pairDone===2 → pending--).
  Também explica o "piano" nas 1.9.24/25 (áudio de metade das músicas faltava).

## FEITO e PUBLICADO em 22/09 (1.9.25/51) — capas das músicas da internet voltam
- Hidratação ignorava `coverRemote` (capa achada no iTunes): na reabertura do app,
  essas capas viravam meu gradiente. Agora: `coverUrl = coverBlob ? blob :
  row.coverRemote || prevCover`. Capas de TODAS voltam.

## FEITO e PUBLICADO em 22/09 (1.9.24/50) — corrigido capas sumindo + áudio "piano"
- CRÍTICO: `loadAllMediaBlobs` devolvia lista ACHATADA (áudio,capa,áudio,capa...)
  e o App lia `.audio`/`.cover` → tudo vinha vazio (sem capa; play tocava o
  synthFallback "piano"). Corrigido: devolve [{audio, cover}, ...] por música.
- Causa introduzida na 1.9.21. Changelog máx. 4 (1.9.20 saiu). APK no celular.

## FEITO e PUBLICADO em 22/09 (1.9.23/49) — a gatinha ganhou nome: Nebula
- O gatinho agora se chama NEBULA (nome que o dono escolheu): se apresenta ao
  pedir o nome do usuário, fala "eu sou a Nebula" e aparece como
  "🐱 Nebula, seu gatinho" na notificação e "Nebula 🐾" no lembrete do site.
- Todos os pontos de download do site usam `apk/nebulatune.apk` (sempre a
  versão mais nova, regravada no build). Changelog máx. 4 (1.9.19 saiu).

## FEITO e PUBLICADO em 22/09 (1.9.22/48) — gatinho fala com você, notifica, + corretivos
- Gatinho chama pelo NOme: usa appSettings.userName nas saudações e interações
  (toque, favoritos, humor, tédio, volta). Sem nome salvo, ele pergunta. `name`
  entra via `userName` prop no PetFriend/PetHabitatCard/NowPlaying +
  `pickNamePool` (frases com {n} só com nome).
- 3 animações novas: `pet-jump`, `pet-spin`, `pet-boing` (CSS + playOpts/idleOpts).
- Notificações de retorno: app nativo usa `@capacitor/local-notifications`
  (ADICIONADO como dep; canal 'pet'; schedule ao ir p/ background ~1,5-5h;
  cancel ao voltar; id 9017; icon ic_notification). Site: cartão
  `.pet-reminder` após 45 min sem mexer (petNudges.js tem as mensagens).
- Corrigido sumiço de músicas: salvamento da biblioteca só grava após a
  hidratação (libraryHydrated) — antes o app reescrevia 'nt.library' vazio.
- Otimizações: will-change no .pet-body, keyframes de transform só.
- Changelog máx. 4 (saiu 1.9.18, entrou 1.9.22). APK 1.9.22/48 no celular,
  site na 1.9.22.

## FEITO e PUBLICADO em 22/09 (1.9.21/47) — corrigido "Carregando biblioteca…" preso
- Bug: ao reabrir o app às vezes ficava preso em "Carregando sua biblioteca…".
  Causa: abria o IndexedDB 1x por música (lento em biblioteca grande) e uma
  música com blob inválido derrubava o loop (tela presa para sempre).
- Correção: novo `loadAllMediaBlobs` em localstore.js (uma transação única,
  rápida); App.jsx pula músicas defeituosas (try/catch por linha) e tem rede de
  segurança que zera o loading em até 8s. Import passou a ser `loadAllMediaBlobs`.
- Changelog segue máx. 4 (saiu 1.9.17, entrou 1.9.21). Lint 0, build OK, APK
  1.9.21/47 no celular.

## FEITO e PUBLICADO em 22/09 (1.9.20/46) — mini player só na tela inicial
- O mini player agora só aparece na **tela inicial** (`view === 'inicio'`) e
  apenas quando há música selecionada/tocando. Ficou um pouco mais baixo: web
  `margin-bottom` 58px→40px; nativo `bottom` 66px+10px→66px+4px (App.css).
- Changelog segue máx. 4 (saiu 1.9.16, entrou 1.9.20). Lint 0 erros, build OK,
  APK 1.9.20/46 copiado para o celular.

## FEITO e PUBLICADO em 22/09 (1.9.19/45) — backup completo
- **Exportar/Importar agora guarda TUDO num arquivo só:** músicas (som + capa,
  favoritas, plays), configurações (`settings`), gatinho (`petStats` —
  `restorePetStats` faz restauração exata, diferente do `applyPetStats` que só
  faz crescer), playlists e sincronia das letras (`lyricSync`). Backup sem
  música também importa (config-only); `onImport(tracks, extra)` aplica o extra
  via `settingsApi.setAll` + `setPlaylists` + `setSyncOffsets`.
- Lint 0 erros, build web OK, APK 1.9.19/45 gerado e copiado para o celular.

## FEITO e PUBLICADO em 22/09 (1.9.18/44) — Design 2.0 + performance + letras
- **Visual "Design 2.0" cósmico:** tema roxo/rosa/verde/ciano, header (logo +
  badge verde + sino + avatar orbital), habitat do gatinho renovado (pílulas de
  humor, orbs, barra 🔔 Toques / 🪙 Moedas / 👻 Sustos), grid "Destaques recentes",
  player flutuante com shuffle/repeat/cast, capas com play verde, progresso
  ciano→rosa. A pedido do usuário, a ilha com cristais em baixo do gatinho foi
  REMOVIDA (o gatinho agora flutua com orbs/glow).
- **Moedas:** +2 por toque no gatinho e +1 por música iniciada (`countPlay`),
  gravadas em `nt.petstats`. Sem gasto ainda.
- **Letras:** busca agora consulta LRCLIB (sincronizada) + lyrics.ovh (fallback
  simples, aviso "não é sincronizada"); aceite mais flexível + busca manual
  estruturada.
- **Performance:** progresso via `ProgressProvider`/`useProgress` (`src/progress.jsx`)
  — só PlayerBar/NowPlaying/QueueSheet/OnlineView re-renderizam por segundo; App
  deixou de ter `displayElapsed/duration/progress`; `useMediaSession` virou
  `MediaSessionBridge`. `PlayerBar`, `NowPlaying`, `MusicRow`, `QuickTrackGrid`
  memoizados; blur 12px só no habitat/player; `will-change` no canvas/estrelas.
- **Changelog interno: MÁXIMO 4 versões** (a mais nova no topo). Ao lançar nova
  versão, REMOVER a mais antiga para entrar a próxima. (Regra do usuário.)
- Lint 0 erros, build web OK, APK 1.9.18/44 gerado e copiado para o celular.

## Nuvem / login — REMOVIDO (1.9.17/43, 22/09) → app 100% local
- **A PEDIDO do usuário:** o NebulaTune não tem mais conta, login, sincronização
  nem servidor. O app abre direto na música e TODOS os dados ficam só no aparelho:
  biblioteca (metadados em `localStorage` `nt.library` + áudio/capa no IndexedDB
  `nebulatune-media`), favoritos/estatísticas (vão junto na biblioteca), playlists
  (`nt.playlists`), sincronia de letras (`nt.lyricSync`), ajustes (`nt.settings`),
  equalizador (`nt.equalizer`) e gatinho (`nt.petstats`).
- **Removido:** dependência `@supabase/supabase-js`, `src/cloud.js`,
  `src/useCloudSync.js`, chaves `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` do
  `src/app-config.js`, tela de login/cadastro, card de boas-vindas, card
  "Conta e sincronização" (incl. "Sincronizar agora" e "Apagar tudo"),
  reset de fábrica one-shot do `main.jsx` e a pill "☁️ Nuvem" (a origem é
  sempre "📁 Meus Arquivos"). Exportar/Importar backup (`backup-completo`)
  continua funcionando 100% local.
- **FEITO (22/09):** o usuário apagou o projeto do Supabase no painel
  (`omusoirnpyduuyeirreo`) — confirmado pelo próprio usuário. A pasta
  `supabase/setup.sql` foi apagada do repositório (24/09) junto com a limpeza
  do código morto — não tinha mais nenhum uso.

## Site publicado (feito)
- Site oficial no ar: https://edilson0008.github.io/nebulatune/
- `SITE_URL` em `src/app-config.js` já aponta para esse endereço.
- Repositório: https://github.com/Edilson0008/nebulatune
- Publicação automática ATIVA: `.github/workflows/deploy.yml` reconstrói e
  publica o site sozinho a cada envio para o branch `main`.
- Para atualizar o site, basta enviar as mudanças para o `main`. (O token do
  GitHub precisa do escopo `workflow`.)

## Login e sincronização (HISTÓRICO — superado pelo 1.9.17)
- Toda a era da nuvem (Supabase, login por e-mail/senha, sincronização em dois
  sentidos, Realtime, conta de teste `nbl-teste2-1790089781209@example.com`,
  Google OAuth) foi REMOVIDA em 22/09 na 1.9.17/43. Ver "Nuvem / login — REMOVIDO"
  no topo. O usuário pode apagar o projeto Supabase sem medo.

## Atualização do app (feito)
- Botão "Atualizar" em Configurações → Aplicativo: verifica a versão no site
  (`version.json`) e, se houver nova, baixa e abre o instalador (plugin Android
  `AppUpdater`, com permissão `REQUEST_INSTALL_PACKAGES`).
- Ao abrir o app, se estiver numa versão antiga, aparece uma janela avisando,
  com "Atualizar agora" ou "Deixar pra depois" (uma vez por sessão).
- PRIMEIRA atualização é manual: instalar uma vez o APK novo. Depois disso o
  próprio app atualiza.

## Feito e PUBLICADO em 22/09 (1.9.7/33 — NADA sobra no aparelho)
- **SÓ NUVEM, de verdade:** depois que quem apaga são a conta e a exclusão
  propaga, o último bastião de dados locais caiu. Os ajustes do equalizador,
  os ajustes gerais e as estatísticas do gatinho NÃO ficam mais gravados no
  aparelho (`localStorage` removido de `src/settings.js`, de
  `src/audio/equalizer.js` e dos `PetStats`). Tudo que existe é o que está na
  sua conta: ao entrar, o app cria um "retrato de fábrica" só em memória e
  cada aparelho converge para os mesmos números. Apagar a conta ("Apagar
  todos os meus dados" → `cloud.purgeAll`) zera em todos os aparelhos.
- **Reset de fábrica de verdade:** o tapinha em "redefinir" (`main.jsx`,
  one-shot `nt.v2reset`) limpa o `localStorage` para valer — quem quer do
  zero, nasce do zero.
- Lint 0 erros, build web OK, APK 1.9.7/33 gerado.

## Versões (importante)
- Versão atual publicada/remota: **1.9.27 / código 53** (APK real na main +
  site). Fonte da verdade = GitHub.

## FEITO em 22/09 (1.9.17/43) — app 100% local (removida a nuvem)
- Áudio e capa da biblioteca agora são guardados DE VERDADE no aparelho:
  `src/localstore.js` (localStorage `nt.library` + IndexedDB `nebulatune-media`).
  Bibliotecas antigas da era nuvem não migram sozinhas — quem usava conta e
  quiser o que tinha, precisa exportar o backup no site e importar no aparelho.
- Persistência restaurada: `nt.settings`, `nt.equalizer`, `nt.petstats`,
  `nt.playlists`, `nt.lyricSync`.
- O "Limpar cache" das Configurações NÃO apaga mais playlists nem letras (só
  transições/buscas/view). Músicas e seus blobs também ficam intactos.
- Lint: sem erros. Build web OK. APK 1.9.17/43.

## FEITO em 22/09 (1.9.16/42) — Realtime + origem da faixa + letra na nuvem
- **Histórico (superado pela 1.9.17):** Realtime (`subscribeUserTables`),
  pill de origem `☁️ Nuvem`, letra manual na nuvem (`saveLyric`) e o card de
  conta com "✅ Dados 100% sincronizados". Tudo isso foi REMOVIDO na 1.9.17.

## Versões — histórico de publicações
- **ATENÇÃO (21/09):** pasta sincronizada com o GitHub via `git reset --hard
  origin/main` (backups: `%TEMP%\opencode\nebulatune-*.patch`). NÃO trabalhar
  sobre versão antiga.
- **PENDENTE CRÍTICO (21/09):** usuário relatou que o app/site (1.9.x) está
  TRAVANDO/CONGELANDO após as otimizações feitas "pelo celular". Investigar
  performance (lista memoizada, throttle de elapsed, content-visibility,
  animações do gatinho/partículas/planetas) e corrigir.
  → **FEITO E PUBLICADO (21/09, commit e5c3bcb na main):** os pontos pesados
  foram corrigidos (ver "Feito em 21/09" abaixo). Falta só o usuário instalar
  o APK novo no celular e apertar "Sincronizar agora".
- Ao lançar versão nova, manter em sincronia:
  `APP_VERSION` (`src/app-config.js`), `versionName`/`versionCode`
  (`android/app/build.gradle`). O `version.json` do site é gerado sozinho a
  partir do `APP_VERSION` no deploy.
- `versionName`/`versionCode` ainda são atualizados à mão no `build.gradle`.

## Feito e PUBLICADO em 21/09 (1.9.6/32 na main — a conta manda; exclusão e envio leves)
- **PEDIDO DO USUÁRIO (21/09):** "o áudio foi, só que sem áudio o som e as outras
  informações continuam diferente; verifique o projeto todo para ver se está
  salvando dados no próprio dispositivo e tire isso para ficar apenas da nuvem."
  Auditoria feita: o aparelho guardava biblioteca (IndexedDB) e ajustes
  (localStorage `nt.settings`, `nt.petstats`, `nt.equalizer`, `nt.playlists`,
  `nt.lyricSync`) e podia SOBRESCREVER a conta com esses valores velhos.
- **CAUSA RAIZ DOS AJUSTES DIFERENTES:** o `pushBackup` usava "valor local
  sempre vence" — então, ao abrir, o aparelho reenviava a versão DELE por cima do
  que o outro aparelho tinha acabado de mudar. Agora há o conceito de `dirty`:
  o app compara o que tem com o que recebeu por último da conta (`baseRef` em
  `useCloudSync.js`). Se NÃO mudou nada, a CONTA manda; se você mudou, a sua
  mudança vence e sobe. Ajustes passam a convergir nos dois aparelhos.
- **EXCLUSÃO DE VERDADE:** antes, apagar uma música no aparelho fazia a nuvem
  "ressuscitar" ela no envio seguinte (o `pushBackup` re-adicionava o que estava
  na conta). Agora existe uma lista de excluídas (`removed`) no `index.json`:
  apagar em um aparelho tira de todos; o aparelho avisa a conta via
  `cloud.markRemoved` (`removeTrack`/`clearLibrary` em `App.jsx`). Excluídas
  antigas são esquecidas após 30 dias.
- **FIM DO VAI-E-VOLTA:** quando um aparelho recebia a conta, ele reenviava na
  hora e o outro via o envio e reenviava de volta — loop eterno (e reconvertia
  áudios sem parar). Agora, ao receber, o app adota a assinatura recebida e NÃO
  devolve, a menos que você tenha mudado algo (`justPulledRef`).
- **ENVIO LEVE (anti-travamento):** o `buildBackup` não converte mais o áudio de
  TODAS as músicas para base64 a cada envio. O `pushBackup` só lê/converte o
  arquivo quando a conta AINDA não tem aquele som (reaproveita `audioKey`
  existente). Bibliotecas grandes deixam de travar a sincronização.
- **Auditoria de armazenamento no aparelho:** o que fica local é apenas CACHE/
  necessário: áudio e capa (para tocar offline), biblioteca (cópia da conta) e
  estados de tela (`nt.view`, `nt.recent`, `nt.trans`, sessão do login). Nada
  disso é "dono" dos dados: a conta é a fonte da verdade.
- Lint 0 erros (13 avisos antigos), build web OK, APK 1.9.6/32 gerado.

## Feito e PUBLICADO em 21/09 (1.9.5/31 na main — envio à prova de falhas + tudo sobe)
- **DIAGNÓSTICO (21/09, verificado de verdade):** o servidor Supabase está OK —
  login, leitura e envio funcionam (testado com a conta-teste: login 200,
  listagem do bucket 200, upload 200). Logo, o problema não é o servidor.
- **BUG GRAVE ENCONTRADO (envio escondido):** `syncNow` fazia push e, logo
  depois, pull; o pull sempre fazia `setMessage('')` — então, se o ENVIO
  falhasse, a mensagem de erro era APAGADA e o app dizia "tudo certo" mesmo sem
  nada ter subido. Agora o aviso/erro do envio é preservado (`pushWarnRef`).
- **BUG GRAVE ENCONTRADO (1 arquivo travava TUDO):** no `pushBackup`, se o
  upload do som de UMA música falhasse (ex.: arquivo maior que o limite do
  servidor), o `throw error` derrubava o envio inteiro — nem as configurações
  subiam. Agora o arquivo problemático é pulado (a música fica na conta sem som
  por enquanto), o resto sobe e o app AVISA qual música falhou
  (`audioFailures`).
- **BUG ENCONTRADO (configurações não subiam):** `pushBackup` usava
  `settings = prevIndex?.settings || backup.settings` — a nuvem ANTIGA vencia
  sempre, então trocar tema/nome/bio/avatar/velocidade/equalizador nunca
  chegava à conta. Agora `mergeSettings` dá prioridade ao que este aparelho
  acabou de mexer (sem deixar vazio apagar valor existente). Letras: local
  vence (offset pode ser negativo, então não dá para usar "o maior").
- **BUG ENCONTRADO (música sem som sumia):** `tracksFromBackup` descartava
  músicas sem `audioData` → aparelho nunca chegava ao número da nuvem (27 vs
  28). Agora TODAS entram (marcadas `audioMissing`); o app mostra "sem áudio",
  pula ao tocar e tenta baixar de novo. `buildBackup` também passou a procurar
  o áudio mesmo quando a música tem capa (antes a capa fazia pular a busca e a
  música subia sem som).
- **Puxar mais resistente:** falha no download de um som não derruba mais a
  sincronização inteira (`pullBackup`).
- APK 1.9.5/31 (JDK 21) + site.

## Feito e PUBLICADO em 21/09 (1.9.4/30 na main — continuação da sincronização)
- **BUG CONFIRMADO pelo diagnóstico do usuário (21/09):** com a mesma conta
  (edilsondias0008@gmail.com), o celular mostrava "Na nuvem: 28 músicas" mas a
  biblioteca tinha 27 e o gatinho não recebia as pontuações do outro aparelho.
  Causa: o `applyCloudBackup` (src/App.jsx) tinha um filtro de assinatura
  (`cloudSigRef`) que fazia o aparelho PULAR a aplicação do recebimento quando
  achava que já tinha visto aquele conteúdo. Removido o filtro: **todo pull
  agora aplica de verdade** (biblioteca, favoritas, gatinho, ajustes).
- **Estilo Spotify:** no `useCloudSync.js`, o "Sincronizar agora" e o primeiro
  carregamento agora fazem PUSH primeiro (sobe o que o aparelho tem, a nuvem
  mescla) e PULL depois (baixa a conta completa e aplica). O aparelho vira um
  "cliente" da nuvem.
- **Aviso comparativo nas Configurações:** mostra "✅ Na nuvem agora: X músicas,
  Y favoritadas · gatinho: …" E "📱 Neste aparelho: Z músicas" — se baterem os
  números, está tudo na conta; se não, o app mostra "⚠️ ainda não batem".
- O resumo da nuvem agora vem do `index.json` FINAL após a mescla
  (`pushBackup` devolve `{updatedAt, final}` em src/cloud.js), então os dois
  aparelhos exibem os mesmos números da conta.
- APK 1.9.4/30 com tudo isso (build androi com JDK 21).

## Feito e PUBLICADO em 21/09 (1.9.3 na main — commit e5c3bcb)
- **DESEMPENHO — app/site travando (pedido do usuário):**
  - O tempo da música era atualizado ~60x por segundo (requestAnimationFrame)
    e forçava o app a redesenhar a cada tick. Agora atualiza 2x por segundo —
    o relógio mostra segundos, ninguém nota, mas o celular deixa de trabalhar
    à toa. Mesma lógica de fim de música e de retomar reprodução.
  - Partículas, anéis de luz (halo) e visualizador do equalizador: desenhavam
    em resolução máxima e continuavam trabalhando mesmo com o app em segundo
    plano. Agora a resolução é limitada (visual igual) e o desenho pausa
    quando a tela não está visível.
  - **HALO (anéis de luz da capa no "Tocando agora") REMOVIDO por completo** a
    pedido do usuário (ele suspeitava dos travamentos naquela aba). Foi tirado
    o `<AudioHalo>` do JSX, a função inteira e o CSS `.np-halo`.
  - Detector de humor do gatinho também pausa quando o app está em segundo
    plano.
  - Assinatura da sincronização (que serializa a biblioteca inteira) era
    recalculada a cada renderização; agora é memoizada (só recalcula quando
    algo muda de verdade).
- Descrição ("bio") no Perfil, ao lado da foto: caixa editável até 160
  caracteres, guardada nos ajustes e sincronizada na conta.
- Correção de sincronização: a conferência agora inclui a pontuação (`plays`)
  e, se sobrar algo não enviado, o app reenvia sozinho a cada 15s e ao voltar
  para a tela.
- **Pontuações do gatinho agora sincronizam na conta!** Antes ficavam só no
  aparelho (`nt.petstats`). Agora vão no backup (`petStats` no `index.json`) e
  mesclam sem nunca diminuir.
- **BUG CRÍTICO DE SINCRONIZAÇÃO (relatado pelo usuário em 21/09):** dois
  aparelhos com a mesma conta ficavam com dados diferentes (favoritos e
  gatinho não batiam). Causa: o envio SOBRESCREVIA a nuvem com o backup
  inteiro do aparelho, apagando o que o outro tinha salvo. Correção no
  `pushBackup` (`src/cloud.js`): agora MESCLA com o `index.json` que já está
  na nuvem — favoritos somam (OR), `plays`/`playDays`/pontuações do gatinho
  ficam com o MAIOR valor, músicas que existem só na nuvem continuam na conta,
  playlists juntam por id e os ajustes da nuvem têm prioridade. Também
  protegido no `doPull` (`src/useCloudSync.js`): não marca o estado como
  "enviado" antes de aplicar a nuvem (evita reenvio de dados velhos).

## Ação recorrente
- **Pendente agora (usuário):** se quiser recuperar as músicas da conta antiga,
  exportar o backup no site e importar no aparelho. O projeto Supabase já foi
  apagado (22/09) — nada mais de nuvem para lembrar.

## Rodada de melhorias 2 (feito)
- Fundo da tela "Tocando agora" usa as cores da capa + um brilho (aura) ao redor
  da capa.
- Visualizador de áudio no app nativo: anéis que dançam ao redor da capa enquanto
  toca (desligado quando pesquisa aberta).
- Timer de desligar: 10/20/30/60 min ou "ao final desta música" (exige internet).
  Botão no canto superior da tela "Tocando agora" e atalho na barra do player.
- Fila: dá para arrastar músicas para reordenar (segura e solta).
- Playlists: criar, renomear, excluir e adicionar músicas (inclusive "adicionar
  todas"). Guardadas no aparelho e sincronizadas na conta.
- Estatísticas de reprodução no Perfil: músicas mais ouvidas por semana/mês/ano.
- Buscas recentes: chips dos últimos termos, apagar na hora.
- Tradução automática da letra (PT) dentro do app; guarda traduções para não
  repetir pedido.
- Controles de mídia do navegador (teclas multimídia/media). Botão dormir/halos…
- Importar músicas: pasta no PC (web) e "Importar músicas do aparelho" no app
  (plugin Android `MediaImporter`, permissões `READ_MEDIA_AUDIO`/`READ_EXTERNAL_STORAGE`).
- Para o app nativo, o plugin resolve 1 arquivo por chamada (base64 é pesado para
  a ponte); o `android/local.properties` aponta para o SDK deste PC:
  `sdk.dir=C\:\\Users\\edils\\AppData\\Local\\Android\\Sdk` (não usar
  `/opt/android-sdk` — era caminho de outro computador e faz o build falhar).

## Ambiente deste PC (configurado em 21/09)
- **GitHub / push:** autenticação salva no **Cofre de Credenciais do Windows**
  (Git Credential Manager, `credential.helper manager` no global). Push funciona
  sem digitar nada — se pedir senha de novo, é só autorizar a janela que abre.
- **Java para build do APK:** JDK 21 (obrigatório — o plugin do app pede
  toolchain Java 21) em `C:\Users\edils\jdk-21\jdk-21.0.12.1+1`
  (JAVA_HOME do usuário aponta pra lá e fica salvo).
  ⚠️ JDK 17 não é suficiente (erro "Cannot find a Java installation matching
  languageVersion=21") e NÃO usar o `jbr` do Android Studio (JDK 25 — o Gradle
  8.14 não roda). Se o build falhar com "JAVA_HOME is not set", redefinir:
  `setx JAVA_HOME "C:\Users\edils\jdk-21\jdk-21.0.12.1+1"`.
- **pnpm** instalado globalmente (usado pelo `scripts/build-android.sh`).

## Pendente: repetição A-B (feature 14)
- Ainda NÃO implementada (usuário pediu para deixar para depois).
- Ideia: marcar ponto A (início) e ponto B (fim) de um trecho na tela "Tocando
  agora" (botões ao lado do timer de desligar) e repetir só esse trecho em loop.

## Pendente: loja de moedas do gatinho (feature 15)
- Anotado em 27/09 a pedido do usuário. HOJE AS MOEDAS NÃO GASTAM NADA:
  `PSTAT_DEFAULTS` em `src/settings.js` tem `coins: 0`; `bumpPet('coins', 2)` no
  toque no gatinho e `bumpPet('coins', 1)` por música iniciada
  (`src/App.jsx`) — o contador só sobe e nunca desce. A barra "🪙 Moedas" no
  habitat do gatinho é o único lugar onde aparece.
- Ideia: gastar as moedas. Uma lojinha dentro do card do gatinho com
  adesivos/stickers, cores e enfeites do habitat, capas do player e itens
  cosméticos pro Nebula (ex.: óculos de sol, chapéu, cachecol), e talvez um
  "apito" que chama atenção nas conquistas. Comprar = `coins -= preco` com
  guarda de saldo, e o item comprado fica guardado no petStats (exportar/
  importar backup já leva o `petStats` inteiro, então vem de graça no backup).
- Bônus sugerido: ganhar mais moedas — música ouvida até o fim (+1), ouvir todo
  dia (+1), completar uma conquista (+3), em vez de só tocar no gatinho.
