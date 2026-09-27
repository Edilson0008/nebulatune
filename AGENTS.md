# Instruções para o assistente

- Responder sempre em português (o usuário é leigo em tecnologia).
- Ao trabalhar neste projeto, consulte `LEMBRETES.md` e, de tempos em tempos,
  lembre o usuário dos itens pendentes listados lá.
- **Sem nuvem, sem login, sem conta — para sempre.** O app é 100% local
  (biblioteca em `localStorage` + IndexedDB, ajustes/gatinho/playlists no
  aparelho). NÃO propor login, sincronização, Supabase ou servidor: em 22/09
  (1.9.17) isso foi removido a pedido do usuário e o projeto do Supabase foi
  apagado. A proteção dos dados é o backup manual (`Exportar`), ver pendente
  "backup automático".
- `SITE_URL` em `src/app-config.js` já é real (site no GitHub Pages); ao
  subir `APP_VERSION`/`VERSION_CODE`, o `version.json` do site é gerado no
  deploy.
- Web = visual atual preservado. App nativo (APK/Capacitor) tem layout próprio
  (topbar com nome + avatar, barra de navegação inferior, orientação travada em
  retrato).
- Build do APK: `./scripts/build-android.sh` (usa `NODE_BIN=node22`, JDK 21),
  depois copiar o APK para `/storage/emulated/0/Download/NebulaTune-apk/nebulatune.apk`.
  O Gradle/aapt2 não roda no Android: build de APK é no PC (ou CI).

## Estrutura do código (desde 27/09)

- `src/App.jsx` = só o componente `App` (estado global/orquestração) e a tela
  inicial. **Não crescer mais esse arquivo**: o que for novo vai para
  `src/components/`, `src/hooks/` ou `src/lib/`.
- `src/components/` = uma tela/bloco por arquivo, recebe tudo por props.
- `src/hooks/` = `use*` (player, mood, letra, media session).
- `src/lib/` = função pura, sem React (formatação, capa, letra, arquivo, stats).
- `src/audio/` = motor de áudio (Web Audio: `engine`, `graph`, `equalizer`).
- Antes de dar commit: `pnpm lint` (0 erros) e `pnpm test`.
