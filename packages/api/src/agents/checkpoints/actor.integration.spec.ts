import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import { Annotation, StateGraph, START, END, interrupt, Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  getAgentCheckpointer,
  deleteOwnedAgentCheckpoints,
  LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
  LIBRECHAT_CHECKPOINT_OWNER_KEY,
  LIBRECHAT_LEGACY_CHECKPOINT_KEY,
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
  jest.restoreAllMocks();
  __resetCheckpointerForTests();
  await mongoose.connection.dropDatabase();
});

function config(
  namespace: string,
  owner?: string,
  checkpointId?: string,
  graphNamespace = '',
): RunnableConfig {
  return {
    configurable: {
      thread_id: 'actor-thread',
      checkpoint_ns: graphNamespace,
      [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: namespace,
      [LIBRECHAT_EVENT_ACTOR_INVOCATION_KEY]: 'invocation',
      ...(owner == null
        ? {}
        : { [LIBRECHAT_CHECKPOINT_OWNER_KEY]: checkpointOwnerNamespacePrefix(owner) }),
      ...(checkpointId == null ? {} : { checkpoint_id: checkpointId }),
    },
  };
}

async function write(namespace: string, owner?: string, graphNamespace = '') {
  const saver = (await getAgentCheckpointer(cfg))!;
  const checkpoint = emptyCheckpoint();
  const input = config(namespace, owner, checkpoint.id, graphNamespace);
  await saver.put(input, checkpoint, { source: 'loop', step: 1, parents: {} });
  await saver.putWrites(input, [[INTERRUPT, { id: 'approval', value: 'approve' }]], 'task');
  return checkpoint.id;
}
const reference = (checkpointNs: string, checkpointId: string) => ({
  threadId: 'actor-thread',
  checkpointNs,
  checkpointId,
});

test('late legacy writes and another tagged owner survive owned scope deletion', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const ns = 'event-actor/collision';
  await write(ns, 'owner');
  await write(ns, 'owner', 'nested');
  const foreignId = await write(ns, 'foreign');
  const lateLegacyId = await write(ns);
  await owner.removeOwned({ threadId: 'actor-thread', checkpointNs: ns }, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows.map((row) => row.checkpoint_id).sort()).toEqual([foreignId, lateLegacyId].sort());
  }
  await deleteOwnedAgentCheckpoints('foreign', undefined, undefined, cfg);
  expect(
    (await mongoose.connection.db!.collection('agent_checkpoints').find().toArray()).map(
      (row) => row.checkpoint_id,
    ),
  ).toEqual([lateLegacyId]);
});

test('new payloads retain the original SDK physical format and are readable by an old saver', async () => {
  const id = await write('event-actor/head', 'owner');
  const tuple = await MongoDBSaver.prototype.getTuple.call((await getAgentCheckpointer(cfg))!, {
    configurable: {
      thread_id: 'actor-thread',
      checkpoint_ns: 'event-actor/head',
      checkpoint_id: id,
    },
  });
  expect(tuple?.checkpoint.id).toBe(id);
  expect(tuple?.pendingWrites).toHaveLength(1);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    const rows = await mongoose.connection.db!.collection(name).find().toArray();
    expect(rows.every((row) => row.lc_owner === checkpointOwnerNamespacePrefix('owner'))).toBe(
      true,
    );
    await mongoose.connection.db!.collection(name).dropIndexes();
  }
  await deleteOwnedAgentCheckpoints('owner', undefined, ['actor-thread'], cfg);
  expect(await mongoose.connection.db!.collection('agent_checkpoints').countDocuments()).toBe(0);
});

test('capture and history never select another owner or fall back to latest legacy data', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const id = await write('event-actor/head', 'owner');
  const foreignId = await write('event-actor/head', 'foreign');
  await write('event-actor/head');
  expect(
    (await owner.capture('actor-thread', 'event-actor/head', 'invocation', cfg))?.checkpointId,
  ).toBe(id);
  expect(
    await owner.resolveNamespace(reference('event-actor/head', foreignId), cfg),
  ).toBeUndefined();
  await write('event-actor/legacy');
  expect(await owner.capture('actor-thread', 'event-actor/legacy', 'invocation', cfg)).toBeNull();
  const saver = (await getAgentCheckpointer(cfg))!;
  const listed = [];
  for await (const tuple of saver.list(config('event-actor/head', 'owner')))
    listed.push(tuple.checkpoint.id);
  expect(listed).toEqual([id]);
});

test('an exact legacy head forks into owner-tagged rows without changing SDK references', async () => {
  const saver = (await getAgentCheckpointer(cfg))!;
  const checkpoint = emptyCheckpoint();
  await saver.put(config('event-actor/legacy'), checkpoint, {
    source: 'loop',
    step: 1,
    parents: {},
  });
  const owner = createOwnedActorCheckpoints('owner');
  const fork = await owner.fork(
    reference('event-actor/legacy', checkpoint.id),
    'event-actor/new',
    'next',
    cfg,
  );
  expect(fork).toEqual(reference('event-actor/new', checkpoint.id));
  expect((await owner.capture('actor-thread', 'event-actor/new', 'next', cfg))?.checkpointId).toBe(
    checkpoint.id,
  );
  await owner.removeOwned({ threadId: 'actor-thread', checkpointNs: 'event-actor/new' }, cfg);
  expect(await owner.resolveNamespace(reference('event-actor/legacy', checkpoint.id), cfg)).toBe(
    'event-actor/legacy',
  );
});

test('legacy pending writes preserve overwrite and insert-or-ignore behavior on new-replica resume', async () => {
  const id = await write('event-actor/legacy');
  const saver = (await getAgentCheckpointer(cfg))!;
  const legacy = config('event-actor/legacy', undefined, id);
  await saver.putWrites(legacy, [['messages', 'original']], 'regular');
  const resumed = config('event-actor/legacy', 'owner', id);
  resumed.configurable![LIBRECHAT_LEGACY_CHECKPOINT_KEY] = id;
  await saver.putWrites(resumed, [[INTERRUPT, { id: 'updated' }]], 'task');
  await saver.putWrites(resumed, [['messages', 'replacement']], 'regular');
  const tuple = await saver.getTuple(resumed);
  expect(tuple?.pendingWrites).toEqual(
    expect.arrayContaining([
      ['task', INTERRUPT, { id: 'updated' }],
      ['regular', 'messages', 'original'],
    ]),
  );
  expect(tuple?.pendingWrites).toHaveLength(2);
  const old = await saver.getTuple(legacy);
  expect(old?.pendingWrites).toEqual(tuple?.pendingWrites);
});

test('deletion intent survives topology loss and deletes only exact legacy IDs', async () => {
  const headId = await write('event-actor/legacy-head');
  const pauseId = await write('event-actor/legacy-closed');
  const foreignId = await write('event-actor/legacy-head');
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    subagentThread: {},
    agentEventActor: { checkpoint: reference('event-actor/legacy-head', headId) },
    agentEventActorSuspension: {
      status: 'closed',
      suspension: { checkpoint: reference('event-actor/legacy-closed', pauseId) },
    },
  });
  const intent = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await intent.remember(['actor-thread']);
  await mongoose.connection.db!.collection('conversations').deleteOne({ user: 'owner' });
  const retry = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await retry.cleanup();
  await retry.acknowledge();
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    expect(
      (await mongoose.connection.db!.collection(name).find().toArray()).map(
        (row) => row.checkpoint_id,
      ),
    ).toEqual([foreignId]);
  }
});

test('failed pruning keeps the outbox until exact legacy cleanup succeeds', async () => {
  const owner = createOwnedActorCheckpoints('owner');
  const id = await write('event-actor/prune');
  const nested = await write('event-actor/prune', undefined, 'nested');
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    agentEventActorCleanup: [reference('event-actor/prune', id)],
  });
  jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteOne')
    .mockRejectedValueOnce(new Error('interrupted cleanup'));
  await expect(owner.drain('actor-thread', cfg)).rejects.toThrow('interrupted cleanup');
  jest.restoreAllMocks();
  expect(
    (await mongoose.connection.db!.collection('conversations').findOne({ user: 'owner' }))
      ?.agentEventActorCleanup,
  ).toHaveLength(1);
  await owner.drain('actor-thread', cfg);
  expect(
    (await mongoose.connection.db!.collection('conversations').findOne({ user: 'owner' }))
      ?.agentEventActorCleanup,
  ).toEqual([]);
  expect(
    (await mongoose.connection.db!.collection('agent_checkpoints').find().toArray()).map(
      (row) => row.checkpoint_id,
    ),
  ).toEqual([nested]);
});

test('payload ownership survives missing conversations and partial deletion without a registry', async () => {
  await write('event-actor/head', 'owner');
  await write('event-actor/head', 'foreign');
  jest
    .spyOn(mongoose.mongo.Collection.prototype, 'deleteMany')
    .mockRejectedValueOnce(new Error('partial cleanup'));
  await expect(deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg)).rejects.toThrow(
    'partial cleanup',
  );
  jest.restoreAllMocks();
  await deleteOwnedAgentCheckpoints('owner', undefined, undefined, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    expect(
      (await mongoose.connection.db!.collection(name).find().toArray()).map((row) => row.lc_owner),
    ).toEqual([checkpointOwnerNamespacePrefix('foreign')]);
  }
});

test('deletion intent retains both pre-drain and final historical references', async () => {
  const ns = 'event-actor/drain-snapshot';
  const first = await write(ns);
  await mongoose.connection.db!.collection('conversations').insertOne({
    user: 'owner',
    conversationId: 'actor-thread',
    subagentThread: {},
    agentEventActor: { checkpoint: reference(ns, first) },
  });
  const deletion = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await deletion.remember(['actor-thread']);
  const final = await write(ns);
  await mongoose.connection
    .db!.collection('conversations')
    .updateOne({ user: 'owner' }, { $set: { 'agentEventActor.checkpoint': reference(ns, final) } });
  await deletion.remember(['actor-thread']);
  const unrelated = await write(ns);
  await mongoose.connection.db!.collection('conversations').deleteOne({ user: 'owner' });
  const retry = await openCheckpointDeletion('owner', undefined, 'actor-thread', cfg);
  await retry.cleanup();
  await retry.acknowledge();
  expect(
    (await mongoose.connection.db!.collection('agent_checkpoints').find().toArray()).map(
      (row) => row.checkpoint_id,
    ),
  ).toEqual([unrelated]);
});

test.each(['tagged', 'legacy'])(
  '%s pause survives a mixed-replica re-pause and resume',
  async (initial) => {
    const state = Annotation.Root({
      answers: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
    });
    const saver = (await getAgentCheckpointer(cfg))!;
    const graph = new StateGraph(state)
      .addNode('ask', () => ({ answers: [interrupt('first'), interrupt('second')] }))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile({ checkpointer: saver });
    const owned = config('event-actor/rolling', 'owner');
    const oldReplica = config('event-actor/rolling');
    const firstConfig = initial === 'tagged' ? owned : oldReplica;
    await graph.invoke({ answers: [] }, { ...firstConfig, durability: 'exit' });
    const first = (await saver.getTuple(firstConfig))!;
    expect(first.pendingWrites).not.toHaveLength(0);
    const secondConfig =
      initial === 'tagged'
        ? oldReplica
        : config('event-actor/rolling', 'owner', first.checkpoint.id);
    if (initial === 'legacy')
      secondConfig.configurable![LIBRECHAT_LEGACY_CHECKPOINT_KEY] = first.checkpoint.id;
    await graph.invoke(new Command({ resume: 'one' }), { ...secondConfig, durability: 'exit' });
    if (initial === 'legacy') {
      const captured = await createOwnedActorCheckpoints('owner').capture(
        'actor-thread',
        'event-actor/rolling',
        'invocation',
        cfg,
        'event-actor/rolling',
        first.checkpoint.id,
      );
      expect(captured?.checkpointId).toBe(first.checkpoint.id);
    }
    const paused = await saver.getTuple(oldReplica);
    expect(paused?.checkpoint.id).toBeDefined();
    const resumed = config('event-actor/rolling', 'owner', paused!.checkpoint.id);
    resumed.configurable![LIBRECHAT_LEGACY_CHECKPOINT_KEY] = paused!.checkpoint.id;
    const result = await graph.invoke(new Command({ resume: 'two' }), {
      ...resumed,
      durability: 'exit',
    });
    expect(result.answers).toEqual(['one', 'two']);
    const head = await saver.getTuple(owned);
    expect(head?.checkpoint.channel_values.answers).toEqual(['one', 'two']);
    expect((await saver.getTuple(head!.config))?.checkpoint.id).toBe(head?.checkpoint.id);
  },
);

test('custom checkpoint collections carry owner authority without separate maintenance storage', async () => {
  const custom = {
    ...cfg,
    checkpointCollectionName: 'tenant_cp',
    checkpointWritesCollectionName: 'tenant_writes',
  };
  const saver = (await getAgentCheckpointer(custom))!;
  const cp = emptyCheckpoint();
  const input = config('event-actor/custom', 'owner', cp.id);
  await saver.put(input, cp, { source: 'loop', step: 1, parents: {} });
  await saver.putWrites(input, [[INTERRUPT, 'approval']], 'task');
  for (const name of ['tenant_cp', 'tenant_writes']) {
    const row = await mongoose.connection.db!.collection(name).findOne();
    expect(row?.lc_owner).toBe(checkpointOwnerNamespacePrefix('owner'));
    expect(row?.upserted_at).toBeInstanceOf(Date);
  }
  expect(
    await mongoose.connection.db!.listCollections({ name: /_actor_owners$/ }).toArray(),
  ).toHaveLength(0);
  await deleteOwnedAgentCheckpoints('owner', undefined, undefined, custom);
  expect(await mongoose.connection.db!.collection('tenant_cp').countDocuments()).toBe(0);
  expect(await mongoose.connection.db!.collection('tenant_writes').countDocuments()).toBe(0);
});
