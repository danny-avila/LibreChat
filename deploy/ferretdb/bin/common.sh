#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/../.." && pwd)"

ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/deploy-compose.ferretdb.yml}"
COMPOSE_FILES="${COMPOSE_FILES:-$COMPOSE_FILE}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-librechat-ferretdb}"

timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}

absolute_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$REPO_ROOT" "$1" ;;
  esac
}

load_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing ENV_FILE: $ENV_FILE" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

compose() {
  local file
  local args=()

  IFS=',' read -r -a files <<<"$COMPOSE_FILES"
  for file in "${files[@]}"; do
    if [[ -n "$file" ]]; then
      args+=(-f "$file")
    fi
  done

  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" "${args[@]}" "$@"
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is not set: $name" >&2
    exit 1
  fi
}

rag_enabled() {
  [[ "${RAG_ENABLED:-false}" == "true" ]]
}

service_container_id() {
  local service="$1"
  local id
  id="$(compose ps -aq "$service" | head -n 1)"
  if [[ -z "$id" ]]; then
    echo "No container found for service: $service" >&2
    exit 1
  fi
  printf '%s\n' "$id"
}

wait_service_healthy() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local id
  local status
  local deadline

  id="$(service_container_id "$service")"
  deadline=$((SECONDS + timeout_seconds))

  while ((SECONDS < deadline)); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for service to become healthy: $service" >&2
  compose ps "$service" >&2 || true
  return 1
}

compose_network() {
  local network="${COMPOSE_PROJECT_NAME}_default"
  docker network inspect "$network" >/dev/null
  printf '%s\n' "$network"
}

checksum_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path"
  else
    shasum -a 256 "$path"
  fi
}

docker_run_on_compose_network() {
  local image="$1"
  shift
  local docker_args=()

  while [[ $# -gt 0 && "$1" != "--" ]]; do
    docker_args+=("$1")
    shift
  done

  if [[ $# -gt 0 && "$1" == "--" ]]; then
    shift
  fi

  docker run --rm -i --network "$(compose_network)" "${docker_args[@]}" "$image" "$@"
}
