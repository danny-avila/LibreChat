-- chat_search: core projection schema.
-- Idempotent. Applied by the migration owner role only.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS chat_search;

-- Neither extension is guaranteed to live in `public`: the compose bootstrap in
-- `search/init` installs both into `chat_search`, and a managed service commonly
-- puts them in a dedicated `extensions` schema. The `vector` type and the
-- `gin_trgm_ops` / `vector_cosine_ops` operator classes used below are resolved
-- only through `search_path` — USAGE on the schema is not enough — so it is
-- pointed at wherever the two actually landed, and reset at the end of the file.
-- `pg_catalog` is listed first so an extension schema cannot shadow a built-in.
DO $$
DECLARE
  extension_schemas text;
BEGIN
  SELECT string_agg(DISTINCT quote_ident(n.nspname), ', ')
    INTO extension_schemas
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname IN ('pg_trgm', 'vector');
  EXECUTE 'SET search_path = ' || concat_ws(', ', 'pg_catalog', extension_schemas, 'public');
END
$$;

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
  -- Sort keys, and the reason they are NOT NULL with a sentinel rather than
  -- nullable.
  --
  -- Both are sorted DESC by the keyset indexes below. Under DESC, PostgreSQL's
  -- default is NULLS FIRST, so nullable columns put every timestamp-less row at
  -- the head of page 1; the tuple comparison that resumes the next page from that
  -- boundary is then `(col, record_id) < (NULL, ...)`, which is NULL, which
  -- matches nothing — pagination silently stops after one page. `NULLS LAST` on
  -- the index would fix the ordering, but only for a query that also spells out
  -- `NULLS LAST` and coalesces its cursor, and nothing makes a query written later
  -- do either. The sentinel cannot be forgotten: there is no NULL to mishandle,
  -- and a projector that tries to write one fails loudly at the constraint instead
  -- of quietly truncating a result page. `-infinity` sorts last under DESC, which
  -- is where a record with no known source timestamp belongs.
  source_created_at     timestamptz NOT NULL DEFAULT '-infinity',
  source_updated_at     timestamptz NOT NULL DEFAULT '-infinity',
  expires_at            timestamptz,
  projection_version    bigint      NOT NULL,
  -- When the source state this row was built from was read.
  --
  -- The projection version orders writes; this orders the *reads* behind them,
  -- which is a different thing and the one that decides who wins. A projector
  -- reads the source outside the transaction that later takes the per-record
  -- lock, and its three layers run on independent timers, so one pass can read
  -- old content, another can read and project a newer edit, and the first can
  -- then commit on top with a higher version. Refusing a write whose source read
  -- predates the stored one makes that unrepresentable regardless of which pass
  -- arrives when. `-infinity` so a row written before this column existed loses
  -- to any real read rather than winning every comparison.
  source_read_at        timestamptz NOT NULL DEFAULT '-infinity',
  content_hash          text        NOT NULL DEFAULT '',
  embedding_input_hash  text        NOT NULL DEFAULT '',
  deleted_at            timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Full-text vector over a *bounded* prefix of the indexed text.
  --
  -- A tsvector addresses its lexeme buffer with a 20-bit offset, so the distinct
  -- lexemes of one value must fit in 1,048,575 bytes; past that `to_tsvector`
  -- raises `string is too long for tsvector`. In a STORED generated column that
  -- error aborts the whole INSERT/UPDATE, so a single oversized document would
  -- stop being *stored* rather than merely stop being *indexed* — a 2.2 MB body of
  -- distinct words is enough, and nothing upstream caps body length.
  --
  -- 8,192 + 192,000 = 200,192 characters. Lexemes are substrings of the input, so
  -- the buffer is bounded by the input's byte length, and the widest UTF-8
  -- encoding is 4 bytes per character: 800,768 bytes worst case, ~76% of the
  -- limit, with the remaining quarter as headroom. The title share is eight times
  -- the application's 1,024-character title cap. `body` itself is stored and
  -- returned in full; only the text handed to the ranker is clipped.
  search_vector         tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, left(coalesce(title, ''), 8192)), 'A') ||
    setweight(to_tsvector('simple'::regconfig, left(coalesce(body, ''), 192000)), 'B')
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

-- Title sort, over a bounded prefix rather than the column.
--
-- A B-tree index tuple may be compressed but is never moved out of line, so it
-- has to fit a page: ~2704 bytes. An unbounded `title` therefore makes writing the
-- row fail, not just sorting it — around 900 CJK characters is enough, which is
-- inside the 1,024-character cap the rename path already allows and unbounded on
-- the conversation import path. 512 characters is at most 2,048 bytes in UTF-8,
-- leaving room for the scope columns and tuple overhead.
--
-- Sorting is unaffected in practice: two titles only compare equal here if their
-- first 512 characters are identical, and `record_id` remains the unique final
-- tiebreak, so the order is still total and stable. Queries must sort by the same
-- `left(title, 512)` expression for the planner to use this index.
CREATE INDEX IF NOT EXISTS documents_scope_title_idx
  ON chat_search.documents (tenant_id, user_id, kind, left(title, 512), record_id)
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

-- Tombstone retention scan.
--
-- A deletion is projected as a tombstone row, not a physical delete: the
-- reconciliation anti-join needs something that says "this record is gone" rather
-- than merely absent, and the analytics target only learns of the deletion once
-- the tombstone has propagated and its key has collapsed. Dropping the tombstone
-- before that leaves an older content-bearing row downstream with nothing left to
-- contradict it, so the retention pass repeatedly asks for tombstones by age. The
-- partial predicate keeps that scan proportional to the tombstones rather than to
-- the live rows, which outnumber them by orders of magnitude.
CREATE INDEX IF NOT EXISTS documents_deleted_idx
  ON chat_search.documents (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Version-fenced reconciliation sweep.
--
-- The sweep tombstones rows the source no longer has, but only those whose
-- projection version is below the value the counter held when the scan began: a
-- row upserted mid-scan behind the cursor carries a higher version and must
-- survive, or an ordinary edit during an hourly sweep is buried by it. That makes
-- the sweep a bounded range scan per kind, which is why the index leads with
-- `kind` and carries the version.
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

-- Every object above is schema-qualified and every expression was resolved at DDL
-- time, so the extension lookup path is no longer needed; the connection is
-- handed back to whatever it was configured with.
RESET search_path;
