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
  ).toBe(owner.namespace('event-actor/missing'));
  await owner.remove(source, cfg);
  await owner.remove({ ...source, checkpointNs: 'event-actor/new' }, cfg);
  for (const name of ['agent_checkpoints', 'agent_checkpoint_writes']) {
    expect(await mongoose.connection.db!.collection(name).countDocuments()).toBe(0);
  }
});
