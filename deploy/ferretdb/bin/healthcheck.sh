#!/usr/bin/env bash

# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

OBJECT_STORE_MODE="${OBJECT_STORE_MODE:-minio}"
TENANT_GATEWAY_URL="${TENANT_GATEWAY_URL:-http://127.0.0.1:${LIBRECHAT_HTTP_PORT:-3080}}"
HEALTH_TENANT_ID="${HEALTH_TENANT_ID:-healthcheck}"
BACKUP_ROOT="$(absolute_path "${BACKUP_ROOT:-backups/ferretdb}")"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
HEALTH_REQUIRE_BACKUP="${HEALTH_REQUIRE_BACKUP:-true}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"

failures=0

ok() {
  printf 'ok: %s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'fail: %s\n' "$*" >&2
}

file_mtime_epoch() {
  local path="$1"
  if stat -c '%Y' "$path" >/dev/null 2>&1; then
    stat -c '%Y' "$path"
  else
    stat -f '%m' "$path"
  fi
}

latest_backup_archive() {
  local archive
  local latest=""
  local latest_mtime=0
  local mtime

  shopt -s nullglob
  for archive in "$BACKUP_ROOT"/*.tar.gz; do
    mtime="$(file_mtime_epoch "$archive")"
    if ((mtime > latest_mtime)); then
      latest="$archive"
      latest_mtime="$mtime"
    fi
  done
  shopt -u nullglob

  printf '%s\n' "$latest"
}

check_service() {
  local service="$1"
  local id
  local status

  id="$(compose ps -aq "$service" | head -n 1)"
  if [[ -z "$id" ]]; then
    fail "missing service container: $service"
    return
  fi

  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
  case "$status" in
    healthy | running) ok "service $service is $status" ;;
    *) fail "service $service is $status" ;;
  esac
}

check_compose_services() {
  local services=(
    documentdb
    ferretdb
    redis
    meilisearch
    api
    gateway
  )
  local service

  if rag_enabled; then
    services+=(vectordb rag_api)
  fi

  case "$OBJECT_STORE_MODE" in
    minio) services+=(minio) ;;
    seaweedfs) services+=(seaweedfs) ;;
    external-s3) ;;
    *)
      fail "unsupported OBJECT_STORE_MODE=$OBJECT_STORE_MODE"
      return
      ;;
  esac

  for service in "${services[@]}"; do
    check_service "$service"
  done
}

check_gateway() {
  if curl -fsS --max-time 10 -H "X-Auth-Tenant-Id: $HEALTH_TENANT_ID" "$TENANT_GATEWAY_URL/health" >/dev/null; then
    ok "tenant gateway health endpoint is reachable"
  else
    fail "tenant gateway health endpoint failed at $TENANT_GATEWAY_URL/health"
  fi
}

check_backup_freshness() {
  local latest
  local latest_mtime
  local now
  local max_age_seconds
  local age_seconds

  if [[ "$HEALTH_REQUIRE_BACKUP" != "true" || "$BACKUP_MAX_AGE_HOURS" == "0" ]]; then
    ok "backup freshness check skipped"
    return
  fi

  if [[ ! "$BACKUP_MAX_AGE_HOURS" =~ ^[0-9]+$ ]]; then
    fail "BACKUP_MAX_AGE_HOURS must be a non-negative integer"
    return
  fi

  latest="$(latest_backup_archive)"
  if [[ -z "$latest" ]]; then
    fail "no backup archive found in $BACKUP_ROOT"
    return
  fi

  if [[ ! -f "$latest.sha256" ]]; then
    fail "latest backup is missing checksum file: $latest.sha256"
    return
  fi

  latest_mtime="$(file_mtime_epoch "$latest")"
  now="$(date +%s)"
  max_age_seconds=$((BACKUP_MAX_AGE_HOURS * 3600))
  age_seconds=$((now - latest_mtime))

  if ((age_seconds > max_age_seconds)); then
    fail "latest backup is stale: $latest age=${age_seconds}s max=${max_age_seconds}s"
  else
    ok "latest backup is fresh: $latest"
  fi
}

check_disk_usage() {
  local path="$1"
  local usage

  if [[ ! "$DISK_WARN_PERCENT" =~ ^[0-9]+$ ]]; then
    fail "DISK_WARN_PERCENT must be a non-negative integer"
    return
  fi

  mkdir -p "$path"
  usage="$(df -P "$path" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
  if [[ -z "$usage" ]]; then
    fail "could not determine disk usage for $path"
    return
  fi

  if ((usage >= DISK_WARN_PERCENT)); then
    fail "disk usage for $path is ${usage}% threshold=${DISK_WARN_PERCENT}%"
  else
    ok "disk usage for $path is ${usage}%"
  fi
}

check_compose_services
check_gateway
check_backup_freshness
check_disk_usage "$REPO_ROOT"
check_disk_usage "$BACKUP_ROOT"

if ((failures > 0)); then
  printf 'healthcheck failed with %s issue(s)\n' "$failures" >&2
  exit 1
fi

printf 'healthcheck passed\n'
