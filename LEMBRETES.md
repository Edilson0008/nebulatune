# Lembretes

## Login futuro (pendente, importante)
O usuário quer opções de login para que quem usa a web possa instalar o APK e
entrar para ver tudo que fez na web (biblioteca, favoritos, configurações), sem
começar do zero.

**Para funcionar precisa:**
- Site publicado em um domínio real (ex.: nebulatune.com.br) com servidor/banco.
- Preencher `SITE_URL` em `src/app-config.js` com o endereço real.
- Aí implementar contas/login e sincronização.
- O formato do backup (`type: "backup-completo"`) já foi feito para servir de base.

## Após o site publicar
- Ativar o botão "Baixar nova versão" / verificação de atualização no app
  (hoje fica oculto enquanto `SITE_URL` for localhost).
- Manter `version.json`, `APP_VERSION` e o `versionName` do Android em sincronia.

## Ação recorrente
- De tempos em tempos, lembrar o usuário destes itens pendentes até que ele
  publique o site ou mude de ideia.