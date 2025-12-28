#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

TARGET_UID="${UID:-$(id -u)}"
TARGET_GID="${GID:-$(id -g)}"
CURRENT_UID="$(id -u)"
CURRENT_GID="$(id -g)"

VOLUME_PATHS=(
  images
  uploads
  logs
  data-node
  meili_data_v1.12
  data/ldap-no-tls
  data/ldap_config-no-tls
  keycloak/data
  keycloak/realm
  data/keycloak-db
  data/ollama
)

for rel_path in "${VOLUME_PATHS[@]}"; do
  full_path="$ROOT_DIR/$rel_path"
  mkdir -p "$full_path"
  if ! chown -R "${TARGET_UID}:${TARGET_GID}" "$full_path"; then
    if [[ "$TARGET_UID" -eq "$CURRENT_UID" && "$TARGET_GID" -eq "$CURRENT_GID" ]]; then
      continue
    fi
    echo "⚠️  Cannot update ownership of $full_path without elevated permissions"
  fi
done
