import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  getAgentCheckpointer,
  __resetCheckpointerForTests,
  LIBRECHAT_CHECKPOINT_OWNER_KEY,
  LIBRECHAT_CHECKPOINT_STORAGE_OWNER_KEY,
} from '../checkpointer';
import {
  createCheckpointNamespace,
  checkpointOwnerNamespacePrefix,
} from '../../stream/checkpoints';
import { openCheckpointDeletion, createCheckpointDeletionReclaimer } from './deletion';
import { checkpointStorageConfigs, CHECKPOINT_STORAGE_COLLECTION } from './storage';

let server: MongoMemoryServer;
const cfg = {
  type: 'mongo' as const,
  checkpointCollectionName: 'old_cp',
  checkpointWritesCollectionName: 'old_writes',
};
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}, 60000);
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});
afterEach(async () => {
  jest.restoreAllMocks();
  __resetCheckpointerForTests();
  await mongoose.connection.db!.dropDatabase();
});

async function seed(config: RunnableConfig, storage = cfg) {
  const saver = (await getAgentCheckpointer(storage))!;
  const checkpoint = emptyCheckpoint();
  await saver.putWrites(
    { configurable: { ...config.configurable, checkpoint_id: checkpoint.id } },
    [[INTERRUPT, [{ value: 'approve', resumable: true }]]],
    'task',
  );
  await saver.put(config, checkpoint, { source: 'input', step: -1, parents: {} });
  return { saver, checkpoint };
}

test.each(['mongo', 'memory'] as const)(
  'the first deletion finds the original store after a switch to %s',
  async (type) => {
    const config = {
      configurable: {
        thread_id: 'thread',
        checkpoint_ns: createCheckpointNamespace('owner', 'tenant'),
      },
    };
    await seed(config);
    const intermediate = {
      ...cfg,
      checkpointCollectionName: 'intermediate_cp',
      checkpointWritesCollectionName: 'intermediate_writes',
    };
    await seed(config, intermediate);
    const changed = {
      type,
      checkpointCollectionName: 'new_cp',
      checkpointWritesCollectionName: 'new_writes',
    };
    const descriptors = await checkpointStorageConfigs('owner', 'tenant', changed);
    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining(cfg),
        expect.objectContaining(intermediate),
        expect.objectContaining(changed),
      ]),
    );
    expect(await checkpointStorageConfigs('foreign', 'tenant', changed)).toEqual([
      expect.objectContaining(changed),
    ]);
    const deletion = await openCheckpointDeletion('owner', 'tenant', 'thread', changed);
    await deletion.remember(['thread']);
    await deletion.cleanup();
    await deletion.acknowledge();
    expect(await mongoose.connection.db!.collection('old_cp').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('old_writes').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('intermediate_cp').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('intermediate_writes').countDocuments()).toBe(
      0,
    );
  },
);

test('concurrent generations share one write-ahead store descriptor', async () => {
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      seed({
        configurable: {
          thread_id: `thread-${index}`,
          checkpoint_ns: createCheckpointNamespace('owner', 'tenant'),
        },
      }),
    ),
  );
  const db = mongoose.connection.db!;
  expect(await db.collection(CHECKPOINT_STORAGE_COLLECTION).countDocuments()).toBe(1);
  expect(await db.collection('old_cp').countDocuments()).toBe(8);
  expect(await db.collection('old_writes').countDocuments()).toBe(8);
});

test('catalog failure prevents payload writes, and a later write restores a missing descriptor', async () => {
  const saver = (await getAgentCheckpointer(cfg))!;
  const checkpoint = emptyCheckpoint();
  const config = {
    configurable: {
      thread_id: 'thread',
      checkpoint_ns: createCheckpointNamespace('owner'),
      checkpoint_id: checkpoint.id,
    },
  };
  jest
    .spyOn(mongoose.mongo.Collection.prototype, 'updateOne')
    .mockRejectedValueOnce(new Error('catalog unavailable'));
  await expect(saver.putWrites(config, [[INTERRUPT, []]], 'task')).rejects.toThrow(
    'catalog unavailable',
  );
  expect(await mongoose.connection.db!.collection('old_writes').countDocuments()).toBe(0);
  jest.restoreAllMocks();
  await saver.putWrites(config, [[INTERRUPT, []]], 'task');
  await mongoose.connection.db!.collection(CHECKPOINT_STORAGE_COLLECTION).deleteMany({});
  await saver.putWrites(config, [[INTERRUPT, []]], 'task');
  expect(
    await mongoose.connection.db!.collection(CHECKPOINT_STORAGE_COLLECTION).countDocuments(),
  ).toBe(1);
});

test('upgraded legacy writes record storage without changing the legacy physical layout', async () => {
  await seed({
    configurable: {
      thread_id: 'legacy',
      checkpoint_ns: '',
      [LIBRECHAT_CHECKPOINT_STORAGE_OWNER_KEY]: checkpointOwnerNamespacePrefix('owner', 'tenant'),
    },
  });
  expect(
    await mongoose.connection
      .db!.collection('old_cp')
      .findOne({ thread_id: 'legacy', checkpoint_ns: '' }),
  ).not.toBeNull();
  expect(await checkpointStorageConfigs('owner', 'tenant', { type: 'memory' })).toEqual(
    expect.arrayContaining([expect.objectContaining(cfg)]),
  );
});

test.each([false, true])(
  'background replay cleans failed deletion without client retry (actor=%s)',
  async (actor) => {
    const owner = checkpointOwnerNamespacePrefix('owner', 'tenant');
    const namespace = actor
      ? 'event-actor/invocation'
      : createCheckpointNamespace('owner', 'tenant');
    await seed({
      configurable: {
        thread_id: 'thread',
        checkpoint_ns: namespace,
        ...(actor ? { [LIBRECHAT_CHECKPOINT_OWNER_KEY]: owner } : {}),
      },
    });
    await mongoose.connection
      .db!.collection('conversations')
      .insertOne({ user: 'owner', conversationId: 'thread' });
    const deletion = await openCheckpointDeletion('owner', 'tenant', 'thread', { type: 'memory' });
    await deletion.remember(['thread']);
    await mongoose.connection.db!.collection('conversations').deleteMany({});
    jest
      .spyOn(mongoose.mongo.Collection.prototype, 'deleteMany')
      .mockRejectedValueOnce(new Error('delete unavailable'));
    await expect(deletion.cleanup()).rejects.toThrow('delete unavailable');
    jest.restoreAllMocks();
    const jobs = jest.fn().mockResolvedValue(['live-job']);
    const recover = createCheckpointDeletionReclaimer(jobs);
    expect(await recover(25)).toBe(0);
    expect(await mongoose.connection.db!.collection('old_writes').countDocuments()).toBeGreaterThan(
      0,
    );
    jobs.mockResolvedValue([]);
    for (let i = 0; i < 3; i++) await recover(25);
    expect(await mongoose.connection.db!.collection('old_cp').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('old_writes').countDocuments()).toBe(0);
    expect(
      await mongoose.connection.db!.collection('agent_checkpoint_deletions').countDocuments(),
    ).toBe(0);
  },
);

test('background replay preserves a recreated conversation and never captures a replacement namespace', async () => {
  const original = createCheckpointNamespace('owner');
  await seed({ configurable: { thread_id: 'thread', checkpoint_ns: original } });
  const deletion = await openCheckpointDeletion('owner', undefined, 'thread', cfg);
  await deletion.remember(['thread']);
  const replacement = createCheckpointNamespace('owner');
  await seed({ configurable: { thread_id: 'thread', checkpoint_ns: replacement } });
  const db = mongoose.connection.db!;
  await db.collection('conversations').insertOne({ user: 'owner', conversationId: 'thread' });
  const recover = createCheckpointDeletionReclaimer(async () => []);
  await recover(25);
  expect(await db.collection('old_cp').countDocuments()).toBe(2);
  await db.collection('conversations').deleteMany({});
  for (let i = 0; i < 3; i++) await recover(25);
  expect(await db.collection('old_cp').distinct('checkpoint_ns')).toEqual([replacement]);
  expect(await db.collection('old_writes').distinct('checkpoint_ns')).toEqual([replacement]);
});

test('captures nested pending writes without a checkpoint and retains them across replay failures', async () => {
  const saver = (await getAgentCheckpointer(cfg))!;
  const namespace = `${createCheckpointNamespace('owner', 'tenant')}|nested:task`;
  await saver.putWrites(
    {
      configurable: { thread_id: 'child', checkpoint_ns: namespace, checkpoint_id: 'pending-only' },
    },
    [[INTERRUPT, []]],
    'task',
  );
  const db = mongoose.connection.db!;
  expect(await db.collection('old_cp').countDocuments()).toBe(0);
  const deletion = await openCheckpointDeletion('owner', 'tenant', 'root', { type: 'memory' });
  await deletion.remember(['child']);
  const recover = createCheckpointDeletionReclaimer(async () => []);
  const originalDelete = mongoose.mongo.Collection.prototype.deleteMany;
  jest.spyOn(mongoose.mongo.Collection.prototype, 'deleteMany').mockImplementation(function (
    ...args
  ) {
    if (this.collectionName === 'old_writes')
      return Promise.reject(new Error('payload unavailable'));
    return originalDelete.apply(this, args);
  });
  for (let pass = 0; pass < 2; pass++) {
    await expect(recover(25)).rejects.toThrow('reclamation failed');
    expect(await db.collection('old_writes').countDocuments()).toBe(1);
    expect(
      await db
        .collection('agent_checkpoint_deletions')
        .countDocuments({ checkpoint: { $exists: true } }),
    ).toBe(1);
  }
  jest.restoreAllMocks();
  for (let pass = 0; pass < 3; pass++) await recover(25);
  expect(await db.collection('old_writes').countDocuments()).toBe(0);
  expect(await db.collection('agent_checkpoint_deletions').countDocuments()).toBe(0);
});
