#!/usr/bin/env bash
# Run locally only. Prints values to paste into GitHub: Settings → Secrets → Actions.
# Never commit script output or your .jks file.
#
# Usage:
#   ./scripts/gh-android-signing-secrets.sh encode /absolute/path/to/litapp-key.jks
#   ./scripts/gh-android-signing-secrets.sh new-keystore /absolute/path/out.jks [alias]
#
# GitHub secret names (repository):
#   ANDROID_KEYSTORE_BASE64   (single-line base64 of the .jks file)
#   ANDROID_KEYSTORE_PASSWORD (keystore password = key password in simple setups)
#   ANDROID_KEY_ALIAS         (optional if alias is "litapp")

set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

cmd="${1:-}"
case "$cmd" in
encode)
  [[ -n "${2:-}" ]] || die "usage: $0 encode /path/to/key.jks"
  ksf="$2"
  [[ -f "$ksf" ]] || die "not a file: $ksf"
  echo ""
  echo "=== ANDROID_KEYSTORE_BASE64 (paste as repository secret; value is one line) ==="
  base64 <"$ksf" | tr -d '\n'
  echo ""
  echo ""
  echo "=== Next ==="
  echo "Add ANDROID_KEYSTORE_PASSWORD using the same password you use for this keystore."
  echo "If your key alias is not litapp, add ANDROID_KEY_ALIAS."
  ;;
new-keystore)
  [[ -n "${2:-}" ]] || die "usage: $0 new-keystore /path/out.jks [alias]"
  out="$2"
  alias="${3:-litapp}"
  command -v keytool >/dev/null || die "keytool not found (install a JDK)"
  parent="$(dirname "$out")"
  mkdir -p "$parent"
  [[ ! -e "$out" ]] || die "refusing to overwrite: $out"
  pw="$(openssl rand -base64 24)"
  echo "Generated keystore password (save before continuing):"
  echo "$pw"
  echo ""
  keytool -genkeypair -v \
    -keystore "$out" \
    -alias "$alias" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$pw" -keypass "$pw" \
    -dname "CN=Litapp CI,O=Local,L=Local,S=Local,C=XX"
  echo ""
  echo "=== GitHub secrets ==="
  echo "ANDROID_KEYSTORE_PASSWORD"
  echo "$pw"
  echo ""
  echo "ANDROID_KEYSTORE_BASE64"
  base64 <"$out" | tr -d '\n'
  echo ""
  echo ""
  if [[ "$alias" != litapp ]]; then
    echo "ANDROID_KEY_ALIAS"
    echo "$alias"
    echo ""
  fi
  echo "Install builds signed with this key cannot upgrade installs signed with another key."
  ;;
*)
  die "usage: $0 encode /path/to/key.jks | $0 new-keystore /path/out.jks [alias]"
  ;;
esac
