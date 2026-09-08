# Conversation tag identity

Conversation membership uses `tagIds`, which reference existing `ConversationTag._id` values. The catalog's `tag` field is a mutable label. Renaming a tag does not rewrite conversations, change their activity timestamps, or reserve old names. A deleted ID is never reused, including when another tag takes its former name.

Browser mutations identify tags explicitly by ID. Existing name-based routes resolve the current name once when handling a request; an old name is not an alias for a renamed tag. Public conversation reads project names from the owned catalog. Counts derive from distinct committed membership. Missing or foreign IDs are omitted from that projection, and deletion and membership writes clean up deleted references.

Imports carry portable names and resolve them within the importing user's tenant. Source `tagIds` are ignored. JSON exports include names and omit database IDs.

If an import fails after creating catalog entries, those entries remain as empty bookmarks. Import compensation removes its conversations and messages but does not delete shared catalog identities: another request may already be using them. Retrying the import reuses the entries. Unneeded bookmarks can be deleted explicitly.

## Controlled cutover

Do not run old and new application writers concurrently. This is a coordinated upgrade, not a rolling migration with mixed-version writes.

1. Back up MongoDB. Stop every API server, worker, import process, and other conversation writer.
2. Build this version's packages using the locked dependencies.
3. With the normal `MONGO_URI` configured, validate the complete dataset:

   ```sh
   npm run migrate:conversation-tags -- --dry-run
   ```

4. Resolve any reported malformed owner/tenant/name, duplicate catalog identity, incomplete legacy rename, or invalid existing ID references before proceeding. Validation runs before any writes; the migration does not guess how to repair ambiguous data.
5. Apply the migration while writers remain stopped:

   ```sh
   npm run migrate:conversation-tags -- --apply
   ```

6. Run the dry-run again. `updated` and `createdTags` should both be zero. The apply command records completion only after membership writes and required indexes succeed. Application startup checks this completion marker; every existing database without it must run the migration, including databases with no tagged conversations. A fresh database with no conversations or tag catalog entries initializes automatically.
7. Start only the upgraded application servers and workers. If search is enabled, allow the existing index-sync process to populate the `conversation_tags` index. The search key must permit this index as well as conversations and messages. Rebuild search indexes before making a rollback available.

The migration preserves existing catalog IDs, descriptions and ordering. It creates owner/tenant-local catalog entries for names that exist only on conversations, deduplicates memberships, and preserves conversation timestamps and history. Writes are batched and retries reuse completed work. Do not resume legacy writers between migration retries.

## Search

The existing Meilisearch service indexes catalog labels separately, with `_id` as its primary key. Conversation search combines title/message results with MongoDB membership matching the returned tag IDs. MongoDB revalidates catalog ownership and existence, so a stale search hit cannot revive a deleted tag or join a newly created tag with the same name. Indexing remains asynchronous; allow index sync to finish after cutover or search-service downtime.

## Rollback

Stop all writers and restore the complete pre-upgrade MongoDB backup before starting the previous application version. This restores the original memberships and removes the migration-completion marker. Changes made after the backup will be lost. There is no reverse-migration script; legacy `tags` arrays become stale once upgraded writers change memberships or labels, so deploying an old binary against the upgraded database is not supported. Rebuild the old version's search indexes as part of rollback.
