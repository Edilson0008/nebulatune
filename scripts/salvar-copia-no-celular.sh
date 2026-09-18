#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="/storage/emulated/0/Download/NebulaTune-projeto"
mkdir -p "$DEST"

echo "==> Gerando ZIP atualizado do projeto..."
zip_file="/tmp/nebulatune-projeto-$(date +%Y%m%d-%H%M).zip"
zip -r -q "$zip_file" . \
  -x "node_modules/*" "dist/*" \
  "android/.gradle/*" "android/app/build/*" "android/build/*" ".gradle/*" \
  "*.log" "android/local.properties"

cp -f "$zip_file" "$DEST/nebulatune-projeto.zip"
rm -f "$zip_file"

ls -la "$DEST/nebulatune-projeto.zip"
echo "OK: copia atualizada em Download/NebulaTune-projeto/nebulatune-projeto.zip"