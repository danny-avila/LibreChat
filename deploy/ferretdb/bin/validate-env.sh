#!/usr/bin/env bash

# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

REQUIRE_IMAGE_DIGESTS="${REQUIRE_IMAGE_DIGESTS:-true}"
REQUIRE_LICENSE_REVIEW="${REQUIRE_LICENSE_REVIEW:-true}"
ALLOW_PUBLIC_BIND="${ALLOW_PUBLIC_BIND:-false}"

failures=0
warnings=0

fail() {
  failures=$((failures + 1))
  printf 'fail: %s\n' "$*" >&2
}

warn() {
  warnings=$((warnings + 1))
  printf 'warn: %s\n' "$*" >&2
}

ok() {
  printf 'ok: %s\n' "$*"
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == *change-me* || "$value" == *replace-with* || "$value" == *example.com* || "$value" == *s3.internal.example* || "$value" == *"<"* ]]
}

require_var_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "required variable is missing: $name"
  elif is_placeholder "${!name}"; then
    fail "required variable still has a placeholder value: $name"
  else
    ok "$name is set"
  fi
}

require_hex_length() {
  local name="$1"
  local expected="$2"
  local value="${!name:-}"

  if [[ ! "$value" =~ ^[0-9a-fA-F]{$expected}$ ]]; then
    fail "$name must be $expected hex characters"
  else
    ok "$name has expected hex length"
  fi
}

require_digest_image() {
  local name="$1"
  local value="${!name:-}"

  if [[ "$REQUIRE_IMAGE_DIGESTS" != "true" ]]; then
    return
  fi

  if [[ -z "$value" ]]; then
    fail "image variable is missing: $name"
  elif [[ "$value" != *@sha256:* ]]; then
    fail "$name must be pinned by digest for production: $value"
  else
    ok "$name is digest pinned"
  fi
}

require_url() {
  local name="$1"
  local value="${!name:-}"

  if is_placeholder "$value"; then
    fail "$name must be set to the real production URL"
  elif [[ ! "$value" =~ ^https?:// ]]; then
    fail "$name must start with http:// or https://"
  else
    ok "$name is a URL"
  fi
}

require_file() {
  local name="$1"
  local value="${!name:-}"
  local path

  if [[ -z "$value" ]]; then
    fail "$name is missing"
    return
  fi

  path="$(absolute_path "$value")"
  if [[ ! -f "$path" ]]; then
    fail "$name points to a missing file: $path"
  else
    ok "$name exists"
  fi
}

case "${OBJECT_STORE_MODE:-}" in
  seaweedfs | external-s3 | minio) ok "OBJECT_STORE_MODE=$OBJECT_STORE_MODE" ;;
  *) fail "OBJECT_STORE_MODE must be seaweedfs, external-s3, or minio" ;;
esac

require_url DOMAIN_CLIENT
require_url DOMAIN_SERVER

if [[ "${LIBRECHAT_BIND_ADDRESS:-}" != "127.0.0.1" && "${LIBRECHAT_BIND_ADDRESS:-}" != "::1" && "$ALLOW_PUBLIC_BIND" != "true" ]]; then
  fail "LIBRECHAT_BIND_ADDRESS must stay loopback unless ALLOW_PUBLIC_BIND=true"
else
  ok "LIBRECHAT_BIND_ADDRESS is constrained or explicitly allowed"
fi

require_file LIBRECHAT_YAML_PATH

case "${RAG_ENABLED:-false}" in
  true | false) ok "RAG_ENABLED=${RAG_ENABLED:-false}" ;;
  *) fail "RAG_ENABLED must be true or false" ;;
esac

for name in DOCUMENTDB_USER DOCUMENTDB_PASSWORD REDIS_PASSWORD MEILI_MASTER_KEY JWT_SECRET JWT_REFRESH_SECRET CREDS_KEY CREDS_IV; do
  require_var_value "$name"
done

require_hex_length JWT_SECRET 64
require_hex_length JWT_REFRESH_SECRET 64
require_hex_length CREDS_KEY 64
require_hex_length CREDS_IV 32

for name in GATEWAY_IMAGE DOCUMENTDB_IMAGE FERRETDB_IMAGE VALKEY_IMAGE MEILI_IMAGE; do
  require_digest_image "$name"
done

if rag_enabled; then
  for name in RAG_PORT RAG_POSTGRES_DB RAG_POSTGRES_USER RAG_POSTGRES_PASSWORD RAG_API_SOURCE_URL RAG_API_SOURCE_REF RAG_API_SOURCE_LICENSE; do
    require_var_value "$name"
  done
  require_digest_image PGVECTOR_IMAGE
  require_digest_image RAG_API_IMAGE
  if [[ "${COMPOSE_FILES:-}" != *deploy-compose.ferretdb.rag.yml* ]]; then
    fail "COMPOSE_FILES must include deploy-compose.ferretdb.rag.yml when RAG_ENABLED=true"
  else
    ok "COMPOSE_FILES includes RAG override"
  fi
else
  if [[ "${COMPOSE_FILES:-}" == *deploy-compose.ferretdb.rag.yml* ]]; then
    fail "COMPOSE_FILES includes deploy-compose.ferretdb.rag.yml but RAG_ENABLED is not true"
  else
    ok "RAG override is not enabled"
  fi
fi

if [[ "${OBJECT_STORE_MODE:-}" == "seaweedfs" ]]; then
  require_digest_image SEAWEEDFS_IMAGE
  for name in SEAWEEDFS_ACCESS_KEY SEAWEEDFS_SECRET_KEY SEAWEEDFS_BUCKET; do
    require_var_value "$name"
  done
  if [[ "${COMPOSE_FILES:-}" != *deploy-compose.ferretdb.seaweedfs.yml* ]]; then
    fail "COMPOSE_FILES must include deploy-compose.ferretdb.seaweedfs.yml when OBJECT_STORE_MODE=seaweedfs"
  else
    ok "COMPOSE_FILES includes SeaweedFS override"
  fi
elif [[ "${OBJECT_STORE_MODE:-}" == "external-s3" ]]; then
  for name in AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_BUCKET_NAME AWS_REGION; do
    require_var_value "$name"
  done
  if [[ "${COMPOSE_FILES:-}" != *deploy-compose.ferretdb.external-s3.yml* ]]; then
    fail "COMPOSE_FILES must include deploy-compose.ferretdb.external-s3.yml when OBJECT_STORE_MODE=external-s3"
  else
    ok "COMPOSE_FILES includes external S3 override"
  fi
elif [[ "${OBJECT_STORE_MODE:-}" == "minio" ]]; then
  require_digest_image MINIO_IMAGE
  require_digest_image MINIO_MC_IMAGE
  for name in MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET; do
    require_var_value "$name"
  done
  if [[ "${MINIO_COMMERCIAL_LICENSE_CONFIRMED:-false}" != "true" ]]; then
    fail "MinIO requires MINIO_COMMERCIAL_LICENSE_CONFIRMED=true for this production policy"
  else
    ok "MinIO commercial license confirmation is set"
  fi
fi

if [[ -n "${REDIS_IMAGE:-}" ]]; then
  fail "REDIS_IMAGE is set; use VALKEY_IMAGE instead to avoid Redis 7.4+ RSALv2/SSPLv1"
fi

if [[ "${VALKEY_IMAGE:-}" != *valkey* ]]; then
  fail "VALKEY_IMAGE must point to Valkey, not Redis"
fi

if [[ "${ALLOW_REGISTRATION:-}" != "false" ]]; then
  fail "ALLOW_REGISTRATION must be false for this auth-gateway deployment"
else
  ok "ALLOW_REGISTRATION=false"
fi

if rag_enabled; then
  if [[ "$REQUIRE_LICENSE_REVIEW" == "true" && "${RAG_API_LICENSE_REVIEWED:-false}" != "true" ]]; then
    fail "RAG_API_LICENSE_REVIEWED must be true after legal/source review of RAG_API_IMAGE"
  elif [[ "$REQUIRE_LICENSE_REVIEW" != "true" ]]; then
    warn "RAG API license review requirement disabled"
  else
    ok "RAG API license review is confirmed"
  fi
else
  ok "RAG API license review is not required because RAG_ENABLED=false"
fi

if ((failures > 0)); then
  printf 'env validation failed with %s error(s), %s warning(s)\n' "$failures" "$warnings" >&2
  exit 1
fi

printf 'env validation passed with %s warning(s)\n' "$warnings"
