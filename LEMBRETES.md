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
- Versão atual publicada: **1.3.0** (login com Google dentro do app).
- Ao lançar versão nova, manter em sincronia:
  `APP_VERSION` (`src/app-config.js`), `versionName`/`versionCode`
  (`android/app/build.gradle`). O `version.json` do site é gerado sozinho a
  partir do `APP_VERSION` no deploy.
- `versionName`/`versionCode` ainda são atualizados à mão no `build.gradle`.

## Ação recorrente
- De tempos em tempos, lembrar o usuário dos itens pendentes (agora: login com
  Google e, se quiser, religar a confirmação de e-mail).
