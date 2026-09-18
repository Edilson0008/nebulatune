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
- Versão atual publicada: **1.4.0** (rodada de melhorias 2: playlists, stats,
  tradução de letras, timer de desligar, halo, importar músicas, recentes, fila).
- Ao lançar versão nova, manter em sincronia:
  `APP_VERSION` (`src/app-config.js`), `versionName`/`versionCode`
  (`android/app/build.gradle`). O `version.json` do site é gerado sozinho a
  partir do `APP_VERSION` no deploy.
- `versionName`/`versionCode` ainda são atualizados à mão no `build.gradle`.

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
