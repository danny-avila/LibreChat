-- chat_search: row level security.
--
-- Scope comes from transaction-local GUCs (set_config(..., true)) that the
-- request path sets inside the same transaction as the query. The policies never
-- special-case '__SYSTEM__': in this codebase that sentinel is a query-time
-- wildcard on the Mongo side, and porting that semantic here would hand every
-- background context cross-tenant scope. ChatSearch rejects it before it ever
-- reaches a GUC.
--
-- nullif(..., '') keeps an empty GUC from matching anything: unset scope means
-- zero rows, never all rows.

ALTER TABLE chat_search.documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_search.documents  FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat_search.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_search.embeddings FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_reader_scope ON chat_search.documents;
CREATE POLICY documents_reader_scope ON chat_search.documents
  FOR SELECT
  TO chat_search_reader
  USING (
    tenant_id = nullif(current_setting('chat_search.tenant_id', true), '')
    AND user_id = nullif(current_setting('chat_search.user_id', true), '')
  );

DROP POLICY IF EXISTS embeddings_reader_scope ON chat_search.embeddings;
CREATE POLICY embeddings_reader_scope ON chat_search.embeddings
  FOR SELECT
  TO chat_search_reader
  USING (
    tenant_id = nullif(current_setting('chat_search.tenant_id', true), '')
    AND user_id = nullif(current_setting('chat_search.user_id', true), '')
  );

-- The projector is cross-tenant by construction and is never reachable from a
-- request. It is still a plain, non-BYPASSRLS role; its reach is a policy, not a
-- privilege escalation, so revoking the policy revokes the reach.
DROP POLICY IF EXISTS documents_writer_all ON chat_search.documents;
CREATE POLICY documents_writer_all ON chat_search.documents
  FOR ALL
  TO chat_search_writer
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS embeddings_writer_all ON chat_search.embeddings;
CREATE POLICY embeddings_writer_all ON chat_search.embeddings
  FOR ALL
  TO chat_search_writer
  USING (true)
  WITH CHECK (true);
