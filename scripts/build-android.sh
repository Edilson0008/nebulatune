#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_BIN="${NODE_BIN:-node22}"
GRADLE_FLAGS="--no-daemon"

echo "==> 1/6 Build web"
APP_VERSION=$("$NODE_BIN" --input-type=module -e "import {APP_VERSION} from './src/app-config.js'; process.stdout.write(String(APP_VERSION || '1.0.0'))" 2>/dev/null || echo 1.0.0)
VC=$("$NODE_BIN" --input-type=module -e "import {VERSION_CODE} from './src/app-config.js'; process.stdout.write(String(VERSION_CODE || 1))" 2>/dev/null || echo 1)
printf '{"version":"%s"}\n' "$APP_VERSION" > public/version.json

# versionName/versionCode DINAMICOS: a tela "Informacoes do app" le isso (antes era fixo 1.4.0 -> ninguem via update)
grep -qE 'applicationId "br.com.nebulatune.app"' android/app/build.gradle && \
sed -i -E "s/versionName [\"'][^\"']*[\"']/versionName \"$APP_VERSION\"/; s/versionCode [0-9]+/versionCode $VC/" android/app/build.gradle
pnpm build

echo "==> 2/6 Sync com Capacitor"
"$NODE_BIN" node_modules/@capacitor/cli/bin/capacitor sync android

echo "==> 3/6 Remove arquivos que nao devem entrar no APK"
rm -rf android/app/src/main/assets/public/apk
rm -rf android/app/src/main/assets/public/backup

echo "==> 4/6 Compila APK (release assinado)"
(cd android && ./gradlew assembleRelease $GRADLE_FLAGS)

echo "==> 5/6 Copia APK para o site (public/apk)"
mkdir -p public/apk
cp -f android/app/build/outputs/apk/release/app-release.apk public/apk/nebulatune.apk
pnpm build

ls -la public/apk/nebulatune.apk
echo "OK: public/apk/nebulatune.apk atualizado"