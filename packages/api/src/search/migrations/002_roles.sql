-- chat_search: three-role separation.
--   chat_search_owner   -- schema changes only (DDL), used interactively
--   chat_search_writer  -- projector / outbox consumer / sweep (CHAT_SEARCH_WRITER_URL)
--   chat_search_reader  -- request paths, forced RLS (CHAT_SEARCH_DATABASE_URL)
--
-- No role is SUPERUSER or BYPASSRLS. The bootstrap superuser is used by no
-- component. Passwords are never written here; the runner applies them from env.

-- Roles are cluster-wide, so two databases migrating concurrently can both pass
-- the existence check before either CREATE lands; swallowing duplicate_object
-- keeps that race idempotent instead of aborting the run.
DO $$
BEGIN
  BEGIN
    CREATE ROLE chat_search_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE ROLE chat_search_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    CREATE ROLE chat_search_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$$;

-- Enforce the invariant on every run: a hand-granted BYPASSRLS or SUPERUSER is
-- stripped back off the moment migrations are re-applied.
ALTER ROLE chat_search_owner  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE chat_search_writer NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE chat_search_reader NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

ALTER SCHEMA chat_search OWNER TO chat_search_owner;
-- The runner creates chat_search.migrations before any file runs, so it lands
-- owned by whoever invoked the migration. Hand it to the owner role here or the
-- separation gate legitimately fails on it.
ALTER TABLE chat_search.migrations OWNER TO chat_search_owner;
ALTER TABLE chat_search.documents  OWNER TO chat_search_owner;
ALTER TABLE chat_search.embeddings OWNER TO chat_search_owner;
ALTER TABLE chat_search.outbox     OWNER TO chat_search_owner;
ALTER TABLE chat_search.watermark  OWNER TO chat_search_owner;
ALTER TABLE chat_search.lease      OWNER TO chat_search_owner;
ALTER TABLE chat_search.failures   OWNER TO chat_search_owner;
ALTER SEQUENCE chat_search.projection_version_seq OWNER TO chat_search_owner;
ALTER SEQUENCE chat_search.outbox_outbox_seq_seq  OWNER TO chat_search_owner;

REVOKE ALL ON SCHEMA chat_search FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA chat_search FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA chat_search FROM PUBLIC;

GRANT USAGE ON SCHEMA chat_search TO chat_search_writer, chat_search_reader;

-- Projection writer: everything the projector, outbox consumer and sweep touch.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  chat_search.documents,
  chat_search.embeddings,
  chat_search.outbox,
  chat_search.watermark,
  chat_search.lease,
  chat_search.failures
  TO chat_search_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA chat_search TO chat_search_writer;

-- Request reader: SELECT on the two serving tables and nothing else. Explicit
-- REVOKEs make a re-run repair an accidental grant rather than merely not add one.
REVOKE ALL ON
  chat_search.outbox,
  chat_search.watermark,
  chat_search.lease,
  chat_search.failures,
  chat_search.migrations
  FROM chat_search_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA chat_search FROM chat_search_reader;
GRANT SELECT ON chat_search.documents, chat_search.embeddings TO chat_search_reader;
