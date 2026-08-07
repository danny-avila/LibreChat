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
import { createMongoSourceReader } from './source';
import { Projector } from './projector';

const DB_NAME = 'projector';

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
      { pool, mongoose, source: createMongoSourceReader(mongoose) },
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

    it('persists a cursor rewound by the lookback so a skewed write is re-scanned', async () => {
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
      const drift = source!.updatedAt.getTime() - rows[0].updated_at.getTime();
      expect(drift).toBe(60_000);
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
  });

  describe('leadership', () => {
    it('lets only one projector lead at a time', async () => {
      const second = new Projector(
        { pool, mongoose, source: createMongoSourceReader(mongoose) },
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
