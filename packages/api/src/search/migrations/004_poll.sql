-- Safety-poll cursor.
--
-- The poll is the net under the event queue: post hooks are fire-and-forget, so
-- a pod that dies between the source write and the enqueue loses that event
-- permanently. The cursor is persisted rather than held in memory so a projector
-- restart resumes where the previous holder stopped instead of re-scanning the
-- whole collection or, worse, skipping the window it was mid-way through.
--
-- `(updated_at, record_id)` together are the keyset position. `record_id` is
-- part of it because application-generated timestamps collide constantly on bulk
-- writes, and a bare `updated_at > T` resume silently drops every row sharing
-- the boundary instant.

CREATE TABLE IF NOT EXISTS chat_search.poll_cursor (
  kind        text        PRIMARY KEY,
  updated_at  timestamptz,
  record_id   text,
  scanned_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_cursor_kind_check CHECK (kind IN ('message', 'conversation', 'shared-link'))
);

ALTER TABLE chat_search.poll_cursor OWNER TO chat_search_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_search.poll_cursor TO chat_search_writer;
REVOKE ALL ON chat_search.poll_cursor FROM chat_search_reader;
