import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createModels,
  dedupeSearchEvents,
  deleteSearchEvents,
  enqueueSearchEvents,
  readSearchEvents,
} from '@librechat/data-schemas';
import type { SearchPool } from './types';
import { describePg, dropIsolatedDatabase, migrateFresh } from './pg.helper';
import { quarantinedKeys, recordFailure } from './writer';
import { createMongoSourceReader } from './source';
import { withTransaction } from './pool';
import { Projector } from './projector';

const DB_NAME = 'projector';

/** Polls an async condition a background pass satisfies on its own schedule. */
async function waitForAsync(condition: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition was never met');
}

/** Polls a condition the standby loop satisfies on its own schedule. */
async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition was never met');
}

type Models = ReturnType<typeof createModels>;

/**
 * The projector against both real stores at once: MongoDB for the source and the
 * event queue, PostgreSQL for the projection. Every layer it has — the drain,
 * the safety poll, the reconciliation sweep — exists because the layer above it
 * is structurally blind to some class of write, so each is exercised against the
 * write class that motivates it.
 */
describePg('projector', () => {
  let pool: SearchPool;
  let mongoServer: MongoMemoryServer;
  let models: Models;
  let projector: Projector;
  const OLD_ENV = process.env;

  beforeAll(async () => {
    process.env = { ...OLD_ENV, CHAT_SEARCH_ENABLED: 'true' };
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = createModels(mongoose);
    pool = await migrateFresh(DB_NAME);
  }, 120_000);

  afterAll(async () => {
    await projector?.stop();
    await mongoose.disconnect();
    await mongoServer.stop();
    if (pool) {
      await dropIsolatedDatabase(pool, DB_NAME);
    }
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    await projector?.stop();
    /**
     * Sequential, and the queue last: `deleteMany` fires the seam's tombstone
     * hook, so clearing the queue in parallel with the collections lets those
     * tombstones land after the queue was emptied.
     */
    await models.Message.deleteMany({});
    await models.Conversation.deleteMany({});
    await models.SharedLink.deleteMany({});
    await models.SearchEvent.deleteMany({});
    await pool.query(
      'TRUNCATE chat_search.documents, chat_search.outbox, chat_search.failures, chat_search.poll_cursor CASCADE',
    );
    projector = new Projector(
      { pool, mongoose, source: createMongoSourceReader(mongoose), startupCatchUp: false },
      {
        readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
        deleteSearchEvents: (ids) => deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
        dedupeSearchEvents,
      },
    );
    if (!(await projector.start())) {
      throw new Error('failed to acquire the projector lease for the test');
    }
  });

  const projectedTitles = async () =>
    (
      await pool.query<{ title: string }>(
        "SELECT title FROM chat_search.documents WHERE kind = 'conversation' ORDER BY record_id",
      )
    ).rows.map((row) => row.title);

  const outboxCount = async () =>
    Number(
      (await pool.query<{ count: string }>('SELECT count(*) AS count FROM chat_search.outbox'))
        .rows[0].count,
    );

  const projected = async () =>
    (
      await pool.query<{ record_id: string; title: string; body: string; deleted_at: Date | null }>(
        'SELECT record_id, title, body, deleted_at FROM chat_search.documents ORDER BY record_id',
      )
    ).rows;

  describe('event drain', () => {
    it('projects a message the queue names', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'alice',
        text: 'quarterly revenue projection',
        isCreatedByUser: true,
      });

      const outcome = await projector.drain();

      expect(outcome.projected).toBe(1);
      const rows = await projected();
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe('quarterly revenue projection');
    });

    it('flattens a content array the way every sink does', async () => {
      await models.Message.create({
        messageId: 'm-parts',
        conversationId: 'c1',
        user: 'alice',
        content: [{ type: 'text', text: 'flattened body' }],
        isCreatedByUser: false,
      });

      await projector.drain();

      const rows = await projected();
      expect(rows[0].body).toBe('flattened body');
    });

    it('empties the queue it consumed', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });

      await projector.drain();

      expect(await models.SearchEvent.countDocuments({})).toBe(0);
    });

    /** Duplicate events are free because the projector re-reads the source. */
    it('collapses repeated events for one record into a single projection', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });
      await enqueueSearchEvents(mongoose, [
        { tenantId: null, userId: 'alice', kind: 'message', recordId: 'm1', op: 'upsert' },
        { tenantId: null, userId: 'alice', kind: 'message', recordId: 'm1', op: 'upsert' },
      ]);

      const outcome = await projector.drain();

      expect(outcome.projected).toBe(1);
      const { rows } = await pool.query('SELECT 1 FROM chat_search.outbox');
      expect(rows).toHaveLength(1);
    });

    it('tombstones a record the source no longer has', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });
      await projector.drain();

      await models.Message.deleteMany({ messageId: 'm1' });
      const outcome = await projector.drain();

      expect(outcome.tombstoned).toBe(1);
      const rows = await projected();
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].body).toBe('');
    });

    it('never projects an unfinished assistant row, and projects it once finalized', async () => {
      await models.Message.create({
        messageId: 'm-run',
        conversationId: 'c1',
        user: 'alice',
        text: 'partial',
        unfinished: true,
        isCreatedByUser: false,
      });
      await enqueueSearchEvents(mongoose, [
        { tenantId: null, userId: 'alice', kind: 'message', recordId: 'm-run', op: 'upsert' },
      ]);

      await projector.drain();
      expect(await projected()).toHaveLength(0);

      /** `saveMessage` finalizes with `new: true`, so the hook sees the final row. */
      await models.Message.findOneAndUpdate(
        { messageId: 'm-run' },
        { $set: { unfinished: false, text: 'final answer' } },
        { new: true },
      );
      await projector.drain();

      const rows = await projected();
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe('final answer');
    });

    /**
     * A caller that finalizes with Mongoose's default `new: false` hands the hook
     * the *pre-update* document, whose `unfinished` is still true, so the seam
     * skips it. Freshness suffers; correctness does not — the safety poll sees
     * the changed `updatedAt` and projects the finalized row.
     */
    it('still recovers a finalize whose hook saw the pre-update document', async () => {
      await models.Message.create({
        messageId: 'm-stale-hook',
        conversationId: 'c1',
        user: 'alice',
        text: 'partial',
        unfinished: true,
        isCreatedByUser: false,
      });
      await models.Message.findOneAndUpdate(
        { messageId: 'm-stale-hook' },
        { $set: { unfinished: false, text: 'finalized late' } },
      );
      await models.SearchEvent.deleteMany({});

      await projector.drain();
      expect(await projected()).toHaveLength(0);

      await projector.safetyPoll();

      const rows = await projected();
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe('finalized late');
    });

    /**
     * A recycled record id must not project one principal's content under
     * another's scope, so the source read is filtered by the event's owner.
     */
    it('ignores a source row whose owner does not match the event', async () => {
      await models.Message.create({
        messageId: 'm-shared',
        conversationId: 'c1',
        user: 'bob',
        text: "bob's private text",
        isCreatedByUser: true,
      });
      await models.SearchEvent.deleteMany({});
      await enqueueSearchEvents(mongoose, [
        { tenantId: null, userId: 'alice', kind: 'message', recordId: 'm-shared', op: 'upsert' },
      ]);

      const outcome = await projector.drain();

      expect(outcome.projected).toBe(0);
      const { rows } = await pool.query(
        "SELECT 1 FROM chat_search.documents WHERE user_id = 'alice'",
      );
      expect(rows).toHaveLength(0);
    });

    it('quarantines a record that fails five times instead of stalling the queue', async () => {
      await models.Message.create({
        messageId: 'm-poison',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });
      await models.SearchEvent.deleteMany({});

      for (let attempt = 0; attempt < 5; attempt++) {
        await pool.query(
          `INSERT INTO chat_search.failures (tenant_id, user_id, kind, record_id, failures, quarantined)
           VALUES ('__BASE__', 'alice', 'message', 'm-poison', 5, true)
           ON CONFLICT (tenant_id, user_id, kind, record_id) DO UPDATE SET quarantined = true`,
        );
      }
      await enqueueSearchEvents(mongoose, [
        { tenantId: null, userId: 'alice', kind: 'message', recordId: 'm-poison', op: 'upsert' },
      ]);

      const outcome = await projector.drain();

      expect(outcome.projected).toBe(0);
      expect(outcome.skipped).toBe(1);
      expect(await models.SearchEvent.countDocuments({})).toBe(0);
    });
  });

  describe('safety poll', () => {
    /**
     * The write class the queue structurally cannot see: `bulkWrite` skips
     * Mongoose middleware, so no hook fires and no event is ever enqueued.
     */
    it('recovers a bulk write that emitted no event', async () => {
      await models.Conversation.bulkWrite([
        {
          updateOne: {
            filter: { conversationId: 'c-bulk', user: 'alice' },
            update: {
              $set: {
                conversationId: 'c-bulk',
                user: 'alice',
                title: 'Bulk imported',
                endpoint: 'openAI',
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        },
      ]);
      expect(await models.SearchEvent.countDocuments({})).toBe(0);

      const count = await projector.safetyPoll();

      expect(count).toBeGreaterThanOrEqual(1);
      const rows = await projected();
      expect(rows.map((row) => row.record_id)).toContain('c-bulk');
    });

    /** A dropped event — pod killed between the source write and the enqueue. */
    it('recovers a record whose event was lost', async () => {
      await models.Message.create({
        messageId: 'm-lost',
        conversationId: 'c1',
        user: 'alice',
        text: 'never enqueued',
        isCreatedByUser: true,
      });
      await models.SearchEvent.deleteMany({});

      await projector.safetyPoll();

      const rows = await projected();
      expect(rows.map((row) => row.record_id)).toContain('m-lost');
    });

    it('persists the page cursor it actually reached, unrewound', async () => {
      await models.Message.create({
        messageId: 'm1',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });
      await projector.safetyPoll();

      const { rows } = await pool.query<{ updated_at: Date; record_id: string }>(
        "SELECT updated_at, record_id FROM chat_search.poll_cursor WHERE kind = 'message'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].record_id).toBe('m1');

      const source = await models.Message.findOne({ messageId: 'm1' }).lean<{ updatedAt: Date }>();
      expect(rows[0].updated_at.getTime()).toBe(source!.updatedAt.getTime());
    });

    /**
     * The overlap moved to read time, so it still has to happen: a write stamped
     * `T - epsilon` by a pod with a skewed clock can land after the scan passed
     * `T`, and re-scanning the trailing window with idempotent upserts is the
     * only thing that makes it recoverable.
     */
    it('re-scans the trailing lookback window once a pass has caught up', async () => {
      await models.Message.create({
        messageId: 'm-skew',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });
      await projector.safetyPoll();
      expect(await projected()).toHaveLength(1);

      /** Stands in for the write the first pass could not have seen. */
      await pool.query('TRUNCATE chat_search.documents CASCADE');

      await projector.safetyPoll();

      expect((await projected()).map((row) => row.record_id)).toEqual(['m-skew']);
    });

    /**
     * A rewound cursor at rest is a cursor that can loop. Once more than one
     * page of records shares the lookback window, persisting `last - lookback`
     * makes the next scan re-select the same earliest page — `updatedAt >
     * rewound` ignores the retained record id — so the poll repeats that page
     * forever and never reaches anything newer.
     */
    it('reaches records beyond the first page when a whole page shares the lookback window', async () => {
      await projector.stop();
      projector = new Projector(
        {
          pool,
          mongoose,
          source: createMongoSourceReader(mongoose),
          batches: { scan: 2 },
          startupCatchUp: false,
        },
        {
          readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
          deleteSearchEvents: (ids) =>
            deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
          dedupeSearchEvents,
        },
      );
      if (!(await projector.start())) {
        throw new Error('failed to acquire the projector lease for the test');
      }

      for (const suffix of ['a', 'b', 'c']) {
        await models.Message.create({
          messageId: `m-page-${suffix}`,
          conversationId: 'c1',
          user: 'alice',
          text: 'inside the lookback window',
          isCreatedByUser: true,
        });
      }

      await projector.safetyPoll();
      await projector.safetyPoll();

      expect((await projected()).map((row) => row.record_id)).toEqual([
        'm-page-a',
        'm-page-b',
        'm-page-c',
      ]);
    });

    /**
     * Quarantine is only ever cleared by the drain, and the drain skips a
     * quarantined record without re-reading it — so the poll is the only path
     * that can prove the record is healthy again. If it does not clear the
     * failure, every later event for that record keeps being discarded and the
     * row goes permanently stale once the cursor moves on.
     */
    it('clears a quarantine it has just projected past', async () => {
      const key = {
        tenantId: '__BASE__',
        userId: 'alice',
        kind: 'message' as const,
        recordId: 'm-poison',
      };
      await models.Message.create({
        messageId: 'm-poison',
        conversationId: 'c1',
        user: 'alice',
        text: 'corrected',
        isCreatedByUser: true,
      });
      for (let attempt = 0; attempt < 5; attempt++) {
        await withTransaction(pool, (client) => recordFailure(client, key, new Error('boom')));
      }
      const quarantined = await withTransaction(pool, (client) => quarantinedKeys(client, [key]));
      expect(quarantined.size).toBe(1);

      await projector.safetyPoll();

      const stillQuarantined = await withTransaction(pool, (client) =>
        quarantinedKeys(client, [key]),
      );
      expect(stillQuarantined.size).toBe(0);
    });

    it('skips unfinished rows exactly as the drain does', async () => {
      await models.Message.create({
        messageId: 'm-partial',
        conversationId: 'c1',
        user: 'alice',
        text: 'half',
        unfinished: true,
        isCreatedByUser: false,
      });
      await models.SearchEvent.deleteMany({});

      await projector.safetyPoll();

      expect(await projected()).toHaveLength(0);
    });

    /**
     * Application-generated timestamps collide constantly on bulk writes. A bare
     * `updatedAt > T` resume drops every row sharing the boundary instant.
     */
    it('resumes across rows sharing one timestamp without dropping any', async () => {
      const stamp = new Date('2026-03-01T00:00:00.000Z');
      await models.Message.collection.insertMany(
        ['a', 'b', 'c'].map((suffix) => ({
          messageId: `m-tie-${suffix}`,
          conversationId: 'c1',
          user: 'alice',
          text: 'same instant',
          isCreatedByUser: true,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );

      const reader = createMongoSourceReader(mongoose);
      const first = await reader.scan('message', null, 2);
      expect(first.sources.map((s) => s.recordId)).toEqual(['m-tie-a', 'm-tie-b']);

      const second = await reader.scan('message', first.cursor, 2);
      expect(second.sources.map((s) => s.recordId)).toEqual(['m-tie-c']);
    });
  });

  describe('reconciliation', () => {
    /**
     * The write class neither the queue nor the poll can see: a TTL expiry runs
     * no application code, so nothing enqueues and the row simply vanishes.
     */
    it('tombstones a row deleted with no code path to observe it', async () => {
      await models.Message.create({
        messageId: 'm-ttl',
        conversationId: 'c1',
        user: 'alice',
        text: 'expires',
        isCreatedByUser: true,
      });
      await projector.drain();
      expect((await projected())[0].deleted_at).toBeNull();

      await models.Message.collection.deleteOne({ messageId: 'm-ttl' });

      const tombstoned = await projector.reconcile();

      expect(tombstoned).toBe(1);
      const rows = await projected();
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].body).toBe('');
    });

    it('leaves rows the source still has', async () => {
      await models.Message.create({
        messageId: 'm-live',
        conversationId: 'c1',
        user: 'alice',
        text: 'still here',
        isCreatedByUser: true,
      });
      await projector.drain();

      const tombstoned = await projector.reconcile();

      expect(tombstoned).toBe(0);
      expect((await projected())[0].deleted_at).toBeNull();
    });

    /**
     * Imports are the write class every fast path is blind to: `bulkWrite` skips
     * Mongoose middleware so no event is enqueued, and imports deliberately keep
     * historic `updatedAt` values that sort behind the forward poll cursor
     * forever. Without a backfill direction, "reconciliation covers it" is not
     * true of the one path that most needs it to be.
     */
    it('projects a record the source has and PostgreSQL never saw', async () => {
      await models.Message.collection.insertOne({
        messageId: 'm-imported',
        conversationId: 'c-import',
        user: 'alice',
        text: 'imported long ago',
        isCreatedByUser: true,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });

      /** The cursor has long since moved past 2020, as it would in any live deployment. */
      await pool.query(
        `INSERT INTO chat_search.poll_cursor (kind, updated_at, record_id, scanned_at)
         VALUES ('message', now(), 'zzz', now())
         ON CONFLICT (kind) DO UPDATE SET updated_at = now(), record_id = 'zzz'`,
      );

      await projector.safetyPoll();
      expect(await projected()).toHaveLength(0);

      await projector.reconcile();

      const rows = await projected();
      expect(rows.map((row) => row.record_id)).toEqual(['m-imported']);
      expect(rows[0].body).toBe('imported long ago');
    });

    it('revives a row the source still has after it was tombstoned', async () => {
      await models.Message.create({
        messageId: 'm-revive',
        conversationId: 'c1',
        user: 'alice',
        text: 'still here',
        isCreatedByUser: true,
      });
      await projector.drain();
      await pool.query(
        "UPDATE chat_search.documents SET deleted_at = now(), body = '' WHERE record_id = 'm-revive'",
      );

      await projector.reconcile();

      const rows = await projected();
      expect(rows[0].deleted_at).toBeNull();
      expect(rows[0].body).toBe('still here');
    });

    it('skips an unfinished record when backfilling', async () => {
      await models.Message.collection.insertOne({
        messageId: 'm-half',
        conversationId: 'c1',
        user: 'alice',
        text: 'half written',
        unfinished: true,
        isCreatedByUser: false,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });

      await projector.reconcile();

      expect(await projected()).toHaveLength(0);
    });

    /**
     * The sweep must never need the whole source keyspace resident to be
     * correct, so it is driven from PostgreSQL in bounded windows. Shrinking the
     * window to one record forces the multi-page path that a default-sized run
     * would never reach in a test.
     */
    it('reconciles correctly across several bounded windows', async () => {
      await projector.stop();
      const reader = createMongoSourceReader(mongoose);
      let widestRead = 0;
      const source: typeof reader = {
        ...reader,
        read: (kind, keys) => {
          widestRead = Math.max(widestRead, keys.length);
          return reader.read(kind, keys);
        },
      };
      projector = new Projector(
        { pool, mongoose, source, batches: { reconcile: 1 }, startupCatchUp: false },
        {
          readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
          deleteSearchEvents: (ids) =>
            deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
          dedupeSearchEvents,
        },
      );
      if (!(await projector.start())) {
        throw new Error('failed to acquire the projector lease for the test');
      }

      for (const suffix of ['a', 'b', 'c']) {
        await models.Message.create({
          messageId: `m-win-${suffix}`,
          conversationId: 'c1',
          user: 'alice',
          text: 'windowed',
          isCreatedByUser: true,
        });
      }
      await projector.drain();
      await models.Message.collection.deleteOne({ messageId: 'm-win-b' });

      /** Only the sweep's own reads are of interest; the drain reads in its own batches. */
      widestRead = 0;
      const tombstoned = await projector.reconcile();

      expect(tombstoned).toBe(1);
      const rows = await projected();
      expect(rows.filter((row) => row.deleted_at === null).map((row) => row.record_id)).toEqual([
        'm-win-a',
        'm-win-c',
      ]);
      /** Never more than one window resident, whatever the size of the source. */
      expect(widestRead).toBe(1);
    });

    it('never tombstones one user because another user owns the record', async () => {
      await models.Message.create([
        {
          messageId: 'm-alice',
          conversationId: 'c1',
          user: 'alice',
          text: 'a',
          isCreatedByUser: true,
        },
        { messageId: 'm-bob', conversationId: 'c2', user: 'bob', text: 'b', isCreatedByUser: true },
      ]);
      await projector.drain();

      const tombstoned = await projector.reconcile();

      expect(tombstoned).toBe(0);
      const rows = await projected();
      expect(rows.every((row) => row.deleted_at === null)).toBe(true);
    });

    /**
     * The gap between "reconciliation adds and removes keys" and "reconciliation
     * repairs the projection".
     *
     * A re-import overwrites an existing conversation and preserves its historic
     * `updatedAt`, so the row sorts behind the forward poll cursor permanently; it
     * is present in the projection, so the backfill does not claim it either.
     * Without a content comparison the old title stays searchable forever.
     */
    it('refreshes a live row whose source content drifted', async () => {
      await models.Conversation.create({
        conversationId: 'c-reimport',
        user: 'alice',
        title: 'the original title',
        endpoint: 'openAI',
      });
      await projector.drain();
      expect((await projectedTitles())[0]).toBe('the original title');

      /**
       * Written through the collection so no hook fires and no event is queued,
       * with a historic timestamp so the forward poll can never reach it — exactly
       * what a bulk import produces.
       */
      await models.Conversation.collection.updateOne(
        { conversationId: 'c-reimport' },
        { $set: { title: 'the re-imported title', updatedAt: new Date('2020-01-01T00:00:00Z') } },
      );
      expect(await projector.drain()).toMatchObject({ consumed: 0 });

      await projector.reconcile();

      expect((await projectedTitles())[0]).toBe('the re-imported title');
    });

    it('leaves an unchanged row untouched, writing no outbox row', async () => {
      await models.Conversation.create({
        conversationId: 'c-stable',
        user: 'alice',
        title: 'unchanged',
        endpoint: 'openAI',
      });
      await projector.drain();
      const before = await outboxCount();

      await projector.reconcile();

      expect(await outboxCount()).toBe(before);
    });
  });

  /**
   * `setInterval` does not fire for a whole interval, so a first rollout against
   * an existing database would serve an almost empty index for an hour: nothing has
   * queued an event, the poll starts at the oldest rows, and reconciliation is the
   * only layer that can find the rest.
   */
  describe('startup catch-up', () => {
    it('projects existing records without waiting for an interval', async () => {
      await projector.stop();
      await models.Message.create({
        messageId: 'm-preexisting',
        conversationId: 'c1',
        user: 'alice',
        text: 'written before the projector ever ran',
        isCreatedByUser: true,
      });
      await models.SearchEvent.deleteMany({});
      await pool.query('TRUNCATE chat_search.documents, chat_search.outbox CASCADE');

      projector = new Projector(
        {
          pool,
          mongoose,
          source: createMongoSourceReader(mongoose),
          /** Long enough that only the immediate pass can be what projected it. */
          intervals: { drainMs: 3_600_000, safetyPollMs: 3_600_000, sweepMs: 3_600_000 },
        },
        {
          readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
          deleteSearchEvents: (ids) =>
            deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
          dedupeSearchEvents,
        },
      );
      if (!(await projector.start())) {
        throw new Error('failed to acquire the projector lease for the test');
      }

      await waitForAsync(async () => (await projected()).length > 0, 20_000);
      expect((await projected())[0].record_id).toBe('m-preexisting');
    }, 60_000);
  });

  describe('leadership', () => {
    it('lets only one projector lead at a time', async () => {
      const second = new Projector(
        { pool, mongoose, source: createMongoSourceReader(mongoose), startupCatchUp: false },
        {
          readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
          deleteSearchEvents: (ids) =>
            deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
          dedupeSearchEvents,
        },
      );

      expect(await second.start()).toBe(false);
      await second.stop();
    });

    /**
     * A standby that gives up after one attempt is how a cluster ends up with no
     * projector at all: the leader's advisory lock is released the moment its
     * session ends, and if nobody is still trying, projection simply stops until
     * a process happens to restart.
     */
    it('acquires the lease once the leader releases it', async () => {
      const standby = new Projector(
        {
          pool,
          mongoose,
          source: createMongoSourceReader(mongoose),
          intervals: { drainMs: 50 },
          startupCatchUp: false,
        },
        {
          readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
          deleteSearchEvents: (ids) =>
            deleteSearchEvents(mongoose, ids as mongoose.Types.ObjectId[]),
          dedupeSearchEvents,
        },
      );

      try {
        expect(await standby.start()).toBe(false);
        expect(standby.isLeader).toBe(false);

        await projector.stop();

        await waitFor(() => standby.isLeader, 20_000);
        expect(standby.epoch).not.toBeNull();
      } finally {
        await standby.stop();
      }
    }, 30_000);

    it('projects nothing while it does not hold the lease', async () => {
      await projector.stop();
      await models.Message.create({
        messageId: 'm-noleader',
        conversationId: 'c1',
        user: 'alice',
        text: 'body',
        isCreatedByUser: true,
      });

      const outcome = await projector.drain();

      expect(outcome).toEqual({
        consumed: 0,
        projected: 0,
        tombstoned: 0,
        skipped: 0,
        failed: 0,
      });
      expect(await projected()).toHaveLength(0);
    });
  });
});
