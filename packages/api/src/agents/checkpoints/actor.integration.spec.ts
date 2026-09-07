import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import type { ActorCheckpointScope } from './ownership';
import {
  getAgentCheckpointer,
  deleteOwnedAgentCheckpoints,
  LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
  LIBRECHAT_EVENT_ACTOR_INVOCATION_KEY,
  __resetCheckpointerForTests,
} from '../checkpointer';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { createOwnedActorCheckpoints } from './actor';
import { openCheckpointDeletion } from './deletion';

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

test('registered actor scopes remain readable by the pre-change saver and owner-cleanable without TTL', async () => {
  const owner = createOwnedActorCheckpoints('user', 'tenant');
  const other = createOwnedActorCheckpoints('other', 'tenant');
  const otherTenant = createOwnedActorCheckpoints('user', 'other');
  await owner.register('actor-thread', 'event-actor/head', cfg);
  const checkpointId = await write('event-actor/head');
  const source = { threadId: 'actor-thread', checkpointNs: 'event-actor/head', checkpointId };
  const fork = await owner.fork(source, 'event-actor/fork', 'next', cfg);
  expect(fork?.checkpointNs).toBe('event-actor/fork');
  const saver = (await getAgentCheckpointer(cfg))!;
  expect(
    (
      await saver.getTuple({
        configurable: {
          thread_id: 'actor-thread',
          checkpoint_ns: '',
          checkpoint_id: fork?.checkpointId,
          [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: 'event-actor/fork',
        },
      })
    )?.checkpoint.id,
  ).toBe(fork?.checkpointId);
  await write('event-actor/fork', 'nested', true);
  await other.register('actor-thread', 'event-actor/other', cfg);
  await write('event-actor/other', '', true);
  await otherTenant.register('actor-thread', 'event-actor/other-tenant', cfg);
  await write('event-actor/other-tenant', '', true);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    await mongoose.connection.db!.collection(name).dropIndexes();
  }
  await deleteOwnedAgentCheckpoints('user', 'tenant', ['actor-thread'], cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows.map((row) => row.checkpoint_ns).sort()).toEqual([
      'event-actor/other',
      'event-actor/other-tenant',
    ]);
  }
});

test('registration refuses another owner and never adopts an unregistered legacy payload', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const other = createOwnedActorCheckpoints('other');
  await owner.register('actor-thread', 'event-actor/fresh', cfg);
  await expect(other.register('actor-thread', 'event-actor/fresh', cfg)).rejects.toThrow();
  const legacyId = await write('event-actor/legacy', '', true);
  await expect(owner.register('actor-thread', 'event-actor/legacy', cfg)).rejects.toThrow();
  expect(await owner.capture('actor-thread', 'event-actor/legacy', 'new', cfg)).toBeNull();
  await owner.removeOwned({ threadId: 'actor-thread', checkpointNs: 'event-actor/legacy' }, cfg);
  expect(
    await mongoose.connection
      .db!.collection('agent_checkpoints')
      .findOne({ checkpoint_id: legacyId }),
  ).not.toBeNull();
});

test('legacy heads fork without changing the SDK wire namespace', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const checkpointId = await write('event-actor/legacy');
  const reference = { threadId: 'actor-thread', checkpointNs: 'event-actor/legacy', checkpointId };
  expect(await owner.fork(reference, 'event-actor/new', 'next', cfg)).toEqual({
    ...reference,
    checkpointNs: 'event-actor/new',
  });
  expect(await owner.resolveNamespace(reference, cfg)).toBe('event-actor/legacy');
  expect(
    await owner.resolveNamespace({ ...reference, checkpointId: 'missing' }, cfg),
  ).toBeUndefined();
});

test('conversation cleanup consumes exact legacy heads and closed suspensions before losing evidence', async () => {
  const headId = await write('event-actor/legacy-head', '', true);
  const pauseId = await write('event-actor/legacy-closed', '', true);
  const foreignId = await write('event-actor/legacy-head', '', true);
  const reference = (checkpointNs: string, checkpointId: string) => ({
    threadId: 'actor-thread',
    checkpointNs,
    checkpointId,
  });
  await mongoose.connection.db!.collection('conversations').insertMany([
    {
      user: 'owner',
      conversationId: 'actor-thread',
      subagentThread: {},
      agentEventActor: { checkpoint: reference('event-actor/legacy-head', headId) },
      agentEventActorSuspension: {
        status: 'closed',
        suspension: { checkpoint: reference('event-actor/legacy-closed', pauseId) },
      },
    },
    {
      user: 'foreign',
      conversationId: 'actor-thread',
      subagentThread: {},
      agentEventActor: { checkpoint: reference('event-actor/legacy-head', foreignId) },
    },
  ]);
  const intent = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await intent.remember(['actor-thread']);
  await mongoose.connection.db!.collection('conversations').deleteOne({ user: 'owner' });
  const retry = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await retry.cleanup();
  await retry.acknowledge();
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].checkpoint_id).toBe(foreignId);
  }
  expect(await mongoose.connection.db!.collection('conversations').countDocuments()).toBe(1);
});

test('failed pruning retains both outbox and exact anchor until a later retry succeeds', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const checkpointId = await write('event-actor/prune', '', true);
  await write('event-actor/prune', 'nested', true);
  const reference = { threadId: 'actor-thread', checkpointNs: 'event-actor/prune', checkpointId };
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    agentEventActorCleanup: [reference],
  });
  const failure = jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
    .mockRejectedValueOnce(new Error('interrupted cleanup'));
  await expect(owner.drain('actor-thread', cfg)).rejects.toThrow('interrupted cleanup');
  failure.mockRestore();
  expect(
    await mongoose.connection
      .db!.collection('agent_checkpoints')
      .findOne({ checkpoint_id: checkpointId }),
  ).not.toBeNull();
  expect(
    (await mongoose.connection.db!.collection('conversations').findOne({ user: 'owner' }))
      ?.agentEventActorCleanup,
  ).toEqual([reference]);
  await owner.drain('actor-thread', cfg);
  expect(
    (await mongoose.connection.db!.collection('conversations').findOne({ user: 'owner' }))
      ?.agentEventActorCleanup,
  ).toEqual([]);
  expect(await mongoose.connection.db!.collection('agent_checkpoints').find().toArray()).toEqual([
    expect.objectContaining({ checkpoint_ns: 'event-actor/prune|nested' }),
  ]);
});

test('owner records survive missing conversations and partial payload deletion for retry', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  await owner.register('actor-thread', 'event-actor/orphan', cfg);
  await write('event-actor/orphan', '', true);
  await mongoose.connection.db!.collection('agent_checkpoints').deleteMany({});
  const failure = jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteMany')
    .mockRejectedValueOnce(new Error('unavailable'));
  await expect(deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg)).rejects.toThrow(
    'unavailable',
  );
  failure.mockRestore();
  expect(
    await mongoose.connection.db!.collection('agent_checkpoints_actor_owners').countDocuments(),
  ).toBe(1);
  await deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg);
  expect(await mongoose.connection.db!.collection('agent_checkpoint_writes').countDocuments()).toBe(
    0,
  );
  expect(
    await mongoose.connection.db!.collection('agent_checkpoints_actor_owners').countDocuments(),
  ).toBe(0);
});

test('owner scope cleanup uses bounded batches', async () => {
  const scopes = Array.from({ length: 300 }, (_, i) => ({
    _id: String(i),
    user: 'owner',
    revision: String(i),
    owner: checkpointOwnerNamespacePrefix('owner'),
    threadId: 'actor-thread',
    checkpointNs: `event-actor/${i}`,
  }));
  await mongoose.connection
    .db!.collection<ActorCheckpointScope>('agent_checkpoints_actor_owners')
    .insertMany(scopes);
  const spy = jest.spyOn(mongoose.mongo.Collection.prototype, 'deleteMany');
  await deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg);
  const predicates = spy.mock.calls.flatMap(([filter]) => (filter?.$or ? [filter.$or] : []));
  expect(predicates.length).toBeGreaterThan(2);
  expect(predicates.every((or) => or.length <= 128)).toBe(true);
  spy.mockRestore();
  expect(
    await mongoose.connection.db!.collection('agent_checkpoints_actor_owners').countDocuments(),
  ).toBe(0);
});

test('outbox retry acknowledges a registered scope after payload deletion already succeeded', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  await owner.register('actor-thread', 'event-actor/ack-retry', cfg);
  const checkpointId = await write('event-actor/ack-retry', '', true);
  const reference = {
    threadId: 'actor-thread',
    checkpointNs: 'event-actor/ack-retry',
    checkpointId,
  };
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    agentEventActorCleanup: [reference],
  });
  const failure = jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
    .mockRejectedValueOnce(new Error('owner acknowledgement failed'));
  await expect(owner.drain('actor-thread', cfg)).rejects.toThrow('owner acknowledgement failed');
  failure.mockRestore();
  expect(await mongoose.connection.db!.collection('agent_checkpoints').countDocuments()).toBe(0);
  expect(await mongoose.connection.db!.collection('agent_checkpoint_writes').countDocuments()).toBe(
    0,
  );
  expect(
    await mongoose.connection.db!.collection('agent_checkpoints_actor_owners').countDocuments(),
  ).toBe(1);
  await owner.drain('actor-thread', cfg);
  expect(
    await mongoose.connection.db!.collection('agent_checkpoints_actor_owners').countDocuments(),
  ).toBe(0);
  expect(
    (await mongoose.connection.db!.collection('conversations').findOne({ user: 'owner' }))
      ?.agentEventActorCleanup,
  ).toEqual([]);
});

test('deletion intent retains both pre-drain and final historical references after topology loss', async () => {
  const checkpointNs = 'event-actor/drain-snapshot';
  const firstId = await write(checkpointNs, '', true);
  const reference = (checkpointId: string) => ({
    threadId: 'actor-thread',
    checkpointNs,
    checkpointId,
  });
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    subagentThread: {},
    agentEventActor: { checkpoint: reference(firstId) },
  });
  const deletion = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await deletion.remember(['actor-thread']);
  const finalId = await write(checkpointNs, '', true);
  await mongoose.connection.db!.collection('conversations').updateOne(
    { user: 'owner' },
    {
      $set: { 'agentEventActor.checkpoint': reference(finalId) },
    },
  );
  await deletion.remember(['actor-thread']);
  const unrelatedId = await write(checkpointNs, '', true);
  await mongoose.connection.db!.collection('conversations').deleteOne({ user: 'owner' });
  const retry = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await retry.cleanup();
  await retry.acknowledge();
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].checkpoint_id).toBe(unrelatedId);
  }
});
