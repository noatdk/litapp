#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CORDOVA_BIN="${CORDOVA_BIN:-./node_modules/.bin/cordova}"
META_JS="platforms/android/platform_www/cordova_plugins.js"
[[ -f "$META_JS" ]] || META_JS="platforms/android/app/src/main/assets/www/cordova_plugins.js"

declared=$(python3 - <<'PY'
import json, re
names = set()
try:
    with open('config.xml') as f:
        for m in re.finditer(r'<plugin\s+name="([^"]+)"', f.read()):
            names.add(m.group(1))
except FileNotFoundError:
    pass
try:
    with open('package.json') as f:
        pkg = json.load(f)
    for n in (pkg.get('cordova', {}).get('plugins') or {}).keys():
        names.add(n)
except FileNotFoundError:
    pass
for n in sorted(names):
    print(n)
PY
)

read_installed() {
  if [[ -f "$META_JS" ]]; then
    python3 - "$META_JS" <<'PY'
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
  fi
}

installed=$(read_installed)

missing=()
for p in $declared; do
  grep -qx "$p" <<<"$installed" || missing+=("$p")
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
installed=$(read_installed)
for p in "${missing[@]}"; do
  grep -qx "$p" <<<"$installed" || still_missing+=("$p")
done

if [[ ${#still_missing[@]} -gt 0 ]]; then
  echo "::error::Plugins still missing after re-install: ${still_missing[*]}"
  exit 1
fi

echo "All cordova plugins now installed."
