-- chat_search: an index for the reconciliation walk.
--
-- `scanProjectedKeys` pages the projection with
--   WHERE kind = $1 AND deleted_at IS NULL
--     AND (tenant_id, user_id, record_id) > (...)
--   ORDER BY tenant_id, user_id, record_id
-- which the primary key serves badly. The PK is
-- (tenant_id, user_id, kind, record_id), so `kind` sits *between* the columns
-- the resume compares: the equality can only be applied inside the index scan,
-- and the walk reads every kind's entries to return one kind's rows. On a
-- 200k-row table, one 1000-row page cost 1025 buffers and a heap fetch per row.
--
-- Leading with `kind` makes the same page a contiguous range, and carrying the
-- other three columns makes it index-only: the same page costs 10 buffers and
-- zero heap fetches. The hourly sweep does this once per 1000 rows for the whole
-- projection, so the difference compounds across the entire walk.
--
-- The partial predicate matches the query's `deleted_at IS NULL` exactly, which
-- is what keeps tombstoned rows out of the index rather than merely out of the
-- result.
--
-- Not CONCURRENTLY: the migration runner wraps each file in a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run inside one. The table is empty on every
-- deployment that runs this, because it is created two migrations earlier.
CREATE INDEX IF NOT EXISTS documents_reconcile_idx
  ON chat_search.documents (kind, tenant_id, user_id, record_id)
  WHERE deleted_at IS NULL;
