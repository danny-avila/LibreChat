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
-- statements are the only thing that establishes the invariant, and they strip a
-- hand-granted SUPERUSER or BYPASSRLS back off rather than merely declining to
-- add it.
--
-- LOGIN is reasserted for the same reason: a pre-existing role left NOLOGIN by
-- whatever created it would otherwise be adopted in that state and never repaired
-- here. All three are login roles by definition — there is no state in which one
-- of them should be unable to connect.
--
-- This happens once per database, not on every run: the runner records each
-- file's checksum and skips the file thereafter, and editing an applied file is
-- rejected as drift rather than reapplied. So these are a repair performed at the
-- moment this migration is applied, not a standing control. What does run on
-- every provisioning run is `findRoleViolations` in `roles.ts`, which
-- `config/migrate-chat-search.js` calls last and fails the run over: it reads
-- pg_roles and this schema's catalog entries rather than trusting that this file
-- ever ran. Between two runs nothing is watching.
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

-- The same allowance for whatever a later migration creates, so that migration
-- does not carry a grant list of its own. `ALL TABLES` above is a snapshot of
-- what exists while this file runs; a default privilege is applied at CREATE
-- time to everything that comes after it.
--
-- Two grantors are named because two roles create objects here. Default
-- privileges key on the *creator*, not on the eventual owner: the provisioning
-- connection creates each table and hands it to chat_search_owner afterwards, and
-- an ownership transfer carries the existing grants over rather than dropping
-- them, so an entry for the provisioning connection is the one that covers the
-- migrations. The entry for chat_search_owner covers DDL applied as that role
-- directly. A third creator is covered by neither, and the symptom of that is the
-- projector being denied a write — never the reader gaining a row.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER, chat_search_owner IN SCHEMA chat_search
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chat_search_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER, chat_search_owner IN SCHEMA chat_search
  GRANT USAGE, SELECT ON SEQUENCES TO chat_search_writer;

-- Request reader: SELECT on the two serving tables and nothing else. The revoke
-- is blanket rather than a list of the tables the reader must stay off, because
-- the tables that matter are the ones a later migration introduces and a list
-- cannot name them. Nothing grants the reader a default privilege either, which
-- is what keeps those later tables closed to it without that migration issuing a
-- revoke: PostgreSQL grants a newly created relation to its owner and to nobody
-- else.
--
-- One case that does not cover: a default privilege belonging to the creating
-- role that was declared without `IN SCHEMA`, which applies in every schema. A
-- schema-scoped entry here does not cancel it — the two are merged, not
-- overridden — so no statement in this file can close it. That is why the
-- reader's allowance is re-derived from the live catalog by `findRoleViolations`
-- rather than inferred from these grants.
REVOKE ALL ON ALL TABLES IN SCHEMA chat_search FROM chat_search_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA chat_search FROM chat_search_reader;
GRANT SELECT ON chat_search.documents, chat_search.embeddings TO chat_search_reader;
