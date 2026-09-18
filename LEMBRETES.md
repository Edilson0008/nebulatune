# Lembretes

## Site publicado (feito)
- Site oficial no ar: https://edilson0008.github.io/nebulatune/
- `SITE_URL` em `src/app-config.js` já aponta para esse endereço.
- Repositório: https://github.com/Edilson0008/nebulatune
- Publicação: o site vai para o branch `gh-pages` (a cada atualização, gerar o
  build web com `WEB_BASE=/nebulatune/` e enviar para `gh-pages`).
- O workflow automático está guardado em `scripts/github-pages-workflow.yml`
  (para ativar, o token do GitHub precisa do escopo `workflow`; aí mover para
  `.github/workflows/deploy.yml`).

## Login futuro (pendente, importante)
O usuário quer opções de login para que quem usa a web possa instalar o APK e
entrar para ver tudo que fez na web (biblioteca, favoritos, configurações), sem
começar do zero.

**Para funcionar precisa:**
- Um servidor com banco de dados (o GitHub Pages é só site estático e não guarda
  contas). Ex.: Supabase/Firebase (grátis).
- Aí implementar contas/login e sincronização.
- O formato do backup (`type: "backup-completo"`) já foi feito para servir de base.

## Versões
- Manter `version.json`, `APP_VERSION` e o `versionName` do Android em sincronia
  a cada nova versão.
- O botão "Baixar nova versão" / verificação de atualização já usa o site real
  (o APK atual foi gerado com `SITE_URL` preenchido).

## Ação recorrente
- De tempos em tempos, lembrar o usuário dos itens pendentes (agora: login/sync).
