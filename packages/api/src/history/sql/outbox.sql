-- PostgreSQL `chat_search.outbox` / `chat_search.watermark` — REFERENCE DDL.
--
-- OWNERSHIP: track 4 (PostgreSQL search) owns the authoritative migration for
-- the `chat_search` schema. This file is the *contract* the track-6 outbox
-- consumer reads and writes against: if track 4's migration diverges from the
-- column names/types below, `src/history/consumer.ts` and
-- `src/history/source.ts` break at merge time and this file is where the
-- reconciliation happens. It is safe to apply standalone against an empty
-- `chat_search_db` for integration testing (`CHAT_SEARCH_TEST_URL`).
--
-- `chat_search.documents` / `chat_search.embeddings` are NOT defined here — the
-- consumer reads them through `HistoryDocumentSource`, and the default SQL
-- implementation's expected columns are listed at the bottom of this file.

CREATE SCHEMA IF NOT EXISTS chat_search;

-- ---------------------------------------------------------------------------
-- chat_search.outbox  (PLAN [R6])
-- ---------------------------------------------------------------------------
-- Appended in the SAME transaction as the corresponding documents upsert.
--
-- `outbox_seq` is drawn at INSERT time, so SEQUENCE ORDER IS NOT COMMIT ORDER.
-- Consumers must never read `WHERE outbox_seq > W ORDER BY outbox_seq` naively;
-- see the xmin-visibility + contiguous-prefix rule in `src/history/frontier.ts`.
CREATE TABLE IF NOT EXISTS chat_search.outbox
(
    outbox_seq          bigserial PRIMARY KEY,
    tenant_id           text        NOT NULL,
    user_id             text        NOT NULL,
    kind                text        NOT NULL,
    record_id           text        NOT NULL,
    projection_version  bigint      NOT NULL,
    op                  text        NOT NULL CHECK (op IN ('upsert', 'tombstone')),
    enqueued_at         timestamptz NOT NULL DEFAULT now()
);

-- The consumer's only read path: the visible window above the watermark.
CREATE INDEX IF NOT EXISTS outbox_seq_idx ON chat_search.outbox (outbox_seq);

-- Retention trim: rows are removed once applied <= W, retained 24h for audit
-- replay (PLAN chat_search.outbox spec). Run under the lease, never as a TTL
-- that could outrun the consumer.
--   DELETE FROM chat_search.outbox
--   WHERE outbox_seq <= $applied_seq AND enqueued_at < now() - interval '24 hours';

-- ---------------------------------------------------------------------------
-- chat_search.watermark
-- ---------------------------------------------------------------------------
-- One row per downstream target. Written ONLY by the projector lease holder.
--
-- `lease_epoch` is the fencing token: every write asserts
-- `lease_epoch <= :epoch`, so a superseded consumer that wakes up after losing
-- the lease cannot roll the watermark back or race a newer epoch. `applied_seq`
-- is additionally guarded monotonically. A zero-row UPDATE means "fenced" and
-- must stop the consumer, not retry.
--
-- `gap_barrier_xmax` / `gap_barrier_seq` persist the permanent-gap barrier
-- across restarts: when a `bigserial` value is burned by an aborted transaction
-- the contiguous prefix would stall forever, so the consumer records the
-- snapshot xmax observed when it first saw the gap and may only skip the gap
-- once `pg_snapshot_xmin(pg_current_snapshot()) >= gap_barrier_xmax`, i.e. once
-- every transaction that existed at observation time has completed and the
-- missing sequence value can never appear. Both are xid8 (64-bit, no wraparound).
CREATE TABLE IF NOT EXISTS chat_search.watermark
(
    target            text        PRIMARY KEY,
    applied_seq       bigint      NOT NULL DEFAULT 0,
    applied_version   bigint      NOT NULL DEFAULT 0,
    lease_epoch       bigint      NOT NULL DEFAULT 0,
    gap_barrier_seq   bigint,
    gap_barrier_xmax  numeric,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chat_search.watermark (target) VALUES ('clickhouse')
ON CONFLICT (target) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants (PLAN Security roles)
-- ---------------------------------------------------------------------------
-- The request reader gets NO grants on outbox or watermark. Only the projection
-- writer (CHAT_SEARCH_WRITER_URL) touches them.
--   GRANT SELECT, INSERT, DELETE ON chat_search.outbox            TO chat_search_writer;
--   GRANT USAGE   ON SEQUENCE chat_search.outbox_outbox_seq_seq   TO chat_search_writer;
--   GRANT SELECT, INSERT, UPDATE ON chat_search.watermark         TO chat_search_writer;
--   REVOKE ALL ON chat_search.outbox, chat_search.watermark FROM chat_search_reader;

-- ---------------------------------------------------------------------------
-- Columns the default HistoryDocumentSource reads (track-4 owned tables)
-- ---------------------------------------------------------------------------
-- chat_search.documents:
--   tenant_id, user_id, kind, record_id            (PK)
--   conversation_id, title, body, tags, project_id
--   is_archived, is_temporary
--   created_at, updated_at, expires_at, deleted_at
--   projection_version, content_hash, embedding_input_hash
--
-- chat_search.embeddings:
--   tenant_id, user_id, kind, record_id, space     (PK)
--   embedding_input_hash, embedding
--
-- The join is guarded on `embeddings.embedding_input_hash =
-- documents.embedding_input_hash` so a stale vector is never shipped to
-- ClickHouse alongside newer text.
