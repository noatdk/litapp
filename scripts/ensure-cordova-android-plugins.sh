#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CORDOVA_BIN="${CORDOVA_BIN:-./node_modules/.bin/cordova}"
META_JS="platforms/android/platform_www/cordova_plugins.js"
[[ -f "$META_JS" ]] || META_JS="platforms/android/app/src/main/assets/www/cordova_plugins.js"

declared=$(python3 - <<'PY'
import re, sys
with open('config.xml') as f:
    src = f.read()
for m in re.finditer(r'<plugin\s+name="([^"]+)"', src):
    print(m.group(1))
PY
)

installed=""
if [[ -f "$META_JS" ]]; then
  installed=$(python3 - "$META_JS" <<'PY'
import json, re, sys
src = open(sys.argv[1]).read()
m = re.search(r'metadata\s*=\s*//[^\n]*\n(\{[^}]*\})', src, re.S)
if not m:
    sys.exit(0)
for line in m.group(1).splitlines():
    n = re.match(r'\s*"([^"]+)"\s*:', line)
    if n:
        print(n.group(1))
PY
  )
fi

missing=()
for p in $declared; do
  if ! grep -qx "$p" <<<"$installed"; then
    missing+=("$p")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  echo "All cordova plugins installed for android."
  exit 0
fi

echo "Re-installing missing plugins: ${missing[*]}"
for p in "${missing[@]}"; do
  rm -rf "plugins/$p" "node_modules/$p"
  "$CORDOVA_BIN" plugin add "$p" --no-save --force --no-interactive || true
done

still_missing=()
installed=$(python3 - "$META_JS" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'metadata\s*=\s*//[^\n]*\n(\{[^}]*\})', src, re.S)
if not m:
    sys.exit(0)
for line in m.group(1).splitlines():
    n = re.match(r'\s*"([^"]+)"\s*:', line)
    if n:
        print(n.group(1))
PY
)
for p in "${missing[@]}"; do
  grep -qx "$p" <<<"$installed" || still_missing+=("$p")
done

if [[ ${#still_missing[@]} -gt 0 ]]; then
  echo "::error::Plugins still missing after re-install: ${still_missing[*]}"
  exit 1
fi

echo "All cordova plugins now installed."
