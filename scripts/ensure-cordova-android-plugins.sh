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
for m in re.finditer(r'<plugin\s+name="([^"]+)"\s*(?:spec="([^"]*)")?', src):
    name, spec = m.group(1), m.group(2) or ""
    print(f"{name}\t{spec}")
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

missing_names=()
missing_specs=()
while IFS=$'\t' read -r name spec; do
  [[ -z "$name" ]] && continue
  if ! grep -qx "$name" <<<"$installed"; then
    missing_names+=("$name")
    missing_specs+=("$spec")
  fi
done <<<"$declared"

if [[ ${#missing_names[@]} -eq 0 ]]; then
  echo "All cordova plugins installed for android."
  exit 0
fi

echo "Re-installing missing plugins: ${missing_names[*]}"
for i in "${!missing_names[@]}"; do
  name="${missing_names[$i]}"
  spec="${missing_specs[$i]}"
  rm -rf "plugins/$name" "node_modules/$name"
  if [[ -n "$spec" && "$spec" != *://* ]]; then
    target="$name@$spec"
  elif [[ -n "$spec" ]]; then
    target="$spec"
  else
    target="$name"
  fi
  "$CORDOVA_BIN" plugin add "$target" --no-save --force --no-interactive || true
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
for p in "${missing_names[@]}"; do
  grep -qx "$p" <<<"$installed" || still_missing+=("$p")
done

if [[ ${#still_missing[@]} -gt 0 ]]; then
  echo "::error::Plugins still missing after re-install: ${still_missing[*]}"
  exit 1
fi

echo "All cordova plugins now installed."
