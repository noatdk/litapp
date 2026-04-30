#!/usr/bin/env bash
# CI: bump embedded globals version + app.json/config/package for nightly APK + raw app.json updates.
# Requires: GITHUB_REPOSITORY (owner/repo), GITHUB_RUN_NUMBER
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

: "${GITHUB_REPOSITORY:?}"
: "${GITHUB_RUN_NUMBER:?}"

globals="src/providers/globals.ts"
cur="$(sed -n 's/.*private version = \([0-9][0-9]*\);.*/\1/p' "$globals" | head -1)"
new=$((cur + 1))
sed -i.bak "s/private version = ${cur};/private version = ${new};/" "$globals"
rm -f "${globals}.bak"

apk_url="https://github.com/${GITHUB_REPOSITORY}/releases/download/nightly/litapp-nightly.apk"
vername="1.25.${GITHUB_RUN_NUMBER}"

jq --argjson v "$new" --arg vn "$vername" --arg url "$apk_url" \
  '.version = $v | .versionName = $vn | .updatelink = $url' app.json > app.json.tmp && mv app.json.tmp app.json

sed -i.bak "/^<widget id=\"com.illuminatus.litapp\"/s/version=\"[^\"]*\"/version=\"${vername}\"/" config.xml
rm -f config.xml.bak

jq --arg v "$vername" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json

npm install --package-lock-only --ignore-scripts
