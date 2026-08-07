import type { ProjectionSource, SearchPool, SearchRecordKey } from './types';
import type { Lease } from './lease';
import {
  recordKeyString,
  clearFailure,
  currentVersionSnapshot,
  quarantinedKeys,
  missingFromProjection,
  recordFailure,
  scanProjectedKeys,
  sweepMissing,
  tombstoneDocument,
  upsertDocument,
  writeEmbedding,
} from './writer';
import { DEFAULT_EMBEDDING_SPACE, FORMATTER_VERSION, RECORD_LOCK_CLASS } from './constants';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { acquireLease, LeaseLostError } from './lease';
import { withTransaction } from './pool';

const DB_NAME = 'writer';

const KEY: SearchRecordKey = {
  tenantId: '__BASE__',
  userId: 'alice',
  kind: 'message',
  recordId: 'm1',
};

function sourceOf(overrides: Partial<ProjectionSource> = {}): ProjectionSource {
  return {
    ...KEY,
    conversationId: 'c1',
    title: 'Quarterly report',
    body: 'revenue grew in the third quarter',
    tags: [],
    isArchived: false,
    projectId: null,
    isTemporary: false,
    sourceCreatedAt: new Date('2026-01-01T00:00:00Z'),
    sourceUpdatedAt: new Date('2026-01-02T00:00:00Z'),
    expiresAt: null,
    unfinished: false,
    ...overrides,
  };
}

const vector = (fill: number) => new Array(1024).fill(fill);

describePg('projector write path', () => {
  let pool: SearchPool;
  let lease: Lease;

  beforeAll(async () => {
    pool = await migrateFresh(DB_NAME);
  }, 60_000);

  afterAll(async () => {
    await lease?.release();
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE chat_search.documents, chat_search.outbox, chat_search.failures CASCADE',
    );
    await lease?.release();
    const acquired = await acquireLease(pool, 'test-holder');
    if (!acquired) {
      throw new Error('failed to acquire the projector lease for the test');
    }
    lease = acquired;
  });

  describe('lease', () => {
    it('admits exactly one holder', async () => {
      const second = await acquireLease(pool, 'other-holder');
      expect(second).toBeNull();
    });

    it('bumps the epoch on each acquisition so a stale token is detectable', async () => {
      const first = lease.epoch;
      await lease.release();
      const reacquired = await acquireLease(pool, 'test-holder');
      expect(reacquired).not.toBeNull();
      lease = reacquired as Lease;
      expect(lease.epoch).toBe(first + 1);
    });

    it('renews while held and reports failure once superseded', async () => {
      expect(await lease.renew()).toBe(true);
      await pool.query("UPDATE chat_search.lease SET epoch = epoch + 1 WHERE name = 'projector'");
      expect(await lease.renew()).toBe(false);
    });

    /**
     * A partitioned holder may not know it lost the lease. The advisory lock
     * alone cannot stop its in-flight transaction, so the epoch fence must.
     */
    it('rejects a write from a deposed holder', async () => {
      const staleEpoch = lease.epoch;
      await pool.query("UPDATE chat_search.lease SET epoch = epoch + 1 WHERE name = 'projector'");

      await expect(
        withTransaction(pool, (client) =>
          upsertDocument(client, staleEpoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
        ),
      ).rejects.toThrow(LeaseLostError);

      const { rows } = await pool.query('SELECT 1 FROM chat_search.documents');
      expect(rows).toHaveLength(0);
    });
  });

  describe('upsert', () => {
    it('writes the document and its outbox row in one transaction', async () => {
      const result = await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      expect(result.applied).toBe(true);

      const { rows: docs } = await pool.query<{ projection_version: string; title: string }>(
        'SELECT projection_version, title FROM chat_search.documents',
      );
      const { rows: outbox } = await pool.query<{ projection_version: string; op: string }>(
        'SELECT projection_version, op FROM chat_search.outbox',
      );
      expect(docs).toHaveLength(1);
      expect(outbox).toHaveLength(1);
      expect(outbox[0].op).toBe('upsert');
      expect(outbox[0].projection_version).toBe(docs[0].projection_version);
      expect(Number(docs[0].projection_version)).toBe(result.projectionVersion);
    });

    it('populates the generated tsvector so the FTS arm can match immediately', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      const { rows } = await pool.query<{ hit: boolean }>(
        `SELECT search_vector @@ to_tsquery('simple', 'revenue') AS hit
           FROM chat_search.documents`,
      );
      expect(rows[0].hit).toBe(true);
    });

    it('lets a newer projection win and leaves the older one a no-op', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf({ title: 'first' }), DEFAULT_EMBEDDING_SPACE),
      );
      const second = await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf({ title: 'second' }), DEFAULT_EMBEDDING_SPACE),
      );
      expect(second.applied).toBe(true);

      const { rows } = await pool.query<{ title: string }>(
        'SELECT title FROM chat_search.documents',
      );
      expect(rows[0].title).toBe('second');
      const { rows: outbox } = await pool.query('SELECT 1 FROM chat_search.outbox');
      expect(outbox).toHaveLength(2);
    });

    it('reports an embedding-input change only when the embedded text changed', async () => {
      const first = await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      expect(first.embeddingStale).toBe(true);

      /** An archive toggle changes the content hash but not the embedded text. */
      const archived = await withTransaction(pool, (client) =>
        upsertDocument(
          client,
          lease.epoch,
          sourceOf({ isArchived: true }),
          DEFAULT_EMBEDDING_SPACE,
        ),
      );
      expect(archived.embeddingStale).toBe(false);

      const edited = await withTransaction(pool, (client) =>
        upsertDocument(
          client,
          lease.epoch,
          sourceOf({ body: 'rewritten' }),
          DEFAULT_EMBEDDING_SPACE,
        ),
      );
      expect(edited.embeddingStale).toBe(true);
    });

    it('resurrects a tombstoned row when the source reappears', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );

      const { rows } = await pool.query<{ deleted_at: Date | null; title: string }>(
        'SELECT deleted_at, title FROM chat_search.documents',
      );
      expect(rows[0].deleted_at).toBeNull();
      expect(rows[0].title).toBe('Quarterly report');
    });
  });

  describe('tombstone', () => {
    beforeEach(async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
    });

    it('zeroes the searchable text rather than retaining it', async () => {
      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));

      const { rows } = await pool.query<{ title: string; body: string; deleted_at: Date }>(
        'SELECT title, body, deleted_at FROM chat_search.documents',
      );
      expect(rows[0].title).toBe('');
      expect(rows[0].body).toBe('');
      expect(rows[0].deleted_at).not.toBeNull();
    });

    /**
     * Deleting the row rather than zeroing the vector: cosine distance against a
     * zero vector is NaN and does not reliably sort last.
     */
    it('deletes the embeddings row', async () => {
      const hash = await currentEmbeddingHash(pool);
      await withTransaction(pool, (client) =>
        writeEmbedding(client, lease.epoch, {
          ...KEY,
          space: DEFAULT_EMBEDDING_SPACE,
          embeddingInputHash: hash,
          model: 'qwen3-embedding-8b',
          dimensions: 1024,
          normalized: true,
          formatterVersion: FORMATTER_VERSION,
          embedding: vector(0.01),
        }),
      );
      expect((await pool.query('SELECT 1 FROM chat_search.embeddings')).rows).toHaveLength(1);

      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));

      expect((await pool.query('SELECT 1 FROM chat_search.embeddings')).rows).toHaveLength(0);
    });

    it('emits a tombstone outbox row carrying the new version', async () => {
      const result = await withTransaction(pool, (client) =>
        tombstoneDocument(client, lease.epoch, KEY),
      );
      const { rows } = await pool.query<{ op: string; projection_version: string }>(
        'SELECT op, projection_version FROM chat_search.outbox ORDER BY outbox_seq DESC LIMIT 1',
      );
      expect(rows[0].op).toBe('tombstone');
      expect(Number(rows[0].projection_version)).toBe(result.projectionVersion);
    });

    /**
     * A delete racing an in-flight upsert: the per-record advisory lock forces
     * them to serialize, so the tombstone cannot be silently overwritten by an
     * upsert that read the source before the delete landed.
     */
    it('serializes against a concurrent upsert for the same record', async () => {
      const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
        RECORD_LOCK_CLASS,
        recordKeyString(KEY),
      ]);

      let finished = false;
      const contended = withTransaction(pool, (client) =>
        tombstoneDocument(client, lease.epoch, KEY),
      ).then((result) => {
        finished = true;
        return result;
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(finished).toBe(false);

      await blocker.query('COMMIT');
      blocker.release();

      const result = await contended;
      expect(result.applied).toBe(true);
    });
  });

  describe('embedding compare-and-set', () => {
    beforeEach(async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
    });

    it('accepts a vector whose input hash still matches the document', async () => {
      const hash = await currentEmbeddingHash(pool);
      const written = await withTransaction(pool, (client) =>
        writeEmbedding(client, lease.epoch, {
          ...KEY,
          space: DEFAULT_EMBEDDING_SPACE,
          embeddingInputHash: hash,
          model: 'qwen3-embedding-8b',
          dimensions: 1024,
          normalized: true,
          formatterVersion: FORMATTER_VERSION,
          embedding: vector(0.01),
        }),
      );
      expect(written).toBe(true);
    });

    /**
     * The record was edited between "send text to the embedding service" and
     * "store the returned vector". The vector describes text that no longer
     * exists and must not attach.
     */
    it('rejects a vector for text that was edited mid-flight', async () => {
      const staleHash = await currentEmbeddingHash(pool);
      await withTransaction(pool, (client) =>
        upsertDocument(
          client,
          lease.epoch,
          sourceOf({ body: 'completely different text' }),
          DEFAULT_EMBEDDING_SPACE,
        ),
      );

      const written = await withTransaction(pool, (client) =>
        writeEmbedding(client, lease.epoch, {
          ...KEY,
          space: DEFAULT_EMBEDDING_SPACE,
          embeddingInputHash: staleHash,
          model: 'qwen3-embedding-8b',
          dimensions: 1024,
          normalized: true,
          formatterVersion: FORMATTER_VERSION,
          embedding: vector(0.02),
        }),
      );

      expect(written).toBe(false);
      expect((await pool.query('SELECT 1 FROM chat_search.embeddings')).rows).toHaveLength(0);
    });

    it('rejects a vector for a tombstoned record', async () => {
      const hash = await currentEmbeddingHash(pool);
      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));

      const written = await withTransaction(pool, (client) =>
        writeEmbedding(client, lease.epoch, {
          ...KEY,
          space: DEFAULT_EMBEDDING_SPACE,
          embeddingInputHash: hash,
          model: 'qwen3-embedding-8b',
          dimensions: 1024,
          normalized: true,
          formatterVersion: FORMATTER_VERSION,
          embedding: vector(0.03),
        }),
      );
      expect(written).toBe(false);
    });
  });

  describe('version-fenced sweep', () => {
    it('tombstones a row the source scan did not see', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      const snapshot = await withTransaction(pool, (client) => currentVersionSnapshot(client));

      const swept = await withTransaction(pool, (client) =>
        sweepMissing(client, lease.epoch, 'message', snapshot, [KEY]),
      );

      expect(swept).toBe(1);
      const { rows } = await pool.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM chat_search.documents',
      );
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('leaves a row the scan did see', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      const snapshot = await withTransaction(pool, (client) => currentVersionSnapshot(client));

      const swept = await withTransaction(pool, (client) =>
        sweepMissing(client, lease.epoch, 'message', snapshot, []),
      );

      expect(swept).toBe(0);
    });

    /**
     * The buried-write race: a record projected *after* the scan read its key
     * looks missing. Without the version fence it takes a winning sweep
     * tombstone and stays buried until the next hourly run.
     */
    it('does not bury a write that landed after the scan started', async () => {
      const snapshot = await withTransaction(pool, (client) => currentVersionSnapshot(client));

      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );

      const swept = await withTransaction(pool, (client) =>
        sweepMissing(client, lease.epoch, 'message', snapshot, [KEY]),
      );

      expect(swept).toBe(0);
      const { rows } = await pool.query<{ deleted_at: Date | null; title: string }>(
        'SELECT deleted_at, title FROM chat_search.documents',
      );
      expect(rows[0].deleted_at).toBeNull();
      expect(rows[0].title).toBe('Quarterly report');
    });

    /**
     * The very first record ever projected. An untouched sequence reports
     * `last_value = 1` while `nextval` still returns 1, so a snapshot of
     * `last_value + 1` sits *above* that record and makes the sweep treat a row
     * written after the snapshot as older than it.
     */
    it('does not bury the first record ever written on a fresh sequence', async () => {
      await pool.query("SELECT setval('chat_search.projection_version_seq', 1, false)");
      const snapshot = await withTransaction(pool, (client) => currentVersionSnapshot(client));

      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );

      const swept = await withTransaction(pool, (client) =>
        sweepMissing(client, lease.epoch, 'message', snapshot, [KEY]),
      );

      expect(swept).toBe(0);
      const { rows } = await pool.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM chat_search.documents',
      );
      expect(rows[0].deleted_at).toBeNull();
    });

    it('never reaches another user in the same tenant', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      const snapshot = await withTransaction(pool, (client) => currentVersionSnapshot(client));

      const swept = await withTransaction(pool, (client) =>
        sweepMissing(client, lease.epoch, 'message', snapshot, [{ ...KEY, userId: 'bob' }]),
      );

      expect(swept).toBe(0);
      const { rows } = await pool.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM chat_search.documents',
      );
      expect(rows[0].deleted_at).toBeNull();
    });

    /**
     * The reconciliation walk is driven from PostgreSQL rather than from an
     * in-memory copy of the source keyspace, so the key window is the primitive
     * that keeps the whole sweep bounded.
     */
    it('walks the live projection in resumable key windows', async () => {
      for (const recordId of ['m1', 'm2', 'm3']) {
        await withTransaction(pool, (client) =>
          upsertDocument(client, lease.epoch, sourceOf({ recordId }), DEFAULT_EMBEDDING_SPACE),
        );
      }

      const first = await withTransaction(pool, (client) =>
        scanProjectedKeys(client, 'message', null, 2),
      );
      expect(first.map((key) => key.recordId)).toEqual(['m1', 'm2']);

      const second = await withTransaction(pool, (client) =>
        scanProjectedKeys(client, 'message', first[first.length - 1], 2),
      );
      expect(second.map((key) => key.recordId)).toEqual(['m3']);
    });

    it('omits tombstoned rows from the key window', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));

      const window = await withTransaction(pool, (client) =>
        scanProjectedKeys(client, 'message', null, 10),
      );

      expect(window).toEqual([]);
    });
  });

  describe('missing-from-projection lookup', () => {
    it('reports keys PostgreSQL has never seen', async () => {
      const missing = await withTransaction(pool, (client) =>
        missingFromProjection(client, 'message', [KEY]),
      );

      expect(missing).toEqual([KEY]);
    });

    it('reports a key whose row is tombstoned', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );
      await withTransaction(pool, (client) => tombstoneDocument(client, lease.epoch, KEY));

      const missing = await withTransaction(pool, (client) =>
        missingFromProjection(client, 'message', [KEY]),
      );

      expect(missing).toEqual([KEY]);
    });

    it('reports nothing for a key already serving', async () => {
      await withTransaction(pool, (client) =>
        upsertDocument(client, lease.epoch, sourceOf(), DEFAULT_EMBEDDING_SPACE),
      );

      const missing = await withTransaction(pool, (client) =>
        missingFromProjection(client, 'message', [KEY]),
      );

      expect(missing).toEqual([]);
    });
  });

  describe('poison-row quarantine', () => {
    it('quarantines only after the failure limit is reached', async () => {
      const results: boolean[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        results.push(
          await withTransaction(pool, (client) => recordFailure(client, KEY, new Error('boom'))),
        );
      }
      expect(results).toEqual([false, false, false, false, true]);
    });

    it('reports quarantined keys so the drain can skip them', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await withTransaction(pool, (client) => recordFailure(client, KEY, new Error('boom')));
      }
      const quarantined = await withTransaction(pool, (client) => quarantinedKeys(client, [KEY]));
      expect(quarantined.size).toBe(1);
    });

    it('clears the counter after a successful projection', async () => {
      await withTransaction(pool, (client) => recordFailure(client, KEY, new Error('boom')));
      await withTransaction(pool, (client) => clearFailure(client, KEY));
      const { rows } = await pool.query('SELECT 1 FROM chat_search.failures');
      expect(rows).toHaveLength(0);
    });

    it('does not store raw record text in the failure row', async () => {
      await withTransaction(pool, (client) =>
        recordFailure(client, KEY, new Error('x'.repeat(2000))),
      );
      const { rows } = await pool.query<{ last_error: string }>(
        'SELECT last_error FROM chat_search.failures',
      );
      expect(rows[0].last_error.length).toBeLessThanOrEqual(500);
    });
  });
});

async function currentEmbeddingHash(pool: SearchPool): Promise<string> {
  const { rows } = await pool.query<{ embedding_input_hash: string }>(
    'SELECT embedding_input_hash FROM chat_search.documents LIMIT 1',
  );
  return rows[0].embedding_input_hash;
}
