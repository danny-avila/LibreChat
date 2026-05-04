#!/usr/bin/env bash

# shellcheck disable=SC2016
# shellcheck source=deploy/ferretdb/bin/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

load_env_file

require_var DOCUMENTDB_USER
require_var DOCUMENTDB_PASSWORD
require_var MEILI_MASTER_KEY

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
  require_var MINIO_MC_IMAGE
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  require_var SEAWEEDFS_ACCESS_KEY
  require_var SEAWEEDFS_SECRET_KEY
  require_var SEAWEEDFS_BUCKET
elif [[ "$OBJECT_STORE_MODE" != "external-s3" ]]; then
  echo "Unsupported OBJECT_STORE_MODE: $OBJECT_STORE_MODE" >&2
  exit 1
fi

if [[ "${DRILL_CONFIRM:-}" != "I_UNDERSTAND_THIS_REPLACES_DATA" ]]; then
  echo "Refusing destructive drill without DRILL_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA" >&2
  exit 1
fi

if [[ "$COMPOSE_PROJECT_NAME" == "librechat-ferretdb" && "${DRILL_ALLOW_DEFAULT_PROJECT:-false}" != "true" ]]; then
  echo "Refusing to drill against default project name without DRILL_ALLOW_DEFAULT_PROJECT=true" >&2
  exit 1
fi

DRILL_ID="${DRILL_ID:-drill-$(timestamp_utc)}"
DRILL_ROOT="$(absolute_path "${DRILL_ROOT:-/tmp/librechat-ferretdb-drill}")"
DRILL_BACKUP_ROOT="$DRILL_ROOT/backups"
DRILL_MONGO_URI="mongodb://$DOCUMENTDB_USER:$DOCUMENTDB_PASSWORD@ferretdb:27017/LibreChatDrill"
API_IMAGE="${LIBRECHAT_API_IMAGE:-librechat-api:ferretdb}"

echo "Running destructive restore drill: $DRILL_ID"

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
wait_service_healthy documentdb 120
wait_service_healthy ferretdb 120
if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  wait_service_healthy minio 120
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  wait_service_healthy seaweedfs 120
fi

seed_documentdb() {
  docker_run_on_compose_network "$API_IMAGE" \
    -e MONGO_URI="$DRILL_MONGO_URI" \
    -e DRILL_ID="$DRILL_ID" \
    -- \
    node - <<'NODE'
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  { _id: String, marker: String },
  { collection: 'drill_markers', versionKey: false },
);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Model = mongoose.model('DrillMarker', schema);
  await Model.updateOne(
    { _id: process.env.DRILL_ID },
    { $set: { marker: 'before-backup' } },
    { upsert: true },
  );
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

delete_documentdb() {
  docker_run_on_compose_network "$API_IMAGE" \
    -e MONGO_URI="$DRILL_MONGO_URI" \
    -e DRILL_ID="$DRILL_ID" \
    -- \
    node - <<'NODE'
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  { _id: String, marker: String },
  { collection: 'drill_markers', versionKey: false },
);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Model = mongoose.model('DrillMarker', schema);
  await Model.deleteOne({ _id: process.env.DRILL_ID });
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

verify_documentdb() {
  docker_run_on_compose_network "$API_IMAGE" \
    -e MONGO_URI="$DRILL_MONGO_URI" \
    -e DRILL_ID="$DRILL_ID" \
    -- \
    node - <<'NODE'
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  { _id: String, marker: String },
  { collection: 'drill_markers', versionKey: false },
);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Model = mongoose.model('DrillMarker', schema);
  const doc = await Model.findById(process.env.DRILL_ID).lean();
  assert.equal(doc?.marker, 'before-backup');
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

seed_rag() {
  compose exec -T -e DRILL_ID="$DRILL_ID" vectordb sh -ceu '
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE TABLE IF NOT EXISTS dr_drill_markers (id text PRIMARY KEY, marker text NOT NULL);
INSERT INTO dr_drill_markers (id, marker)
VALUES ('\''$DRILL_ID'\'', '\''before-backup'\'')
ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;
SQL
  '
}

delete_rag() {
  compose exec -T -e DRILL_ID="$DRILL_ID" vectordb sh -ceu '
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DELETE FROM dr_drill_markers WHERE id = '\''$DRILL_ID'\'';
SQL
  '
}

verify_rag() {
  compose exec -T -e DRILL_ID="$DRILL_ID" vectordb sh -ceu '
    marker="$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<SQL
SELECT marker FROM dr_drill_markers WHERE id = '\''$DRILL_ID'\'';
SQL
)"
    test "$marker" = "before-backup"
  '
}

seed_minio() {
  docker_run_on_compose_network "$MINIO_MC_IMAGE" \
    -e MINIO_ROOT_USER \
    -e MINIO_ROOT_PASSWORD \
    -e MINIO_BUCKET \
    -e DRILL_ID="$DRILL_ID" \
    --entrypoint /bin/sh \
    -- \
    -ceu '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      printf "%s\n" "before-backup" >/tmp/drill-marker.txt
      mc cp /tmp/drill-marker.txt "local/$MINIO_BUCKET/drill/$DRILL_ID.txt" >/dev/null
    '
}

delete_minio() {
  docker_run_on_compose_network "$MINIO_MC_IMAGE" \
    -e MINIO_ROOT_USER \
    -e MINIO_ROOT_PASSWORD \
    -e MINIO_BUCKET \
    -e DRILL_ID="$DRILL_ID" \
    --entrypoint /bin/sh \
    -- \
    -ceu '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      mc rm --force "local/$MINIO_BUCKET/drill/$DRILL_ID.txt" >/dev/null
    '
}

verify_minio() {
  docker_run_on_compose_network "$MINIO_MC_IMAGE" \
    -e MINIO_ROOT_USER \
    -e MINIO_ROOT_PASSWORD \
    -e MINIO_BUCKET \
    -e DRILL_ID="$DRILL_ID" \
    --entrypoint /bin/sh \
    -- \
    -ceu '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      content="$(mc cat "local/$MINIO_BUCKET/drill/$DRILL_ID.txt")"
      test "$content" = "before-backup"
    '
}

seaweedfs_task() {
  docker_run_on_compose_network "$API_IMAGE" \
    -e AWS_ENDPOINT_URL=http://seaweedfs:8333 \
    -e AWS_ACCESS_KEY_ID="$SEAWEEDFS_ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$SEAWEEDFS_SECRET_KEY" \
    -e AWS_BUCKET_NAME="$SEAWEEDFS_BUCKET" \
    -e AWS_REGION="${AWS_REGION:-us-east-1}" \
    -e AWS_FORCE_PATH_STYLE=true \
    -e DRILL_ID="$DRILL_ID" \
    -e S3_ACTION="$1" \
    -- \
    node - <<'NODE'
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

async function streamToString(stream) {
  if (typeof stream?.transformToString === 'function') {
    return stream.transformToString();
  }

  const readable = Readable.from(stream);
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

const client = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  forcePathStyle: process.env.AWS_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const Bucket = process.env.AWS_BUCKET_NAME;
  const Key = `drill/${process.env.DRILL_ID}.txt`;

  if (process.env.S3_ACTION === 'seed') {
    await client.send(new PutObjectCommand({ Bucket, Key, Body: 'before-backup\n' }));
    return;
  }

  if (process.env.S3_ACTION === 'delete') {
    await client.send(new DeleteObjectCommand({ Bucket, Key }));
    return;
  }

  if (process.env.S3_ACTION === 'verify') {
    const object = await client.send(new GetObjectCommand({ Bucket, Key }));
    assert.equal((await streamToString(object.Body)).trim(), 'before-backup');
    return;
  }

  throw new Error(`Unknown S3_ACTION=${process.env.S3_ACTION}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

meili_task() {
  docker_run_on_compose_network "$API_IMAGE" \
    -e MEILI_MASTER_KEY \
    -e DRILL_ID="$DRILL_ID" \
    -e MEILI_ACTION="$1" \
    -- \
    node - <<'NODE'
const assert = require('node:assert/strict');

const base = 'http://meilisearch:7700';
const headers = {
  Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}`,
  'Content-Type': 'application/json',
};

async function waitTask(taskUid) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${base}/tasks/${taskUid}`, { headers });
    const task = await response.json();
    if (task.status === 'succeeded') return;
    if (task.status === 'failed') throw new Error(JSON.stringify(task));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Meilisearch task ${taskUid}`);
}

async function main() {
  if (process.env.MEILI_ACTION === 'seed') {
    const response = await fetch(`${base}/indexes/dr_drill_markers/documents?primaryKey=id`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ id: process.env.DRILL_ID, marker: 'before-backup' }]),
    });
    const task = await response.json();
    await waitTask(task.taskUid);
    return;
  }

  if (process.env.MEILI_ACTION === 'delete') {
    const response = await fetch(`${base}/indexes/dr_drill_markers/documents/${process.env.DRILL_ID}`, {
      method: 'DELETE',
      headers,
    });
    if (response.status !== 404) {
      const task = await response.json();
      await waitTask(task.taskUid);
    }
    return;
  }

  if (process.env.MEILI_ACTION === 'verify') {
    const response = await fetch(`${base}/indexes/dr_drill_markers/documents/${process.env.DRILL_ID}`, {
      headers,
    });
    assert.equal(response.status, 200);
    const doc = await response.json();
    assert.equal(doc.marker, 'before-backup');
    return;
  }

  throw new Error(`Unknown MEILI_ACTION=${process.env.MEILI_ACTION}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

echo "Seeding sentinel data..."
seed_documentdb
if rag_enabled; then
  seed_rag
else
  echo "Skipping RAG sentinel because RAG_ENABLED=false."
fi
if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  seed_minio
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  seaweedfs_task seed
else
  echo "Skipping object-store sentinel because OBJECT_STORE_MODE=external-s3."
fi
meili_task seed

echo "Creating drill backup..."
BACKUP_ROOT="$DRILL_BACKUP_ROOT" BACKUP_NAME="$DRILL_ID" "$SCRIPT_DIR/backup.sh"
BACKUP_ARCHIVE="$DRILL_BACKUP_ROOT/$DRILL_ID.tar.gz"

echo "Deleting sentinel data before restore..."
delete_documentdb
if rag_enabled; then
  delete_rag
fi
if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  delete_minio
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  seaweedfs_task delete
fi
meili_task delete

echo "Restoring drill backup..."
RESTORE_CONFIRM=I_UNDERSTAND_THIS_REPLACES_DATA "$SCRIPT_DIR/restore.sh" "$BACKUP_ARCHIVE"

echo "Verifying restored sentinel data..."
verify_documentdb
if rag_enabled; then
  verify_rag
else
  echo "Skipping RAG verification because RAG_ENABLED=false."
fi
if [[ "$OBJECT_STORE_MODE" == "minio" ]]; then
  verify_minio
elif [[ "$OBJECT_STORE_MODE" == "seaweedfs" ]]; then
  seaweedfs_task verify
else
  echo "Skipping object-store verification because OBJECT_STORE_MODE=external-s3."
fi
meili_task verify

if command -v npm >/dev/null 2>&1; then
  TENANT_GATEWAY_URL="${TENANT_GATEWAY_URL:-http://127.0.0.1:${LIBRECHAT_HTTP_PORT:-3080}}" npm run smoke:tenant-gateway
fi

echo "Disaster-recovery drill passed."
echo "Backup archive: $BACKUP_ARCHIVE"
