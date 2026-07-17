#!/usr/bin/env bash
# scripts/ensure-branding.sh
# Pre-build safety check — fails the build if branding assets are missing
# or are still the generic AnanseLabs placeholder.
#
# Usage: Call this before `docker compose build` in your deploy script.
#   ./scripts/ensure-branding.sh || exit 1

set -euo pipefail

BRANDING_DIR="$(cd "$(dirname "$0")/.." && pwd)/branding"
LOGO="$BRANDING_DIR/logo.svg"
FAVICON="$BRANDING_DIR/favicon.ico"
BRANDING_JSON="$BRANDING_DIR/branding.json"

PLACEHOLDER_TITLE="LibreChat Custom"

echo "[ensure-branding] Checking branding assets..."

# 1. Directory must exist
if [ ! -d "$BRANDING_DIR" ]; then
  echo "[ensure-branding] ❌ ERROR: branding/ directory not found at $BRANDING_DIR"
  echo "[ensure-branding]    Copy your Horlap assets here before building:"
  echo "[ensure-branding]    scp -r /path/to/horlap-branding/ ananse.tools:/root/ananselabs/chat/branding/"
  exit 1
fi

# 2. Key files must exist
for f in "$LOGO" "$FAVICON" "$BRANDING_JSON"; do
  if [ ! -f "$f" ]; then
    echo "[ensure-branding] ❌ ERROR: Missing branding file: $f"
    exit 1
  fi
done

# 3. branding.json must not have placeholder APP_TITLE
if grep -q "$PLACEHOLDER_TITLE" "$BRANDING_JSON"; then
  echo "[ensure-branding] ❌ ERROR: branding.json still contains placeholder APP_TITLE ('$PLACEHOLDER_TITLE')."
  echo "[ensure-branding]    Update $BRANDING_JSON with the real Horlap configuration."
  exit 1
fi

# 4. logo.svg must not be zero-length
if [ ! -s "$LOGO" ]; then
  echo "[ensure-branding] ❌ ERROR: logo.svg is empty."
  exit 1
fi

APP_TITLE=$(grep -o '"APP_TITLE"[[:space:]]*:[[:space:]]*"[^"]*"' "$BRANDING_JSON" | grep -o '"[^"]*"$' | tr -d '"')
echo "[ensure-branding] ✅ Branding OK — APP_TITLE: '$APP_TITLE'"
