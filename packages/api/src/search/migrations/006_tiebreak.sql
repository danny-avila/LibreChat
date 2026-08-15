-- Adds the poll cursor's global tiebreak column.
--
-- `(updated_at, record_id)` alone is not a total order: record ids are only
-- unique together with user and tenant, so two users importing the same export
-- share a record id and an updated_at, and a page boundary inside that group
-- needs a globally unique tiebreak or the resume skips the group's unreturned
-- members. `mongo_id` — the source `_id`, as hex — is that tiebreak. Empty
-- means "no tiebreak recorded".
--
-- A separate file rather than an amendment of 004_poll.sql: that file's
-- checksum is recorded by every database the parent layer provisioned, and the
-- migration runner treats an applied file whose text changed as drift, not a
-- re-run — amending it in place would park projection on every upgraded
-- deployment.

ALTER TABLE chat_search.poll_cursor
  ADD COLUMN IF NOT EXISTS mongo_id text NOT NULL DEFAULT '';
