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

-- The attributes are asserted here, not left to the CREATE ROLE statements above,
-- because those are skipped whenever the role already exists — which is the
-- ordinary case, not the exceptional one. `search/init/chat-search-roles.sh`
-- creates all three when the compose stack initialises, and so does any earlier
-- installation on the same server. On every one of those databases these three
-- statements are the only thing that actually establishes the invariant, and they
-- strip a hand-granted SUPERUSER or BYPASSRLS back off rather than merely
-- declining to add it.
--
-- LOGIN is reasserted for the same reason: a pre-existing role left NOLOGIN by
-- whatever created it would otherwise be adopted in that state and never repaired
-- here. All three are login roles by definition — there is no state in which one
-- of them should be unable to connect.
ALTER ROLE chat_search_owner  LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE chat_search_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE chat_search_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

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

-- Request reader: SELECT on the two serving tables and nothing else. The revoke
-- is a blanket one rather than a list of the tables the reader must stay off,
-- for the same reason the separation gate in `roles.ts` derives its check from
-- the schema: a list only repairs an accidental grant on a table someone
-- remembered to add to it, and the tables that matter are the ones a later
-- migration introduces. Sweeping everything and granting back the two is
-- self-maintaining, and it makes a re-run repair the grant rather than merely
-- not issue it.
REVOKE ALL ON ALL TABLES IN SCHEMA chat_search FROM chat_search_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA chat_search FROM chat_search_reader;
GRANT SELECT ON chat_search.documents, chat_search.embeddings TO chat_search_reader;
