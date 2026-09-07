import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createActorCheckpointMaintenance } from './maintenance';
import { registerActorCheckpointScope } from './ownership';

const cfg = { type: 'mongo' as const };
let server: MongoMemoryServer;
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
  await mongoose.connection.dropDatabase();
});

const owners = () => mongoose.connection.db!.collection('agent_checkpoints_actor_owners');
const register = (thread = 'thread') =>
  registerActorCheckpointScope('owner', 'tenant', thread, 'event-actor/head', cfg);

async function payload(collection: string, namespace = 'event-actor/head') {
  await mongoose.connection.db!.collection(collection).insertOne({
    thread_id: 'thread',
    checkpoint_ns: namespace,
    checkpoint_id: 'checkpoint',
  });
}

test.each([
  ['agent_checkpoints', 'event-actor/head'],
  ['agent_checkpoints', 'event-actor/head|nested'],
  ['agent_checkpoint_writes', 'event-actor/head'],
  ['agent_checkpoint_writes', 'event-actor/head|nested'],
])(
  'retains ownership while %s payload exists in %s, without TTL indexes',
  async (collection, namespace) => {
    await register();
    await payload(collection, namespace);
    const hasActiveGeneration = jest.fn().mockResolvedValue(false);
    const sweep = createActorCheckpointMaintenance({ hasActiveGeneration });
    expect(await sweep(cfg)).toBe(0);
    expect(await owners().countDocuments()).toBe(1);
    expect(hasActiveGeneration).not.toHaveBeenCalled();
  },
);

test('reclaims ownership only after the owner conversation and payload are gone', async () => {
  await register();
  const conversations = mongoose.connection.db!.collection('conversations');
  await conversations.insertOne({
    user: 'owner',
    tenantId: 'tenant',
    conversationId: 'thread',
    expiredAt: new Date(0),
  });
  const sweep = createActorCheckpointMaintenance({ hasActiveGeneration: async () => false });
  expect(await sweep(cfg)).toBe(0);
  await conversations.deleteOne({ user: 'owner' });
  await conversations.insertOne({ user: 'foreign', tenantId: 'tenant', conversationId: 'thread' });
  await sweep(cfg);
  expect(await sweep(cfg)).toBe(1);
  expect(await owners().countDocuments()).toBe(0);
});

test('retains an empty registration until its admitted generation is inactive', async () => {
  await register();
  const hasActiveGeneration = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
  const sweep = createActorCheckpointMaintenance({ hasActiveGeneration });
  expect(await sweep(cfg)).toBe(0);
  expect(await owners().countDocuments()).toBe(1);
  expect(hasActiveGeneration).toHaveBeenCalledWith('owner', 'thread', 'tenant');
  await sweep(cfg);
  expect(await sweep(cfg)).toBe(1);
});

test('rechecks persistence and conditionally acknowledges the captured registration', async () => {
  await register();
  const sweep = createActorCheckpointMaintenance({
    hasActiveGeneration: async () => {
      await register();
      return false;
    },
  });
  expect(await sweep(cfg)).toBe(0);
  expect(await owners().countDocuments()).toBe(1);
  const lateWrite = createActorCheckpointMaintenance({
    hasActiveGeneration: async () => {
      await payload('agent_checkpoint_writes');
      return false;
    },
  });
  expect(await lateWrite(cfg)).toBe(0);
  expect(await owners().countDocuments()).toBe(1);
});

test('retries storage and generation lookup failures without losing ownership', async () => {
  await register();
  const hasActiveGeneration = jest
    .fn()
    .mockRejectedValueOnce(new Error('runtime unavailable'))
    .mockResolvedValue(false);
  const sweep = createActorCheckpointMaintenance({ hasActiveGeneration });
  await expect(sweep(cfg)).rejects.toThrow('runtime unavailable');
  expect(await owners().countDocuments()).toBe(1);
  await sweep(cfg);
  jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
    .mockRejectedValueOnce(new Error('ack unavailable'));
  await expect(sweep(cfg)).rejects.toThrow('ack unavailable');
  expect(await owners().countDocuments()).toBe(1);
  jest.restoreAllMocks();
  await sweep(cfg);
  expect(await sweep(cfg)).toBe(1);
});

test('bounded cursor advances past live scopes so orphans cannot starve', async () => {
  for (let i = 0; i < 30; i++) await register(`thread-${i}`);
  const retained = await owners().find().sort({ _id: 1 }).limit(25).toArray();
  await mongoose.connection.db!.collection('conversations').insertMany(
    retained.map((scope) => ({
      user: 'owner',
      tenantId: 'tenant',
      conversationId: scope.threadId,
    })),
  );
  const sweep = createActorCheckpointMaintenance({ hasActiveGeneration: async () => false });
  expect(await sweep(cfg)).toBe(0);
  expect(await sweep(cfg)).toBe(5);
  expect(await owners().countDocuments()).toBe(25);
});
