import { normalizeTenantId } from '@librechat/data-schemas';
import type {
  EmbeddingWrite,
  ProjectionSource,
  SearchClient,
  SearchRecordKey,
  SearchKind,
} from './types';
import { contentHash, embeddingInputHash, normalizeSearchText } from './hash';
import { POISON_FAILURE_LIMIT, RECORD_LOCK_CLASS } from './constants';
import { assertLeaseEpoch } from './lease';

/**
 * Every write in this module runs under two locks and one fence:
 *
 *  - the projector lease epoch (`assertLeaseEpoch`), so a deposed holder cannot
 *    commit;
 *  - a per-record transaction-scoped advisory lock, so two concurrent
 *    read-source-then-upsert cycles for the same record serialize rather than
 *    interleave — the source store has no per-record version to arbitrate with
 *    (`findOneAndUpdate` never bumps `__v`, no `optimisticConcurrency` is
 *    configured anywhere), so without this the older source state can win;
 *  - a version guard in the `ON CONFLICT` clause, so an out-of-order write loses
 *    even if both other mechanisms were somehow bypassed.
 */

/**
 * Unit separator: valid UTF-8 (unlike NUL, which PostgreSQL rejects outright in
 * a text parameter) and not a character that appears in a tenant, user, kind or
 * record identifier, so distinct keys cannot collide into one lock.
 */
const KEY_SEPARATOR = '\u001f';

function recordKeyString(key: SearchRecordKey): string {
  return [key.tenantId, key.userId, key.kind, key.recordId].join(KEY_SEPARATOR);
}

/**
 * Serializes all work for one record. Transaction-scoped, so it releases on
 * commit or rollback with no unlock to forget.
 */
export async function lockRecord(client: SearchClient, key: SearchRecordKey): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
    RECORD_LOCK_CLASS,
    recordKeyString(key),
  ]);
}

export type UpsertResult = Readonly<{
  applied: boolean;
  projectionVersion: number | null;
  embeddingInputHash: string;
  embeddingStale: boolean;
}>;

/**
 * Projects one source record and appends its outbox row **in the same
 * transaction**.
 *
 * The version is assigned here, by the lease holder, rather than read from the
 * source: Mongo/FerretDB records have no monotonic per-record version, so there
 * is nothing authoritative to copy. The outbox row carries that
 * projector-assigned version downstream, which is what lets ClickHouse replay
 * idempotently.
 *
 * The `WHERE excluded.projection_version > documents.projection_version` guard
 * makes a late-arriving older write a no-op rather than a regression — the CTE
 * returns no row, so no outbox entry is written either and downstream never sees
 * a version that lost.
 */
export async function upsertDocument(
  client: SearchClient,
  epoch: number,
  source: ProjectionSource,
  space: string,
): Promise<UpsertResult> {
  await assertLeaseEpoch(client, epoch);
  const key: SearchRecordKey = {
    tenantId: normalizeTenantId(source.tenantId),
    userId: source.userId,
    kind: source.kind,
    recordId: source.recordId,
  };
  await lockRecord(client, key);

  const nextContentHash = contentHash(source);
  const nextEmbeddingHash = embeddingInputHash(source, space);

  const { rows } = await client.query<{
    projection_version: string;
    embedding_stale: boolean;
  }>(
    `WITH v AS (SELECT nextval('chat_search.projection_version_seq') AS version),
     prior AS (
       SELECT embedding_input_hash FROM chat_search.documents
        WHERE tenant_id = $1 AND user_id = $2 AND kind = $3 AND record_id = $4
     ),
     ins AS (
       INSERT INTO chat_search.documents (
         tenant_id, user_id, kind, record_id, conversation_id, title, body, tags,
         is_archived, project_id, is_temporary, source_created_at, source_updated_at,
         expires_at, projection_version, content_hash, embedding_input_hash,
         deleted_at, updated_at
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14,
              v.version, $15, $16, NULL, now()
         FROM v
       ON CONFLICT (tenant_id, user_id, kind, record_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         title = excluded.title,
         body = excluded.body,
         tags = excluded.tags,
         is_archived = excluded.is_archived,
         project_id = excluded.project_id,
         is_temporary = excluded.is_temporary,
         source_created_at = excluded.source_created_at,
         source_updated_at = excluded.source_updated_at,
         expires_at = excluded.expires_at,
         projection_version = excluded.projection_version,
         content_hash = excluded.content_hash,
         embedding_input_hash = excluded.embedding_input_hash,
         deleted_at = NULL,
         updated_at = now()
       WHERE excluded.projection_version > chat_search.documents.projection_version
       RETURNING projection_version
     ),
     out AS (
       INSERT INTO chat_search.outbox
         (tenant_id, user_id, kind, record_id, projection_version, op)
       SELECT $1, $2, $3, $4, ins.projection_version, 'upsert' FROM ins
       RETURNING projection_version
     )
     SELECT out.projection_version,
            COALESCE((SELECT embedding_input_hash FROM prior), '') <> $16 AS embedding_stale
       FROM out`,
    [
      key.tenantId,
      key.userId,
      key.kind,
      key.recordId,
      source.conversationId,
      source.title,
      source.body,
      [...source.tags],
      source.isArchived,
      source.projectId,
      source.isTemporary,
      source.sourceCreatedAt,
      source.sourceUpdatedAt,
      source.expiresAt,
      nextContentHash,
      nextEmbeddingHash,
    ],
  );

  if (rows.length === 0) {
    return Object.freeze({
      applied: false,
      projectionVersion: null,
      embeddingInputHash: nextEmbeddingHash,
      embeddingStale: false,
    });
  }

  return Object.freeze({
    applied: true,
    projectionVersion: Number(rows[0].projection_version),
    embeddingInputHash: nextEmbeddingHash,
    embeddingStale: rows[0].embedding_stale,
  });
}

/**
 * Tombstones one record.
 *
 * Title and body are zeroed so deleted text does not persist in PostgreSQL for
 * the retention window, and the embeddings row is **deleted** rather than
 * zeroed: cosine distance against a zero vector is NaN, which does not reliably
 * sort last, so a zeroed vector could still surface.
 *
 * Note the deletion is explicit rather than riding the FK cascade. A tombstone
 * is an UPDATE of the documents row — the row survives so the ClickHouse
 * anti-join can still find it and reject a ghost candidate — and `ON DELETE
 * CASCADE` does not fire on UPDATE. The cascade covers only the hard-delete path
 * used by retention cleanup once the ClickHouse key has provably collapsed.
 *
 * `>=` rather than `>` is deliberate: tombstones win equal-version conflicts.
 */
export async function tombstoneDocument(
  client: SearchClient,
  epoch: number,
  key: SearchRecordKey,
  now: Date = new Date(),
): Promise<{ applied: boolean; projectionVersion: number | null }> {
  await assertLeaseEpoch(client, epoch);
  const scoped: SearchRecordKey = { ...key, tenantId: normalizeTenantId(key.tenantId) };
  await lockRecord(client, scoped);

  const { rows } = await client.query<{ projection_version: string }>(
    `WITH v AS (SELECT nextval('chat_search.projection_version_seq') AS version),
     upd AS (
       UPDATE chat_search.documents d
          SET title = '',
              body = '',
              tags = '{}'::text[],
              deleted_at = COALESCE(d.deleted_at, $5),
              projection_version = v.version,
              updated_at = now()
         FROM v
        WHERE d.tenant_id = $1 AND d.user_id = $2 AND d.kind = $3 AND d.record_id = $4
          AND v.version >= d.projection_version
       RETURNING d.projection_version
     ),
     del AS (
       DELETE FROM chat_search.embeddings
        WHERE tenant_id = $1 AND user_id = $2 AND kind = $3 AND record_id = $4
          AND EXISTS (SELECT 1 FROM upd)
     ),
     out AS (
       INSERT INTO chat_search.outbox
         (tenant_id, user_id, kind, record_id, projection_version, op)
       SELECT $1, $2, $3, $4, upd.projection_version, 'tombstone' FROM upd
       RETURNING projection_version
     )
     SELECT projection_version FROM out`,
    [scoped.tenantId, scoped.userId, scoped.kind, scoped.recordId, now],
  );

  if (rows.length === 0) {
    return { applied: false, projectionVersion: null };
  }
  return { applied: true, projectionVersion: Number(rows[0].projection_version) };
}

/**
 * Writes a vector only while the document's embedding-input hash still matches
 * the text that was actually embedded — a compare-and-set in one statement.
 *
 * **This has no production caller yet.** Nothing in the shipped stack embeds
 * documents, and no query embedder is injected either, so the vector arm is
 * inert end to end and every search reports `embedding-unconfigured` to say so.
 * The compare-and-set, the hash join on the read side and the tombstone deletion
 * are the hard parts and they are finished and tested; what remains is a worker
 * that consumes `upsertDocument`'s `embeddingStale` / `embeddingInputHash` and
 * calls this. Choosing an embedding provider, a batching and rate-limit policy
 * and a backfill strategy is a feature decision, not wiring, and is deliberately
 * not being made here — but the inertness is reported rather than hidden, so no
 * one can mistake this for a working semantic search.
 *
 * Without this, an edit that lands between "send text to the embedding service"
 * and "store the returned vector" leaves a vector describing text that no longer
 * exists, ranking the record by content it no longer has. The read side performs
 * the mirror check by joining on the hash, so a stale vector that somehow lands
 * is excluded from serving rather than merely deprioritized.
 */
export async function writeEmbedding(
  client: SearchClient,
  epoch: number,
  write: EmbeddingWrite,
): Promise<boolean> {
  await assertLeaseEpoch(client, epoch);
  const key: SearchRecordKey = { ...write, tenantId: normalizeTenantId(write.tenantId) };

  const result = await client.query(
    `INSERT INTO chat_search.embeddings (
       tenant_id, user_id, kind, record_id, space, embedding_input_hash, model,
       dimensions, normalized, formatter_version, embedding, updated_at
     )
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, now()
       FROM chat_search.documents d
      WHERE d.tenant_id = $1 AND d.user_id = $2 AND d.kind = $3 AND d.record_id = $4
        AND d.deleted_at IS NULL
        AND d.embedding_input_hash = $6
     ON CONFLICT (tenant_id, user_id, kind, record_id, space) DO UPDATE SET
       embedding_input_hash = excluded.embedding_input_hash,
       model = excluded.model,
       dimensions = excluded.dimensions,
       normalized = excluded.normalized,
       formatter_version = excluded.formatter_version,
       embedding = excluded.embedding,
       updated_at = now()`,
    [
      key.tenantId,
      key.userId,
      key.kind,
      key.recordId,
      write.space,
      write.embeddingInputHash,
      write.model,
      write.dimensions,
      write.normalized,
      write.formatterVersion,
      `[${write.embedding.join(',')}]`,
    ],
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Version-fenced reconciliation sweep over an explicit, bounded key set.
 *
 * Tombstones rows the source no longer has, but only those whose version is
 * below the counter snapshot taken at scan start. Without the fence, a record
 * upserted by the drain *after* the scan read its key looks missing, takes a
 * winning sweep tombstone, and stays buried until the next hourly run.
 *
 * Keys are passed in rather than derived from a scope plus an exclusion list:
 * the caller walks PostgreSQL in bounded windows and asks the source about
 * exactly those keys, so neither this statement's parameters nor the caller's
 * memory scale with the size of a user's history. Every key carries its own
 * tenant and user, so a sweep can never widen past the rows it was handed.
 */
export async function sweepMissing(
  client: SearchClient,
  epoch: number,
  kind: SearchKind,
  versionSnapshot: number,
  missing: readonly SearchRecordKey[],
  now: Date = new Date(),
): Promise<number> {
  if (missing.length === 0) {
    return 0;
  }
  await assertLeaseEpoch(client, epoch);
  const result = await client.query(
    `WITH v AS (SELECT nextval('chat_search.projection_version_seq') AS version),
     targets AS (
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
         AS t(tenant_id, user_id, record_id)
     ),
     victims AS (
       SELECT d.tenant_id, d.user_id, d.record_id
         FROM chat_search.documents d
         JOIN targets t
           ON t.tenant_id = d.tenant_id AND t.user_id = d.user_id AND t.record_id = d.record_id
        WHERE d.kind = $4
          AND d.deleted_at IS NULL
          AND d.projection_version < $5
        FOR UPDATE OF d
     ),
     upd AS (
       UPDATE chat_search.documents d
          SET title = '', body = '', tags = '{}'::text[],
              deleted_at = $6, projection_version = v.version, updated_at = now()
         FROM v, victims
        WHERE d.tenant_id = victims.tenant_id AND d.user_id = victims.user_id
          AND d.kind = $4 AND d.record_id = victims.record_id
       RETURNING d.tenant_id, d.user_id, d.record_id, d.projection_version
     ),
     del AS (
       DELETE FROM chat_search.embeddings e
        USING upd
        WHERE e.tenant_id = upd.tenant_id AND e.user_id = upd.user_id AND e.kind = $4
          AND e.record_id = upd.record_id
     )
     INSERT INTO chat_search.outbox
       (tenant_id, user_id, kind, record_id, projection_version, op)
     SELECT upd.tenant_id, upd.user_id, $4, upd.record_id, upd.projection_version, 'tombstone'
       FROM upd`,
    [
      missing.map((key) => normalizeTenantId(key.tenantId)),
      missing.map((key) => key.userId),
      missing.map((key) => key.recordId),
      kind,
      versionSnapshot,
      now,
    ],
  );
  return result.rowCount ?? 0;
}

/**
 * One live key window of the projection, ordered so the caller can resume.
 *
 * Reconciliation walks PostgreSQL rather than holding the source keyspace in
 * memory, so this is the page primitive that keeps the whole sweep bounded.
 */
export async function scanProjectedKeys(
  client: SearchClient,
  kind: SearchKind,
  after: SearchRecordKey | null,
  limit: number,
): Promise<readonly SearchRecordKey[]> {
  /**
   * Two statements rather than one with an `OR`, so the keyset stays
   * index-driven. `kind` stays an equality and the row comparison covers the
   * remaining three columns: that is the shape `documents_reconcile_idx`
   * (kind, tenant_id, user_id, record_id) serves as a contiguous index-only
   * range. Folding `kind` into the row comparison instead measures worse — the
   * planner can no longer treat it as a leading equality.
   */
  const resume = after
    ? 'AND (tenant_id, user_id, record_id) > ($3::text, $4::text, $5::text)'
    : '';
  const values: unknown[] = after
    ? [kind, limit, normalizeTenantId(after.tenantId), after.userId, after.recordId]
    : [kind, limit];

  const { rows } = await client.query<{
    tenant_id: string;
    user_id: string;
    record_id: string;
  }>(
    `SELECT tenant_id, user_id, record_id
       FROM chat_search.documents
      WHERE kind = $1
        AND deleted_at IS NULL
        ${resume}
      ORDER BY tenant_id, user_id, record_id
      LIMIT $2`,
    values,
  );
  return rows.map((row) => ({
    tenantId: row.tenant_id,
    userId: row.user_id,
    kind,
    recordId: row.record_id,
  }));
}

/**
 * Of the keys handed in, the ones PostgreSQL is not currently serving.
 *
 * The reconciliation sweep only ever removes; this is the other direction, and
 * it is what makes "the sweep covers it" true for writes that never produced a
 * usable event — bulk imports above all, whose historic `updatedAt` values sort
 * behind the forward poll cursor forever.
 */
export async function missingFromProjection(
  client: SearchClient,
  kind: SearchKind,
  keys: readonly SearchRecordKey[],
): Promise<readonly SearchRecordKey[]> {
  if (keys.length === 0) {
    return [];
  }
  const { rows } = await client.query<{
    tenant_id: string;
    user_id: string;
    record_id: string;
  }>(
    `SELECT t.tenant_id, t.user_id, t.record_id
       FROM unnest($1::text[], $2::text[], $3::text[]) AS t(tenant_id, user_id, record_id)
       LEFT JOIN chat_search.documents d
         ON d.tenant_id = t.tenant_id AND d.user_id = t.user_id
        AND d.kind = $4 AND d.record_id = t.record_id
      WHERE d.record_id IS NULL OR d.deleted_at IS NOT NULL`,
    [
      keys.map((key) => normalizeTenantId(key.tenantId)),
      keys.map((key) => key.userId),
      keys.map((key) => key.recordId),
      kind,
    ],
  );
  return rows.map((row) => ({
    tenantId: row.tenant_id,
    userId: row.user_id,
    kind,
    recordId: row.record_id,
  }));
}

/**
 * The version every row projected after this point will exceed.
 *
 * `is_called` matters: an untouched sequence reports `last_value = START WITH`
 * while the *next* `nextval` still returns that same value, so a bare
 * `last_value + 1` would sit above the first record ever written and make the
 * sweep treat it as older than the snapshot.
 */
export async function currentVersionSnapshot(client: SearchClient): Promise<number> {
  const { rows } = await client.query<{ version: string }>(
    `SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END AS version
       FROM chat_search.projection_version_seq`,
  );
  return Number(rows[0].version);
}

/**
 * Poison-row policy: a record failing projection five consecutive times is
 * quarantined and alerted on, never retried forever. One malformed document
 * must not stall the queue behind it.
 */
export async function recordFailure(
  client: SearchClient,
  key: SearchRecordKey,
  error: unknown,
): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const { rows } = await client.query<{ quarantined: boolean }>(
    `INSERT INTO chat_search.failures (tenant_id, user_id, kind, record_id, failures, last_error, quarantined)
     VALUES ($1, $2, $3, $4, 1, $5, false)
     ON CONFLICT (tenant_id, user_id, kind, record_id) DO UPDATE SET
       failures = chat_search.failures.failures + 1,
       last_error = excluded.last_error,
       quarantined = chat_search.failures.failures + 1 >= $6,
       updated_at = now()
     RETURNING quarantined`,
    [
      normalizeTenantId(key.tenantId),
      key.userId,
      key.kind,
      key.recordId,
      /** Truncated: a driver error can embed a whole statement, and statements can embed text. */
      normalizeSearchText(message).slice(0, 500),
      POISON_FAILURE_LIMIT,
    ],
  );
  return rows[0]?.quarantined === true;
}

export async function clearFailure(client: SearchClient, key: SearchRecordKey): Promise<void> {
  await client.query(
    `DELETE FROM chat_search.failures
      WHERE tenant_id = $1 AND user_id = $2 AND kind = $3 AND record_id = $4`,
    [normalizeTenantId(key.tenantId), key.userId, key.kind, key.recordId],
  );
}

export async function quarantinedKeys(
  client: SearchClient,
  keys: readonly SearchRecordKey[],
): Promise<ReadonlySet<string>> {
  if (keys.length === 0) {
    return new Set();
  }
  const { rows } = await client.query<{
    tenant_id: string;
    user_id: string;
    kind: SearchKind;
    record_id: string;
  }>(
    `SELECT tenant_id, user_id, kind, record_id
       FROM chat_search.failures
      WHERE quarantined
        AND (tenant_id, user_id, kind, record_id) IN (
          SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
        )`,
    [
      keys.map((k) => normalizeTenantId(k.tenantId)),
      keys.map((k) => k.userId),
      keys.map((k) => k.kind),
      keys.map((k) => k.recordId),
    ],
  );
  return new Set(
    rows.map((row) =>
      recordKeyString({
        tenantId: row.tenant_id,
        userId: row.user_id,
        kind: row.kind,
        recordId: row.record_id,
      }),
    ),
  );
}

export { recordKeyString };
