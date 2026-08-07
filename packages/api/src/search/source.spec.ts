import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '@librechat/data-schemas';
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
});
