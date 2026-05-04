#!/usr/bin/env bash

# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

SHIP_ENV_FILE="${SHIP_ENV_FILE:-$DEPLOY_DIR/.env.backup-shipping}"
if [[ -f "$SHIP_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$SHIP_ENV_FILE"
  set +a
fi

BACKUP_ROOT="$(absolute_path "${BACKUP_ROOT:-backups/ferretdb}")"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_SHIP_MODE="${BACKUP_SHIP_MODE:-copy}"
BACKUP_SHIP_DRY_RUN="${BACKUP_SHIP_DRY_RUN:-false}"
BACKUP_SHIP_TRANSFERS="${BACKUP_SHIP_TRANSFERS:-4}"
BACKUP_SHIP_CHECKERS="${BACKUP_SHIP_CHECKERS:-8}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "Missing required command: rclone" >&2
  exit 1
fi

if [[ -z "$BACKUP_REMOTE" ]]; then
  echo "Required environment variable is not set: BACKUP_REMOTE" >&2
  exit 1
fi

if [[ ! -d "$BACKUP_ROOT" ]]; then
  echo "Backup root does not exist: $BACKUP_ROOT" >&2
  exit 1
fi

shopt -s nullglob
archives=("$BACKUP_ROOT"/*.tar.gz)
shopt -u nullglob

if [[ "${#archives[@]}" -eq 0 ]]; then
  echo "No backup archives found in $BACKUP_ROOT" >&2
  exit 1
fi

rclone_args=(
  --filter
  '+ *.tar.gz'
  --filter
  '+ *.tar.gz.sha256'
  --filter
  '- *'
  --transfers
  "$BACKUP_SHIP_TRANSFERS"
  --checkers
  "$BACKUP_SHIP_CHECKERS"
  --immutable
)

if [[ "$BACKUP_SHIP_DRY_RUN" == "true" ]]; then
  rclone_args+=(--dry-run)
fi

case "$BACKUP_SHIP_MODE" in
  copy)
    rclone copy "$BACKUP_ROOT" "$BACKUP_REMOTE" "${rclone_args[@]}"
    ;;
  sync)
    rclone sync "$BACKUP_ROOT" "$BACKUP_REMOTE" "${rclone_args[@]}"
    ;;
  *)
    echo "Unsupported BACKUP_SHIP_MODE: $BACKUP_SHIP_MODE" >&2
    exit 1
    ;;
esac

echo "Backup shipping complete: $BACKUP_ROOT -> $BACKUP_REMOTE"
