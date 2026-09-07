import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createCheckpointNamespace } from '../../stream/checkpoints';
import { deleteOwnedAgentCheckpoints } from '../checkpointer';
import { openCheckpointDeletion } from './deletion';

let server: MongoMemoryServer;
const cfg = {
  type: 'mongo' as const,
  checkpointCollectionName: 'cleanup_cp',
  checkpointWritesCollectionName: 'cleanup_writes',
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
  await mongoose.connection.db!.dropDatabase();
});

test('cleanup identity survives absent jobs and missing TTL indexes', async () => {
  const ns = createCheckpointNamespace('owner', 'tenant');
  const other = createCheckpointNamespace('other', 'tenant');
  const otherTenant = createCheckpointNamespace('owner', 'other-tenant');
  const rows = [ns, `${ns}|child`, other, otherTenant, '', '1000'].map((checkpoint_ns) => ({
    thread_id: 'thread',
    checkpoint_ns,
  }));
  for (const name of ['cleanup_cp', 'cleanup_writes']) {
    await mongoose.connection.db!.collection(name).insertMany(rows.map((row) => ({ ...row })));
  }
  await deleteOwnedAgentCheckpoints('owner', 'tenant', ['thread'], cfg);
  await deleteOwnedAgentCheckpoints('owner', 'tenant', ['thread'], cfg);
  for (const name of ['cleanup_cp', 'cleanup_writes']) {
    const remaining = await mongoose.connection.db!.collection(name).find().toArray();
    expect(remaining.map((row) => row.checkpoint_ns).sort()).toEqual(
      [other, otherTenant, '', '1000'].sort(),
    );
  }
});

test('account cleanup remains retryable after one collection deletion fails', async () => {
  const checkpoint_ns = createCheckpointNamespace('owner');
  for (const name of ['cleanup_cp', 'cleanup_writes']) {
    await mongoose.connection.db!.collection(name).insertOne({ thread_id: 'gone', checkpoint_ns });
  }
  jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteMany')
    .mockRejectedValueOnce(new Error('temporary failure'));
  await expect(deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg)).rejects.toThrow(
    'temporary failure',
  );
  jest.restoreAllMocks();
  await deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg);
  expect(await mongoose.connection.db!.collection('cleanup_cp').countDocuments()).toBe(0);
  expect(await mongoose.connection.db!.collection('cleanup_writes').countDocuments()).toBe(0);
});

test('deletion intent retains every cascade wave across retries and scopes owners and roots', async () => {
  const first = await openCheckpointDeletion('owner', 'tenant', 'root', cfg);
  await first.remember(['root']);
  await first.remember(['child', 'grandchild']);
  const retry = await openCheckpointDeletion('owner', 'tenant', 'root', cfg);
  expect(retry.conversationIds().sort()).toEqual(['child', 'grandchild', 'root']);
  expect((await openCheckpointDeletion('other', 'tenant', 'root', cfg)).conversationIds()).toEqual(
    [],
  );
  expect((await openCheckpointDeletion('owner', 'other', 'root', cfg)).conversationIds()).toEqual(
    [],
  );
  expect(
    (await openCheckpointDeletion('owner', 'tenant', 'other-root', cfg)).conversationIds(),
  ).toEqual([]);
  await retry.acknowledge();
  expect((await openCheckpointDeletion('owner', 'tenant', 'root', cfg)).conversationIds()).toEqual(
    [],
  );
});

test('an earlier attempt cannot acknowledge a newer attempt’s intent', async () => {
  const first = await openCheckpointDeletion('owner', undefined, 'root', cfg);
  await first.remember(['child']);
  const second = await openCheckpointDeletion('owner', undefined, 'root', cfg);
  await second.remember(['child']);
  await first.acknowledge();
  expect((await openCheckpointDeletion('owner', undefined, 'root', cfg)).conversationIds()).toEqual(
    ['child'],
  );
  await second.acknowledge();
});

test('thousands of conversation targets use bounded cleanup commands', async () => {
  const ids = Array.from({ length: 1100 }, (_, i) => `thread-${i}`);
  const intent = await openCheckpointDeletion('owner', undefined, 'root', cfg);
  await intent.remember(ids);
  const ns = createCheckpointNamespace('owner');
  await mongoose.connection
    .db!.collection('cleanup_cp')
    .insertMany(ids.map((thread_id) => ({ thread_id, checkpoint_ns: ns })));
  const spy = jest.spyOn(mongoose.mongo.Collection.prototype, 'deleteMany');
  await deleteOwnedAgentCheckpoints('owner', undefined, ids, cfg);
  expect(spy.mock.calls.every(([filter]) => filter?.thread_id.$in.length <= 256)).toBe(true);
  expect(await mongoose.connection.db!.collection('cleanup_cp').countDocuments()).toBe(0);
  await intent.acknowledge();
  expect(
    (await openCheckpointDeletion('owner', undefined, undefined, cfg)).conversationIds(),
  ).toEqual([]);
});
