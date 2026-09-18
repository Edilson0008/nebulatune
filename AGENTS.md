# Instruções para o assistente

- Responder sempre em português (o usuário é leigo em tecnologia).
- Ao trabalhar neste projeto, consulte `LEMBRETES.md` e, de tempos em tempos,
  lembre o usuário dos itens pendentes listados lá (login futuro / publicação
  do site com `SITE_URL` real).
- Web = visual atual preservado. App nativo (APK/Capacitor) tem layout próprio
  (topbar com nome + avatar, barra de navegação inferior, orientação travada em
  retrato).
- Build do APK: `./scripts/build-android.sh` (usa `NODE_BIN=node22`), depois
  copiar o APK para `/storage/emulated/0/Download/NebulaTune-apk/nebulatune.apk`.