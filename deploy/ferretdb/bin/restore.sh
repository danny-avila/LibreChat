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

BACKUP_PATH="${1:-${BACKUP_PATH:-}}"

if [[ -z "$BACKUP_PATH" ]]; then
  echo "Usage: RESTORE_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA $0 <backup-dir-or-tar.gz>" >&2
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "I_UNDERSTAND_THIS_REPLACES_DATA" ]]; then
  echo "Refusing destructive restore without RESTORE_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA" >&2
  exit 1
fi

BACKUP_PATH="$(absolute_path "$BACKUP_PATH")"
RESTORE_TMP=""

cleanup() {
  if [[ -n "$RESTORE_TMP" && -d "$RESTORE_TMP" ]]; then
    rm -rf "$RESTORE_TMP"
  fi
}
trap cleanup EXIT

if [[ -f "$BACKUP_PATH" ]]; then
  RESTORE_TMP="$(mktemp -d)"
  tar -C "$RESTORE_TMP" -xzf "$BACKUP_PATH"
  BACKUP_DIR="$(find "$RESTORE_TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
else
  BACKUP_DIR="$BACKUP_PATH"
fi

for required in \
  "$BACKUP_DIR/documentdb/basebackup.tar" \
  "$BACKUP_DIR/meilisearch/meili_data.tar" \
  "$BACKUP_DIR/redis/redis_data.tar"; do
  if [[ ! -e "$required" ]]; then
    echo "Backup is missing required restore artifact: $required" >&2
    exit 1
  fi
done

if rag_enabled && [[ ! -e "$BACKUP_DIR/rag/rag.dump" ]]; then
  echo "Backup is missing required RAG restore artifact: $BACKUP_DIR/rag/rag.dump" >&2
  exit 1
fi

if [[ "$OBJECT_STORE_MODE" == "minio" && ! -e "$BACKUP_DIR/minio/$MINIO_BUCKET" ]]; then
  echo "Backup is missing required restore artifact: $BACKUP_DIR/minio/$MINIO_BUCKET" >&2
  exit 1
fi

if [[ "$OBJECT_STORE_MODE" == "seaweedfs" && ! -e "$BACKUP_DIR/seaweedfs/seaweedfs_data.tar" ]]; then
  echo "Backup is missing required restore artifact: $BACKUP_DIR/seaweedfs/seaweedfs_data.tar" >&2
  exit 1
fi

echo "Stopping application services before restore..."
compose stop gateway api rag_api ferretdb meilisearch redis documentdb minio minio-init seaweedfs seaweedfs-init >/dev/null || true

if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  if rag_enabled; then
    compose up -d vectordb minio >/dev/null
  else
    compose up -d minio >/dev/null
  fi
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  if rag_enabled; then
    compose up -d vectordb >/dev/null
  fi
  compose create seaweedfs >/dev/null || true
else
  if rag_enabled; then
    compose up -d vectordb >/dev/null
  fi
fi

echo "Restoring DocumentDB/PostgreSQL..."
documentdb_container="$(service_container_id documentdb)"
documentdb_image="$(docker inspect -f '{{.Config.Image}}' "$documentdb_container")"
docker run --rm -i \
  --volumes-from "$documentdb_container" \
  --entrypoint sh \
  "$documentdb_image" \
  -ceu '
    find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    tar -C /var/lib/postgresql/data -xf -
    chown -R postgres:postgres /var/lib/postgresql/data
  ' <"$BACKUP_DIR/documentdb/basebackup.tar"
compose up -d documentdb >/dev/null
wait_service_healthy documentdb 180

if rag_enabled; then
  echo "Restoring RAG pgvector PostgreSQL..."
  compose exec -T vectordb sh -ceu 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    <"$BACKUP_DIR/rag/rag.dump"
else
  echo "Skipping RAG restore because RAG_ENABLED=false."
fi

if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  echo "Restoring MinIO bucket: $MINIO_BUCKET..."
  minio_container="$(service_container_id minio)"
  minio_scratch="/tmp/librechat-minio-restore-$(timestamp_utc)"
  compose exec -T -e MINIO_SCRATCH="$minio_scratch" minio sh -ceu '
    rm -rf "$MINIO_SCRATCH"
    mkdir -p "$MINIO_SCRATCH"
  '
  docker cp "$BACKUP_DIR/minio/." "$minio_container:$minio_scratch/"
  compose exec -T -e MINIO_SCRATCH="$minio_scratch" -e MINIO_BUCKET="$MINIO_BUCKET" minio sh -ceu '
    mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mb --ignore-existing "local/$MINIO_BUCKET" >/dev/null
    mc mirror --overwrite --remove "$MINIO_SCRATCH/$MINIO_BUCKET" "local/$MINIO_BUCKET"
    mc anonymous set none "local/$MINIO_BUCKET" >/dev/null
    rm -rf "$MINIO_SCRATCH"
  '
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  echo "Restoring SeaweedFS data volume..."
  seaweedfs_container="$(service_container_id seaweedfs)"
  seaweedfs_image="$(docker inspect -f '{{.Config.Image}}' "$seaweedfs_container")"
  docker run --rm -i \
    --volumes-from "$seaweedfs_container" \
    --entrypoint sh \
    "$seaweedfs_image" \
    -ceu '
      find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      tar -C /data -xf -
    ' <"$BACKUP_DIR/seaweedfs/seaweedfs_data.tar"
else
  echo "Skipping object-store restore because OBJECT_STORE_MODE=external-s3."
fi

echo "Restoring Meilisearch data volume..."
meili_container="$(service_container_id meilisearch)"
meili_image="$(docker inspect -f '{{.Config.Image}}' "$meili_container")"
docker cp "$BACKUP_DIR/meilisearch/meili_data.tar" "$meili_container:/meili_data/.restore-meili-data.tar"
docker run --rm \
  --volumes-from "$meili_container" \
  --entrypoint sh \
  "$meili_image" \
  -ceu '
    mkdir -p /restore
    mv /meili_data/.restore-meili-data.tar /restore/meili_data.tar
    rm -rf /meili_data/*
    tar -C /meili_data -xf /restore/meili_data.tar
  '

echo "Restoring Valkey data volume..."
redis_container="$(service_container_id redis)"
redis_image="$(docker inspect -f '{{.Config.Image}}' "$redis_container")"
docker cp "$BACKUP_DIR/redis/redis_data.tar" "$redis_container:/data/.restore-redis-data.tar"
docker run --rm \
  --volumes-from "$redis_container" \
  --entrypoint sh \
  "$redis_image" \
  -ceu '
    mkdir -p /restore
    mv /data/.restore-redis-data.tar /restore/redis_data.tar
    rm -rf /data/*
    tar -C /data -xf /restore/redis_data.tar
  '

echo "Starting restored stack..."
if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  if rag_enabled; then
    compose up -d documentdb vectordb minio redis meilisearch rag_api ferretdb minio-init >/dev/null
  else
    compose up -d documentdb minio redis meilisearch ferretdb minio-init >/dev/null
  fi
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  if rag_enabled; then
    compose up -d documentdb vectordb seaweedfs redis meilisearch rag_api ferretdb seaweedfs-init >/dev/null
  else
    compose up -d documentdb seaweedfs redis meilisearch ferretdb seaweedfs-init >/dev/null
  fi
else
  if rag_enabled; then
    compose up -d documentdb vectordb redis meilisearch rag_api ferretdb >/dev/null
  else
    compose up -d documentdb redis meilisearch ferretdb >/dev/null
  fi
fi
compose up -d api >/dev/null
wait_service_healthy api 240
compose up -d gateway >/dev/null
wait_service_healthy gateway 60

echo "Restore complete from: $BACKUP_DIR"
