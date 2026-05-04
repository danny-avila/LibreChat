#!/usr/bin/env bash

# shellcheck disable=SC2016
# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

require_var DOCUMENTDB_USER
require_var DOCUMENTDB_PASSWORD
require_var REDIS_PASSWORD

if rag_enabled; then
  require_var RAG_POSTGRES_DB
  require_var RAG_POSTGRES_USER
  require_var RAG_POSTGRES_PASSWORD
fi

OBJECT_STORE_MODE="${OBJECT_STORE_MODE:-minio}"

if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  require_var MINIO_ROOT_USER
  require_var MINIO_ROOT_PASSWORD
  require_var MINIO_BUCKET
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  require_var SEAWEEDFS_BUCKET
elif [[ "$OBJECT_STORE_MODE" != "external-s3" ]]; then
  echo "Unsupported OBJECT_STORE_MODE: $OBJECT_STORE_MODE" >&2
  exit 1
fi

RESTART_SEAWEEDFS_AFTER_BACKUP=false

restart_seaweedfs_after_backup() {
  compose up -d seaweedfs >/dev/null || true
  wait_service_healthy seaweedfs 120 || true
  compose up -d seaweedfs-init >/dev/null || true
  compose up -d api gateway >/dev/null || true
}

trap 'if [[ "${RESTART_SEAWEEDFS_AFTER_BACKUP:-false}" == "true" ]]; then restart_seaweedfs_after_backup; fi' EXIT

umask 077

BACKUP_ROOT="$(absolute_path "${BACKUP_ROOT:-backups/ferretdb}")"
BACKUP_NAME="${BACKUP_NAME:-$(timestamp_utc)}"
WORK_DIR="$BACKUP_ROOT/$BACKUP_NAME"
ARCHIVE_PATH="$BACKUP_ROOT/$BACKUP_NAME.tar.gz"

mkdir -p "$WORK_DIR"/{config,documentdb,meilisearch,minio,rag,redis,seaweedfs}

echo "Creating backup: $WORK_DIR"

cat >"$WORK_DIR/metadata.env" <<EOF
backup_name=$BACKUP_NAME
created_at_utc=$(timestamp_utc)
compose_project_name=$COMPOSE_PROJECT_NAME
compose_files=$COMPOSE_FILES
env_file=$ENV_FILE
documentdb_database=postgres
documentdb_backup=physical_pg_basebackup
rag_enabled=${RAG_ENABLED:-false}
object_store_mode=$OBJECT_STORE_MODE
EOF

if rag_enabled; then
  printf 'rag_database=%s\n' "$RAG_POSTGRES_DB" >>"$WORK_DIR/metadata.env"
fi

if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  printf 'minio_bucket=%s\n' "$MINIO_BUCKET" >>"$WORK_DIR/metadata.env"
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  printf 'seaweedfs_bucket=%s\n' "$SEAWEEDFS_BUCKET" >>"$WORK_DIR/metadata.env"
fi

IFS=',' read -r -a compose_config_files <<<"$COMPOSE_FILES"
for compose_config_file in "${compose_config_files[@]}"; do
  if [[ -n "$compose_config_file" && -f "$compose_config_file" ]]; then
    cp "$compose_config_file" "$WORK_DIR/config/$(basename "$compose_config_file")"
  fi
done

if [[ -n "${LIBRECHAT_YAML_PATH:-}" && -f "$(absolute_path "$LIBRECHAT_YAML_PATH")" ]]; then
  cp "$(absolute_path "$LIBRECHAT_YAML_PATH")" "$WORK_DIR/config/librechat.yaml"
fi

sed -E \
  -e '/(PASSWORD|SECRET|TOKEN|KEY|CREDS|JWT|URI)=/ s/=.*/=<redacted>/' \
  "$ENV_FILE" >"$WORK_DIR/config/env.redacted"

if [[ "${BACKUP_INCLUDE_ENV:-false}" == "true" ]]; then
  mkdir -p "$WORK_DIR/secrets"
  cp "$ENV_FILE" "$WORK_DIR/secrets/env"
fi

echo "Backing up DocumentDB/PostgreSQL..."
compose exec -T documentdb sh -ceu 'pg_dumpall --globals-only -U "$POSTGRES_USER"' \
  >"$WORK_DIR/documentdb/globals.sql"
documentdb_scratch="/tmp/librechat-documentdb-basebackup-$BACKUP_NAME"
compose exec -T -e DOCUMENTDB_SCRATCH="$documentdb_scratch" documentdb sh -ceu '
  rm -rf "$DOCUMENTDB_SCRATCH"
  mkdir -p "$DOCUMENTDB_SCRATCH"
  pg_basebackup -U "$POSTGRES_USER" -D "$DOCUMENTDB_SCRATCH" -Fp -X stream -c fast >/dev/null
  tar -C "$DOCUMENTDB_SCRATCH" -cf - .
  rm -rf "$DOCUMENTDB_SCRATCH"
' >"$WORK_DIR/documentdb/basebackup.tar"

if rag_enabled; then
  echo "Backing up RAG pgvector PostgreSQL..."
  compose exec -T vectordb sh -ceu 'pg_dumpall --globals-only -U "$POSTGRES_USER"' \
    >"$WORK_DIR/rag/globals.sql"
  compose exec -T vectordb sh -ceu 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    >"$WORK_DIR/rag/rag.dump"
else
  printf '%s\n' \
    "RAG_ENABLED=false" \
    "This backup does not include RAG pgvector data because RAG is disabled." \
    >"$WORK_DIR/rag/RAG_DISABLED.txt"
fi

if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  echo "Backing up MinIO bucket: $MINIO_BUCKET..."
  minio_container="$(service_container_id minio)"
  minio_scratch="/tmp/librechat-minio-backup-$BACKUP_NAME"
  compose exec -T -e MINIO_SCRATCH="$minio_scratch" -e MINIO_BUCKET="$MINIO_BUCKET" minio sh -ceu '
    rm -rf "$MINIO_SCRATCH"
    mkdir -p "$MINIO_SCRATCH/$MINIO_BUCKET"
    mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite --remove "local/$MINIO_BUCKET" "$MINIO_SCRATCH/$MINIO_BUCKET"
  '
  docker cp "$minio_container:$minio_scratch/." "$WORK_DIR/minio/"
  compose exec -T -e MINIO_SCRATCH="$minio_scratch" minio sh -ceu 'rm -rf "$MINIO_SCRATCH"'
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  echo "Backing up SeaweedFS data volume..."
  RESTART_SEAWEEDFS_AFTER_BACKUP=true
  compose stop gateway api seaweedfs-init seaweedfs >/dev/null || true
  seaweedfs_container="$(service_container_id seaweedfs)"
  seaweedfs_image="$(docker inspect -f '{{.Config.Image}}' "$seaweedfs_container")"
  docker run --rm \
    --volumes-from "$seaweedfs_container" \
    --entrypoint sh \
    "$seaweedfs_image" \
    -ceu 'tar -C /data -cf - .' >"$WORK_DIR/seaweedfs/seaweedfs_data.tar"
  RESTART_SEAWEEDFS_AFTER_BACKUP=false
  restart_seaweedfs_after_backup
else
  echo "Skipping object-store backup because OBJECT_STORE_MODE=external-s3."
  printf '%s\n' \
    "OBJECT_STORE_MODE=external-s3" \
    "This backup does not include external S3-compatible object data." \
    "Back up and restore the external object store with its native tooling." \
    >"$WORK_DIR/minio/EXTERNAL_OBJECT_STORE_NOT_BACKED_UP.txt"
fi

echo "Backing up Meilisearch data volume..."
compose exec -T meilisearch tar -C /meili_data -cf - . >"$WORK_DIR/meilisearch/meili_data.tar"

echo "Backing up Valkey data volume..."
compose exec -T redis sh -ceu 'valkey-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE >/dev/null'
compose exec -T redis tar -C /data -cf - . >"$WORK_DIR/redis/redis_data.tar"

echo "Creating archive: $ARCHIVE_PATH"
mkdir -p "$BACKUP_ROOT"
tar -C "$BACKUP_ROOT" -czf "$ARCHIVE_PATH" "$BACKUP_NAME"
checksum_file "$ARCHIVE_PATH" >"$ARCHIVE_PATH.sha256"

if [[ -n "${BACKUP_RETENTION_DAYS:-}" ]]; then
  if [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
    exit 1
  fi

  find "$BACKUP_ROOT" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.tar.gz.sha256' \) -mtime +"$BACKUP_RETENTION_DAYS" -delete
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '*T*Z' -mtime +"$BACKUP_RETENTION_DAYS" -exec rm -rf {} +
fi

echo "Backup complete:"
echo "$ARCHIVE_PATH"
echo "$ARCHIVE_PATH.sha256"
