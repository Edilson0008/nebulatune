# Lembretes

## Site publicado (feito)
- Site oficial no ar: https://edilson0008.github.io/nebulatune/
- `SITE_URL` em `src/app-config.js` já aponta para esse endereço.
- Repositório: https://github.com/Edilson0008/nebulatune
- Publicação automática ATIVA: `.github/workflows/deploy.yml` reconstrói e
  publica o site sozinho a cada envio para o branch `main`.
- Para atualizar o site, basta enviar as mudanças para o `main`. (O token do
  GitHub precisa do escopo `workflow`.)

## Login e sincronização (feito)
- Servidor: Supabase (projeto `omusoirnpyduuyeirreo`). Chaves em `src/app-config.js`
  (`SUPABASE_URL` + `SUPABASE_ANON_KEY`, anon pública).
- Ativo: login por e-mail/senha e sincronização automática nos dois sentidos.
  Ao entrar, o app baixa tudo sozinho (biblioteca com áudio, favoritos, ajustes,
  equalizador, sincronia de letras); qualquer mudança feita no aparelho sobe
  sozinha em ~5s. O app também confere novidades a cada 15s e ao voltar para a
  tela. Nada de botão manual no dia a dia (existe "Sincronizar agora" só por
  garantia).
- Conta de teste usada nas verificações: `bot-teste-nebulatune@example.com`
  (senha `teste123456`). Pode apagar quando quiser; não afeta a conta do usuário.
- VALIDAÇÃO MANUAL FEITA POR MIM (18/09): login na nuvem de produção com a
  conta-teste → **HTTP 200 / acesso: sim** (endpoint Supabase real do app).
  Conclusão: autenticação+chave+endereço funcionam; o "Failed to fetch" que o
  usuário viu era a mensagem crua de rede — já traduzida para texto amigável
  no 1.4.0 (publicado no site + GitHub).
- Backups: bucket privado `backups`, por usuário. Cada música é enviada como
  arquivo separado (`tracks/`, `covers/`) e só o que mudou é reenviado; o
  `index.json` guarda os metadados. Isso evita o limite de arquivo de 50MB do
  plano grátis. SQL em `supabase/setup.sql`.
- Google OAuth configurado e funcionando (web + app). No app, o login usa o
  endereço `br.com.nebulatune://callback` (Deep Link declarado no manifesto).
- PENDENTE: ligar de volta a confirmação de e-mail no Supabase quando quiser
  mais segurança (hoje está desligada para facilitar os testes).

## Atualização do app (feito)
- Botão "Atualizar" em Configurações → Aplicativo: verifica a versão no site
  (`version.json`) e, se houver nova, baixa e abre o instalador (plugin Android
  `AppUpdater`, com permissão `REQUEST_INSTALL_PACKAGES`).
- Ao abrir o app, se estiver numa versão antiga, aparece uma janela avisando,
  com "Atualizar agora" ou "Deixar pra depois" (uma vez por sessão).
- PRIMEIRA atualização é manual: instalar uma vez o APK novo. Depois disso o
  próprio app atualiza.

## Versões (importante)
- Versão atual publicada/remota: **1.9.2** (APK real na main + zip do código em
  `public/projeto/nebulatune-src.zip`). Fonte da verdade = GitHub.
- **ATENÇÃO (21/09):** pasta sincronizada com o GitHub via `git reset --hard
  origin/main` (backups: `%TEMP%\opencode\nebulatune-*.patch`). NÃO trabalhar
  sobre versão antiga.
- **PENDENTE CRÍTICO (21/09):** usuário relatou que o app/site (1.9.x) está
  TRAVANDO/CONGELANDO após as otimizações feitas "pelo celular". Investigar
  performance (lista memoizada, throttle de elapsed, content-visibility,
  animações do gatinho/partículas/planetas) e corrigir.
  → **FEITO (21/09, ainda NÃO publicado):** os pontos pesados foram corrigidos
  (ver "Feito em 21/09" abaixo). Falta o usuário testar e publicar.
- Ao lançar versão nova, manter em sincronia:
  `APP_VERSION` (`src/app-config.js`), `versionName`/`versionCode`
  (`android/app/build.gradle`). O `version.json` do site é gerado sozinho a
  partir do `APP_VERSION` no deploy.
- `versionName`/`versionCode` ainda são atualizados à mão no `build.gradle`.

## Feito em 21/09 (em cima da 1.9.2, ainda NÃO publicado)
- **DESEMPENHO — app/site travando (pedido do usuário):**
  - O tempo da música era atualizado ~60x por segundo (requestAnimationFrame)
    e forçava o app a redesenhar a cada tick. Agora atualiza 2x por segundo —
    o relógio mostra segundos, ninguém nota, mas o celular deixa de trabalhar
    à toa. Mesma lógica de fim de música e de retomar reprodução.
  - Partículas, anéis de luz (halo) e visualizador do equalizador: desenhavam
    em resolução máxima e continuavam trabalhando mesmo com o app em segundo
    plano. Agora a resolução é limitada (visual igual) e o desenho pausa
    quando a tela não está visível.
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

## Ação recorrente
- De tempos em tempos, lembrar o usuário dos itens pendentes (agora: login com
  Google e, se quiser, religar a confirmação de e-mail).

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
  a ponte); o `local.properties` precisa de `sdk.dir=/opt/android-sdk` (lote local).

## Pendente: repetição A-B (feature 14)
- Ainda nÃO implementada (usuário pediu para deixar para depois).
- Ideia: marcar ponto A (início) e ponto B (fim) de um trecho na tela "Tocando
  agora" (botões ao lado do timer de desligar) e repetir só esse trecho em loop.
