#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENV_FILE="$ROOT_DIR/.env"

ENV_UID=""
ENV_GID=""
ENV_HOST_UID=""
ENV_HOST_GID=""

parse_env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return
  fi
  local raw
  raw=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)
  echo "${raw#${key}=}"
}

if [[ -f "$ENV_FILE" ]]; then
  ENV_UID=$(parse_env_value 'UID')
  ENV_GID=$(parse_env_value 'GID')
  ENV_HOST_UID=$(parse_env_value 'HOST_UID')
  ENV_HOST_GID=$(parse_env_value 'HOST_GID')
fi

TARGET_UID="${ENV_HOST_UID:-${ENV_UID:-${UID:-$(id -u)}}}"
TARGET_GID="${ENV_HOST_GID:-${ENV_GID:-${GID:-$(id -g)}}}"
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
