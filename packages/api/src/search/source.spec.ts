import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { SourceCursor } from './source';
import { createMongoSourceReader } from './source';

/**
 * The projector reads every tenant's records and writes each one back under the
 * scope the document itself carries — a cross-tenant background consumer by
 * construction. `Message`, `Conversation` and `SharedLink` are tenant-isolated,
 * so under `TENANT_ISOLATION_STRICT` an undeclared read is rejected outright,
 * and the projection would sit empty on exactly the deployments that turn strict
 * isolation on.
 *
 * The flag is set before any model runs a query because the plugin caches it on
 * first use; this file owns its own module registry, so the assignment is local
 * to it.
 */
describe('mongo source reader under strict tenant isolation', () => {
  let mongoServer: MongoMemoryServer;
  let models: ReturnType<typeof createModels>;
  const OLD_ENV = process.env;

  beforeAll(async () => {
    process.env = { ...OLD_ENV, TENANT_ISOLATION_STRICT: 'true' };
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = createModels(mongoose);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    await models.Message.collection.deleteMany({});
    await models.Conversation.collection.deleteMany({});
  });

  const reader = () => createMongoSourceReader(mongoose);

  const seed = async (messageId: string, tenantId?: string) => {
    await models.Message.collection.insertOne({
      messageId,
      conversationId: 'c1',
      user: 'alice',
      text: 'quarterly revenue',
      isCreatedByUser: true,
      ...(tenantId ? { tenantId } : {}),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  };

  /**
   * The control: a bare model read with no tenant context is exactly what strict
   * mode is there to reject. If this ever stops throwing, the three assertions
   * below stop proving anything.
   */
  it('rejects an undeclared cross-tenant read', async () => {
    await seed('m-control');

    await expect(models.Message.find({ messageId: 'm-control' }).lean().exec()).rejects.toThrow(
      /tenant/i,
    );
  });

  it('reads specific keys across tenants', async () => {
    await seed('m-read', 'acme');

    const sources = await reader().read('message', [
      { tenantId: 'acme', userId: 'alice', kind: 'message', recordId: 'm-read' },
    ]);

    expect(sources.map((source) => source.recordId)).toEqual(['m-read']);
    expect(sources[0].tenantId).toBe('acme');
  });

  it('scans forward across tenants', async () => {
    await seed('m-scan-a', 'acme');
    await seed('m-scan-b');

    const page = await reader().scan('message', null, 10);

    expect(page.sources.map((source) => source.recordId).sort()).toEqual(['m-scan-a', 'm-scan-b']);
  });

  it('streams every key across tenants', async () => {
    await seed('m-key-a', 'acme');
    await seed('m-key-b', 'globex');

    const seen: string[] = [];
    for await (const batch of reader().keys('message', 10)) {
      for (const key of batch) {
        seen.push(key.recordId);
      }
    }

    expect(seen.sort()).toEqual(['m-key-a', 'm-key-b']);
  });

  /**
   * The record id is not unique on its own — the Mongo constraints include user
   * and tenant — so two users importing the same export hold two documents under
   * one conversation id. Resuming on `recordId > cursor` skips whichever members
   * of such a group fall past a batch boundary, and reconciliation is the layer
   * that would otherwise have found them.
   */
  it('yields every document of a duplicate-id group across a batch boundary', async () => {
    for (const user of ['alice', 'bob', 'carol']) {
      await models.Conversation.collection.insertOne({
        conversationId: 'c-shared',
        user,
        title: 'imported',
        endpoint: 'openAI',
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });
    }

    const seen: string[] = [];
    for await (const batch of reader().keys('conversation', 1)) {
      for (const key of batch) {
        seen.push(key.userId);
      }
    }

    expect(seen.sort()).toEqual(['alice', 'bob', 'carol']);
  });
});

/**
 * Projection shaping, away from strict isolation so the assertions are about the
 * shape rather than about the read.
 */
describe('mongo source reader projection shape', () => {
  let mongoServer: MongoMemoryServer;
  let models: ReturnType<typeof createModels>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = createModels(mongoose);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await models.Message.collection.deleteMany({});
    await models.Conversation.collection.deleteMany({});
  });

  const reader = () => createMongoSourceReader(mongoose);

  const readOne = async (recordId: string) => {
    const sources = await reader().read('message', [
      { tenantId: '__BASE__', userId: 'alice', kind: 'message', recordId },
    ]);
    return sources[0];
  };

  /**
   * The query path normalizes, so the write path must too: PostgreSQL's exact,
   * trigram and simple-FTS operators do not fold compatibility characters, so a
   * raw stored form is unreachable from the query that produced it.
   */
  it('normalizes projected title and body the way a query is normalized', async () => {
    await models.Message.collection.insertOne({
      messageId: 'm-nfkc',
      conversationId: 'c1',
      user: 'alice',
      title: 'ＲＥＰＯＲＴ',
      text: 'ｑｕａｒｔｅｒｌｙ   revenue\n\nprojection',
      isCreatedByUser: true,
    });

    const source = await readOne('m-nfkc');

    expect(source.title).toBe('REPORT');
    expect(source.body).toBe('quarterly revenue projection');
  });

  /**
   * `buildRetentionVisibilityFilter()` accepts a missing `isTemporary` only when
   * `expiredAt` is null, so a legacy record with a deadline is invisible in the
   * primary store. Projecting it as permanent lets it occupy a slot in the bounded
   * candidate set and hide a real match ranked below it, because hydration then
   * drops it.
   */
  it('treats a legacy record with a retention deadline as temporary', async () => {
    await models.Message.collection.insertOne({
      messageId: 'm-legacy',
      conversationId: 'c1',
      user: 'alice',
      text: 'legacy',
      isCreatedByUser: true,
      expiredAt: new Date(Date.now() + 3_600_000),
    });

    expect((await readOne('m-legacy')).isTemporary).toBe(true);
  });

  it('leaves a legacy record with no deadline permanent', async () => {
    await models.Message.collection.insertOne({
      messageId: 'm-legacy-permanent',
      conversationId: 'c1',
      user: 'alice',
      text: 'legacy',
      isCreatedByUser: true,
    });

    expect((await readOne('m-legacy-permanent')).isTemporary).toBe(false);
  });

  it('honours an explicitly stored flag over the legacy rule', async () => {
    await models.Message.collection.insertOne({
      messageId: 'm-explicit',
      conversationId: 'c1',
      user: 'alice',
      text: 'temporary chat',
      isCreatedByUser: true,
      isTemporary: false,
      expiredAt: new Date(Date.now() + 3_600_000),
    });

    expect((await readOne('m-explicit')).isTemporary).toBe(false);
  });

  /**
   * Imported records carry no `updatedAt`, and Mongo sorts a missing field ahead
   * of every date. A cursor that cannot say "still inside that region" cannot
   * leave it: the scan returns the same first page forever and never reaches a
   * timestamped record at all.
   */
  it('advances the scan cursor across a full page of untimestamped records', async () => {
    for (const suffix of ['a', 'b']) {
      await models.Message.collection.insertOne({
        messageId: `m-notime-${suffix}`,
        conversationId: 'c1',
        user: 'alice',
        text: 'imported',
        isCreatedByUser: true,
      });
    }
    await models.Message.collection.insertOne({
      messageId: 'm-timed',
      conversationId: 'c1',
      user: 'alice',
      text: 'later',
      isCreatedByUser: true,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const first = await reader().scan('message', null, 2);
    expect(first.sources.map((source) => source.recordId)).toEqual(['m-notime-a', 'm-notime-b']);
    expect(first.cursor).toMatchObject({ updatedAt: null, recordId: 'm-notime-b' });
    expect(first.cursor?.id).toMatch(/^[0-9a-f]{24}$/);

    const second = await reader().scan('message', first.cursor, 2);
    expect(second.sources.map((source) => source.recordId)).toEqual(['m-timed']);
  });

  /**
   * Record ids are only unique together with user and tenant, so an equal
   * `(updatedAt, recordId)` group — two users importing the same export — can
   * span a page boundary. The `_id` tiebreak is what lets the resume admit the
   * group's unreturned members instead of `$gt`-ing past all of them.
   */
  it('walks an equal-timestamp duplicate-id group without skipping members', async () => {
    const stamp = new Date('2020-01-01T00:00:00Z');
    for (const user of ['alice', 'bob', 'carol']) {
      await models.Conversation.collection.insertOne({
        conversationId: 'c-shared',
        user,
        title: 'imported',
        endpoint: 'openAI',
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    const seen: string[] = [];
    let cursor: SourceCursor | null = null;
    for (let page = 0; page < 5; page++) {
      const result = await reader().scan('conversation', cursor, 1);
      if (result.sources.length === 0) {
        break;
      }
      seen.push(...result.sources.map((source) => source.userId));
      cursor = result.cursor;
    }

    expect(seen.sort()).toEqual(['alice', 'bob', 'carol']);
  });
});
