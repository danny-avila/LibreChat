#!/usr/bin/env bash

# shellcheck shell=bash
# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

BOOTSTRAP_DRY_RUN="${BOOTSTRAP_DRY_RUN:-false}"
BOOTSTRAP_INSTALL_SYSTEMD="${BOOTSTRAP_INSTALL_SYSTEMD:-true}"
BOOTSTRAP_BUILD_API="${BOOTSTRAP_BUILD_API:-true}"
BOOTSTRAP_START_STACK="${BOOTSTRAP_START_STACK:-true}"
BOOTSTRAP_RUN_FIRST_BACKUP="${BOOTSTRAP_RUN_FIRST_BACKUP:-true}"
BOOTSTRAP_RUN_BACKUP_SHIPPING="${BOOTSTRAP_RUN_BACKUP_SHIPPING:-auto}"
BOOTSTRAP_INSTALL_SHIP_TIMER="${BOOTSTRAP_INSTALL_SHIP_TIMER:-auto}"
BOOTSTRAP_RUN_RELEASE_EVIDENCE="${BOOTSTRAP_RUN_RELEASE_EVIDENCE:-true}"
BOOTSTRAP_ALLOW_NON_LINUX="${BOOTSTRAP_ALLOW_NON_LINUX:-false}"
BOOTSTRAP_ARTIFACT_ROOT="$(absolute_path "${BOOTSTRAP_ARTIFACT_ROOT:-artifacts/bootstrap-host}")"
BOOTSTRAP_ARTIFACT_NAME="${BOOTSTRAP_ARTIFACT_NAME:-$(timestamp_utc)}"
BOOTSTRAP_ARTIFACT_DIR="$BOOTSTRAP_ARTIFACT_ROOT/$BOOTSTRAP_ARTIFACT_NAME"

SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
BACKUP_ROOT="$(absolute_path "${BACKUP_ROOT:-/srv/librechat/backups}")"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
SHIP_ENV_FILE="${SHIP_ENV_FILE:-$DEPLOY_DIR/.env.backup-shipping}"
TENANT_GATEWAY_URL="${TENANT_GATEWAY_URL:-http://127.0.0.1:${LIBRECHAT_HTTP_PORT:-3080}}"

mkdir -p "$BOOTSTRAP_ARTIFACT_DIR/systemd" "$BOOTSTRAP_ARTIFACT_DIR/logs"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'bootstrap failed: %s\n' "$*" >&2
  exit 1
}

enabled() {
  case "$1" in
    true | TRUE | 1 | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

run_cmd() {
  if enabled "$BOOTSTRAP_DRY_RUN"; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

run_root() {
  if ((EUID == 0)); then
    run_cmd "$@"
  else
    run_cmd sudo "$@"
  fi
}

run_env_cmd() {
  if enabled "$BOOTSTRAP_DRY_RUN"; then
    printf '+'
    printf ' %q' env "$@"
    printf '\n'
  else
    env "$@"
  fi
}

capture_cmd() {
  local output="$1"
  shift

  if enabled "$BOOTSTRAP_DRY_RUN"; then
    printf '+'
    printf ' %q' "$@"
    printf ' > %q\n' "$output"
    printf 'dry-run placeholder\n' >"$output"
  else
    "$@" >"$output"
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "missing required command: $command_name"
  fi
}

require_linux_host() {
  local kernel
  kernel="$(uname -s)"
  if [[ "$kernel" != "Linux" && "$BOOTSTRAP_ALLOW_NON_LINUX" != "true" && "$BOOTSTRAP_DRY_RUN" != "true" ]]; then
    fail "this bootstrap is intended for Linux/systemd hosts; set BOOTSTRAP_DRY_RUN=true to preview"
  fi
}

backup_shipping_configured() {
  [[ -n "${BACKUP_REMOTE:-}" || -f "$SHIP_ENV_FILE" ]]
}

sed_escape() {
  printf '%s' "$1" | sed -E 's/[\/&]/\\&/g'
}

compose_files_csv_abs() {
  local file
  local abs
  local output=""

  IFS=',' read -r -a files <<<"$COMPOSE_FILES"
  for file in "${files[@]}"; do
    if [[ -n "$file" ]]; then
      abs="$(absolute_path "$file")"
      if [[ -n "$output" ]]; then
        output+=","
      fi
      output+="$abs"
    fi
  done

  printf '%s\n' "$output"
}

compose_file_args_abs() {
  local file
  local abs
  local output=""

  IFS=',' read -r -a files <<<"$COMPOSE_FILES"
  for file in "${files[@]}"; do
    if [[ -n "$file" ]]; then
      abs="$(absolute_path "$file")"
      output+=" -f $abs"
    fi
  done

  printf '%s\n' "$output"
}

render_unit() {
  local unit="$1"
  local src="$DEPLOY_DIR/systemd/$unit"
  local dest="$BOOTSTRAP_ARTIFACT_DIR/systemd/$unit"
  local env_abs
  local compose_files_abs
  local compose_args_abs
  local ship_env_abs
  local escaped_repo
  local escaped_backup
  local escaped_project
  local escaped_env
  local escaped_compose_files
  local escaped_compose_args
  local escaped_ship_env
  local escaped_retention
  local escaped_backup_age
  local escaped_disk_warn

  [[ -f "$src" ]] || fail "missing systemd unit template: $src"

  env_abs="$(absolute_path "$ENV_FILE")"
  compose_files_abs="$(compose_files_csv_abs)"
  compose_args_abs="$(compose_file_args_abs)"
  ship_env_abs="$(absolute_path "$SHIP_ENV_FILE")"
  escaped_repo="$(sed_escape "$REPO_ROOT")"
  escaped_backup="$(sed_escape "$BACKUP_ROOT")"
  escaped_project="$(sed_escape "$COMPOSE_PROJECT_NAME")"
  escaped_env="$(sed_escape "$env_abs")"
  escaped_compose_files="$(sed_escape "$compose_files_abs")"
  escaped_compose_args="$(sed_escape "$compose_args_abs")"
  escaped_ship_env="$(sed_escape "$ship_env_abs")"
  escaped_retention="$(sed_escape "$BACKUP_RETENTION_DAYS")"
  escaped_backup_age="$(sed_escape "$BACKUP_MAX_AGE_HOURS")"
  escaped_disk_warn="$(sed_escape "$DISK_WARN_PERCENT")"

  sed -E \
    -e "s#/opt/librechat#$escaped_repo#g" \
    -e "s#/srv/librechat/backups#$escaped_backup#g" \
    -e "s#^Environment=ENV_FILE=.*#Environment=ENV_FILE=$escaped_env#" \
    -e "s#^Environment=COMPOSE_FILES=.*#Environment=COMPOSE_FILES=$escaped_compose_files#" \
    -e "s#^Environment=SHIP_ENV_FILE=.*#Environment=SHIP_ENV_FILE=$escaped_ship_env#" \
    -e "s#COMPOSE_PROJECT_NAME=librechat-ferretdb#COMPOSE_PROJECT_NAME=$escaped_project#g" \
    -e "s#BACKUP_RETENTION_DAYS=14#BACKUP_RETENTION_DAYS=$escaped_retention#g" \
    -e "s#BACKUP_MAX_AGE_HOURS=30#BACKUP_MAX_AGE_HOURS=$escaped_backup_age#g" \
    -e "s#DISK_WARN_PERCENT=85#DISK_WARN_PERCENT=$escaped_disk_warn#g" \
    -e "s#^ExecStart=/usr/bin/docker compose .* up -d#ExecStart=/usr/bin/docker compose --env-file $escaped_env$escaped_compose_args up -d#" \
    -e "s#^ExecStop=/usr/bin/docker compose .* down#ExecStop=/usr/bin/docker compose --env-file $escaped_env$escaped_compose_args down#" \
    "$src" >"$dest"
}

install_unit() {
  local unit="$1"
  local rendered="$BOOTSTRAP_ARTIFACT_DIR/systemd/$unit"
  local target="$SYSTEMD_DIR/$unit"

  run_root install -m 0644 "$rendered" "$target"
}

install_systemd_units() {
  local units=(
    librechat-ferretdb-seaweedfs.service
    librechat-ferretdb-seaweedfs-backup.service
    librechat-ferretdb-seaweedfs-backup.timer
    librechat-ferretdb-seaweedfs-healthcheck.service
    librechat-ferretdb-seaweedfs-healthcheck.timer
  )
  local unit
  local install_ship_timer=false

  if [[ "$BOOTSTRAP_INSTALL_SHIP_TIMER" == "auto" ]]; then
    if backup_shipping_configured; then
      install_ship_timer=true
    fi
  elif enabled "$BOOTSTRAP_INSTALL_SHIP_TIMER"; then
    install_ship_timer=true
  fi

  if enabled "$install_ship_timer"; then
    units+=(
      librechat-ferretdb-ship-backups.service
      librechat-ferretdb-ship-backups.timer
    )
  fi

  for unit in "${units[@]}"; do
    render_unit "$unit"
    install_unit "$unit"
  done

  run_root systemctl daemon-reload
  run_root systemctl enable --now librechat-ferretdb-seaweedfs.service
  run_root systemctl enable --now librechat-ferretdb-seaweedfs-backup.timer
  run_root systemctl enable --now librechat-ferretdb-seaweedfs-healthcheck.timer

  if enabled "$install_ship_timer"; then
    run_root systemctl enable --now librechat-ferretdb-ship-backups.timer
  else
    log "backup shipping timer not installed; configure $SHIP_ENV_FILE or BACKUP_REMOTE first"
  fi
}

preflight() {
  require_linux_host
  if ! enabled "$BOOTSTRAP_DRY_RUN"; then
    require_command docker
    require_command npm
  fi

  if enabled "$BOOTSTRAP_INSTALL_SYSTEMD" && ! enabled "$BOOTSTRAP_DRY_RUN"; then
    require_command systemctl
  fi

  if [[ "${OBJECT_STORE_MODE:-}" != "seaweedfs" ]]; then
    fail "bootstrap-host.sh is for the no-AGPL SeaweedFS path; set OBJECT_STORE_MODE=seaweedfs"
  fi

  if [[ "$COMPOSE_FILES" != *deploy-compose.ferretdb.seaweedfs.yml* ]]; then
    fail "COMPOSE_FILES must include deploy-compose.ferretdb.seaweedfs.yml"
  fi
}

run_validation_and_render() {
  run_cmd "$SCRIPT_DIR/validate-env.sh"
  capture_cmd "$BOOTSTRAP_ARTIFACT_DIR/compose.config.yml" compose config
}

build_api() {
  if enabled "$BOOTSTRAP_BUILD_API"; then
    run_cmd compose build api
  else
    log "skipping API image build"
  fi
}

start_stack() {
  if ! enabled "$BOOTSTRAP_START_STACK"; then
    log "skipping stack start"
    return
  fi

  if enabled "$BOOTSTRAP_INSTALL_SYSTEMD"; then
    install_systemd_units
  else
    run_cmd compose up -d
  fi
}

run_first_backup_and_checks() {
  if ! enabled "$BOOTSTRAP_START_STACK"; then
    log "skipping runtime checks because BOOTSTRAP_START_STACK=false"
    return
  fi

  run_env_cmd \
    HEALTH_REQUIRE_BACKUP=false \
    TENANT_GATEWAY_URL="$TENANT_GATEWAY_URL" \
    "$SCRIPT_DIR/healthcheck.sh"

  if enabled "$BOOTSTRAP_RUN_FIRST_BACKUP"; then
    run_cmd "$SCRIPT_DIR/backup.sh"
  else
    log "skipping first backup"
  fi

  run_env_cmd \
    TENANT_GATEWAY_URL="$TENANT_GATEWAY_URL" \
    "$SCRIPT_DIR/healthcheck.sh"

  if [[ "$BOOTSTRAP_RUN_BACKUP_SHIPPING" == "auto" ]]; then
    if backup_shipping_configured; then
      run_env_cmd BACKUP_SHIP_DRY_RUN=true "$SCRIPT_DIR/ship-backups.sh"
    else
      log "backup shipping dry-run skipped; configure $SHIP_ENV_FILE or BACKUP_REMOTE first"
    fi
  elif enabled "$BOOTSTRAP_RUN_BACKUP_SHIPPING"; then
    run_env_cmd BACKUP_SHIP_DRY_RUN=true "$SCRIPT_DIR/ship-backups.sh"
  else
    log "backup shipping dry-run disabled"
  fi
}

run_release_evidence() {
  if enabled "$BOOTSTRAP_RUN_RELEASE_EVIDENCE"; then
    run_env_cmd \
      TENANT_GATEWAY_URL="$TENANT_GATEWAY_URL" \
      EVIDENCE_ROOT="${EVIDENCE_ROOT:-$REPO_ROOT/artifacts/release-evidence}" \
      npm run release:evidence
  else
    log "skipping release evidence"
  fi
}

log "LibreChat FerretDB SeaweedFS host bootstrap"
log "repo: $REPO_ROOT"
log "env: $ENV_FILE"
log "compose files: $COMPOSE_FILES"
log "backup root: $BACKUP_ROOT"
log "artifacts: $BOOTSTRAP_ARTIFACT_DIR"
if enabled "$BOOTSTRAP_DRY_RUN"; then
  log "mode: dry-run"
fi

preflight
run_validation_and_render
build_api
start_stack
run_first_backup_and_checks
run_release_evidence

log "bootstrap complete"
