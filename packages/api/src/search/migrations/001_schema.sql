-- chat_search: core projection schema.
-- Idempotent. Applied by the migration owner role only.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS chat_search;

-- Projector-assigned, monotonically increasing projection version.
-- The source store has no per-record monotonic version (findOneAndUpdate never
-- bumps __v, bulk paths skip timestamps), so the lease holder assigns it here.
CREATE SEQUENCE IF NOT EXISTS chat_search.projection_version_seq AS bigint START WITH 1;

CREATE TABLE IF NOT EXISTS chat_search.documents (
  tenant_id             text        NOT NULL,
  user_id               text        NOT NULL,
  kind                  text        NOT NULL,
  record_id             text        NOT NULL,
  conversation_id       text,
  title                 text        NOT NULL DEFAULT '',
  body                  text        NOT NULL DEFAULT '',
  tags                  text[]      NOT NULL DEFAULT '{}'::text[],
  is_archived           boolean     NOT NULL DEFAULT false,
  project_id            text,
  is_temporary          boolean     NOT NULL DEFAULT false,
  source_created_at     timestamptz,
  source_updated_at     timestamptz,
  expires_at            timestamptz,
  projection_version    bigint      NOT NULL,
  content_hash          text        NOT NULL DEFAULT '',
  embedding_input_hash  text        NOT NULL DEFAULT '',
  deleted_at            timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  search_vector         tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(body, '')), 'B')
  ) STORED,
  CONSTRAINT documents_pkey PRIMARY KEY (tenant_id, user_id, kind, record_id),
  CONSTRAINT documents_kind_check CHECK (kind IN ('message', 'conversation', 'shared-link'))
);

-- Scope + sort B-tree indexes. Every arm filters (tenant_id, user_id, kind)
-- first, then sorts by one of the three permitted sort fields with record_id as
-- the unique final tiebreak.
CREATE INDEX IF NOT EXISTS documents_scope_updated_idx
  ON chat_search.documents (tenant_id, user_id, kind, source_updated_at DESC, record_id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_scope_created_idx
  ON chat_search.documents (tenant_id, user_id, kind, source_created_at DESC, record_id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_scope_title_idx
  ON chat_search.documents (tenant_id, user_id, kind, title, record_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_conversation_idx
  ON chat_search.documents (tenant_id, user_id, conversation_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_fts_idx
  ON chat_search.documents USING gin (search_vector);

CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON chat_search.documents USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS documents_body_trgm_idx
  ON chat_search.documents USING gin (body gin_trgm_ops);

-- Expiration index: powers the TTL/retention sweep. now() is not immutable so it
-- cannot appear in the predicate; the partial index keeps it to rows that can expire.
CREATE INDEX IF NOT EXISTS documents_expires_idx
  ON chat_search.documents (expires_at)
  WHERE expires_at IS NOT NULL;

-- Tombstone retention scan (rule 11: retained until the ClickHouse key collapses).
CREATE INDEX IF NOT EXISTS documents_deleted_idx
  ON chat_search.documents (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Version-fenced sweep (rule 9) scans by (kind, projection_version).
CREATE INDEX IF NOT EXISTS documents_version_idx
  ON chat_search.documents (kind, projection_version);

CREATE TABLE IF NOT EXISTS chat_search.embeddings (
  tenant_id             text        NOT NULL,
  user_id               text        NOT NULL,
  kind                  text        NOT NULL,
  record_id             text        NOT NULL,
  space                 text        NOT NULL,
  embedding_input_hash  text        NOT NULL,
  model                 text        NOT NULL,
  dimensions            integer     NOT NULL,
  normalized            boolean     NOT NULL,
  formatter_version     text        NOT NULL,
  embedding             vector(1024) NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embeddings_pkey PRIMARY KEY (tenant_id, user_id, kind, record_id, space),
  CONSTRAINT embeddings_document_fkey
    FOREIGN KEY (tenant_id, user_id, kind, record_id)
    REFERENCES chat_search.documents (tenant_id, user_id, kind, record_id)
    ON DELETE CASCADE
);

-- HNSW exists for benchmarking only; serving starts with exact scoped scans
-- until the filtered-recall gate passes.
CREATE INDEX IF NOT EXISTS embeddings_hnsw_cosine_idx
  ON chat_search.embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS chat_search.outbox (
  outbox_seq          bigserial   PRIMARY KEY,
  tenant_id           text        NOT NULL,
  user_id             text        NOT NULL,
  kind                text        NOT NULL,
  record_id           text        NOT NULL,
  projection_version  bigint      NOT NULL,
  op                  text        NOT NULL,
  enqueued_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_op_check CHECK (op IN ('upsert', 'tombstone'))
);

CREATE INDEX IF NOT EXISTS outbox_key_idx
  ON chat_search.outbox (tenant_id, user_id, kind, record_id, outbox_seq DESC);

-- Retention trim: rows are removed once applied, retained 24h for audit replay.
CREATE INDEX IF NOT EXISTS outbox_enqueued_idx
  ON chat_search.outbox (enqueued_at);

-- One row per downstream target, written only by the lease holder.
--
-- `lease_epoch` is the fencing token: a consumer that lost the lease and wakes
-- up late cannot roll the watermark back or race the new holder. A zero-row
-- UPDATE means "fenced" and must stop the consumer rather than be retried.
--
-- `gap_barrier_seq` / `gap_barrier_xmax` make the contiguous-prefix rule
-- terminate. `outbox_seq` values are drawn at INSERT time, so an aborted
-- transaction burns its value permanently and a naive "advance only over a
-- contiguous prefix" consumer would wait forever for a sequence number that can
-- never commit. On first sight of a gap the consumer persists the snapshot xmax
-- observed in the same statement; the gap may be skipped only once
-- `pg_snapshot_xmin(pg_current_snapshot())` reaches that bound, i.e. once every
-- transaction alive at observation time has ended and the missing value can no
-- longer appear. `numeric` holds a 64-bit xid8 without wraparound and survives
-- the driver round trip.
CREATE TABLE IF NOT EXISTS chat_search.watermark (
  target            text        PRIMARY KEY,
  applied_seq       bigint      NOT NULL DEFAULT 0,
  applied_version   bigint      NOT NULL DEFAULT 0,
  lease_epoch       bigint      NOT NULL DEFAULT 0,
  gap_barrier_seq   bigint,
  gap_barrier_xmax  numeric,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chat_search.watermark (target)
VALUES ('clickhouse')
ON CONFLICT (target) DO NOTHING;

-- Renewable projector lease. The advisory lock provides mutual exclusion; the
-- epoch fences writes from a deposed holder that has not yet noticed.
CREATE TABLE IF NOT EXISTS chat_search.lease (
  name        text        PRIMARY KEY,
  epoch       bigint      NOT NULL DEFAULT 0,
  holder      text,
  renewed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chat_search.lease (name)
VALUES ('projector')
ON CONFLICT (name) DO NOTHING;

-- Poison-row quarantine: a row failing projection 5 consecutive times is parked
-- here and alerted on, never retried forever.
CREATE TABLE IF NOT EXISTS chat_search.failures (
  tenant_id     text        NOT NULL,
  user_id       text        NOT NULL,
  kind          text        NOT NULL,
  record_id     text        NOT NULL,
  failures      integer     NOT NULL DEFAULT 0,
  quarantined   boolean     NOT NULL DEFAULT false,
  last_error    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT failures_pkey PRIMARY KEY (tenant_id, user_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS failures_quarantined_idx
  ON chat_search.failures (quarantined, updated_at)
  WHERE quarantined;
