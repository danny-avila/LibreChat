import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import {
  getAgentCheckpointer,
  deleteOwnedAgentCheckpoints,
  LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
  LIBRECHAT_EVENT_ACTOR_INVOCATION_KEY,
  __resetCheckpointerForTests,
} from '../checkpointer';
import { createOwnedActorCheckpoints } from './actor';

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
  __resetCheckpointerForTests();
  await mongoose.connection.dropDatabase();
});

async function write(namespace: string, graphNamespace = '', paused = false) {
  const saver = (await getAgentCheckpointer(cfg))!;
  const checkpoint = emptyCheckpoint();
  const config = {
    configurable: {
      thread_id: 'actor-thread',
      checkpoint_ns: graphNamespace,
      checkpoint_id: checkpoint.id,
      [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: namespace,
      [LIBRECHAT_EVENT_ACTOR_INVOCATION_KEY]: 'invocation',
    },
  };
  await saver.put(config, checkpoint, { source: 'loop', step: 1, parents: {} });
  if (paused) {
    await saver.putWrites(config, [[INTERRUPT, { id: 'approval', value: 'approve' }]], 'task');
  }
  return checkpoint.id;
}

test('actor forks and paused subgraphs remain owner-cleanable without TTL or lifecycle evidence', async () => {
  const owner = createOwnedActorCheckpoints('user', 'tenant');
  const other = createOwnedActorCheckpoints('other', 'tenant');
  const otherTenant = createOwnedActorCheckpoints('user', 'other');
  const logical = 'event-actor/same-logical';
  const checkpointId = await write(owner.namespace(logical));
  const source = { threadId: 'actor-thread', checkpointNs: logical, checkpointId };
  const fork = await owner.fork(source, 'event-actor/fork', 'next', cfg);
  expect(fork?.checkpointNs).toBe('event-actor/fork');
  expect(await owner.capture('actor-thread', 'event-actor/fork', 'next', cfg)).toEqual(fork);
  await write(owner.namespace('event-actor/fork'), 'nested', true);
  await write(other.namespace(logical), '', true);
  await write(otherTenant.namespace(logical), '', true);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    await mongoose.connection.db!.collection(name).dropIndexes();
  }
  await deleteOwnedAgentCheckpoints('user', 'tenant', ['actor-thread'], cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.checkpoint_ns).sort()).toEqual(
      [other.namespace(logical), otherTenant.namespace(logical)].sort(),
    );
  }
});

test('legacy heads fork into owned storage while signed legacy pauses keep their pending writes', async () => {
  const owner = createOwnedActorCheckpoints('user');
  const checkpointNs = 'event-actor/legacy';
  const checkpointId = await write(checkpointNs);
  const source = { threadId: 'actor-thread', checkpointNs, checkpointId };
  expect(await owner.fork(source, 'event-actor/new', 'next', cfg)).toEqual({
    ...source,
    checkpointNs: 'event-actor/new',
  });
  await write(checkpointNs, '', true);
  expect(await owner.resolveNamespace(source, cfg)).toBe(checkpointNs);
  expect(await owner.resolveNamespace({ ...source, checkpointNs: 'event-actor/new' }, cfg)).toBe(
    owner.namespace('event-actor/new'),
  );
  expect(
    await owner.resolveNamespace({ ...source, checkpointNs: 'event-actor/missing' }, cfg),
  ).toBeUndefined();
  await owner.remove(source, cfg);
  await owner.remove({ ...source, checkpointNs: 'event-actor/new' }, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    expect(await mongoose.connection.db!.collection(name).countDocuments()).toBe(0);
  }
});

test('fresh capture and cleanup cannot touch a colliding legacy principal', async () => {
  const owner = createOwnedActorCheckpoints('new-owner');
  const checkpointNs = 'event-actor/collision';
  const legacyId = await write(checkpointNs, '', true);
  expect(await owner.capture('actor-thread', checkpointNs, 'new', cfg)).toBeNull();
  const checkpointId = await write(owner.namespace(checkpointNs), '', true);
  await owner.remove({ threadId: 'actor-thread', checkpointNs, checkpointId }, cfg);
  await owner.removeOwned({ threadId: 'actor-thread', checkpointNs }, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ checkpoint_ns: checkpointNs, checkpoint_id: legacyId });
  }
  await owner.remove({ threadId: 'actor-thread', checkpointNs, checkpointId }, cfg);
  expect(await mongoose.connection.db!.collection('agent_checkpoints').countDocuments()).toBe(1);
});

test('historical selection uses the exact ID and retains its deletion anchor across failure', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const checkpointNs = 'event-actor/history';
  const checkpointId = await write(checkpointNs, '', true);
  await write(checkpointNs, 'nested', true);
  const ownedId = await write(owner.namespace(checkpointNs), '', true);
  const reference = { threadId: 'actor-thread', checkpointNs, checkpointId };
  const selected = await owner.resolveNamespace(reference, cfg);
  expect(selected).toBe(checkpointNs);
  expect(await owner.capture('actor-thread', checkpointNs, 'resume', cfg, selected)).toMatchObject({
    checkpointId,
    checkpointNs,
  });
  const original = mongoose.mongo.Collection.prototype.deleteMany;
  const failure = jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteMany')
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error('checkpoint deletion interrupted'));
  await expect(owner.remove(reference, cfg)).rejects.toThrow('checkpoint deletion interrupted');
  failure.mockRestore();
  expect(
    await mongoose.connection
      .db!.collection('agent_checkpoints')
      .findOne({ checkpoint_id: checkpointId }),
  ).not.toBeNull();
  await owner.remove(reference, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      checkpoint_ns: owner.namespace(checkpointNs),
      checkpoint_id: ownedId,
    });
  }
});

test('retrying an absent historical reference never deletes a newer owned scope', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const checkpointNs = 'event-actor/reused-logical';
  const checkpointId = await write(checkpointNs);
  const reference = { threadId: 'actor-thread', checkpointNs, checkpointId };
  await owner.remove(reference, cfg);
  const newerId = await write(owner.namespace(checkpointNs), '', true);
  await owner.remove(reference, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    expect(
      await mongoose.connection.db!.collection(name).findOne({ checkpoint_id: newerId }),
    ).not.toBeNull();
  }
});
