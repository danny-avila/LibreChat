import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import type { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import {
  getAgentCheckpointer,
  deleteAgentCheckpoint,
  __resetCheckpointerForTests,
} from './checkpointer';

/**
 * Integration tests for the durable Mongo checkpointer seam, against a real
 * (in-memory) MongoDB. The unit spec covers config/selection with no connection;
 * this proves the part that actually matters for correctness — that a checkpoint
 * written for a thread can be read back and that `deleteAgentCheckpoint` truly
 * prunes it (the cross-turn isolation guarantee), scoped to a single thread.
 */

const MONGO_CFG = { type: 'mongo' as const, ttl: 3600 };

/** Minimal LangGraph put() args for an empty checkpoint under a thread. */
function putArgs(threadId: string) {
  const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
  const metadata = { source: 'input' as const, step: -1, writes: null, parents: {} };
  return { config, checkpoint: emptyCheckpoint(), metadata };
}

const readConfig = (threadId: string) => ({
  configurable: { thread_id: threadId, checkpoint_ns: '' },
});

/**
 * Persist a checkpoint the way LangGraph does on a PAUSE: an interrupt `putWrites` on the
 * `INTERRUPT` channel for the checkpoint id, then `put` of that checkpoint. The lazy saver
 * persists only checkpoints seeded this way (a bare `put` is a clean exit → discarded).
 */
async function seedInterruptCheckpoint(saver: MongoDBSaver, threadId: string) {
  const { config, checkpoint, metadata } = putArgs(threadId);
  await saver.putWrites(
    { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
    [[INTERRUPT, 'approve?']],
    'task-1',
  );
  await saver.put(config, checkpoint, metadata);
  return checkpoint;
}

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  // Force a fresh saver build (+ setup) against the live connection each test.
  __resetCheckpointerForTests();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('checkpointer (mongodb-memory-server integration)', () => {
  it('builds a real MongoDBSaver when Mongo is connected', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    expect(saver).toBeDefined();
    // setup() created the checkpoint collection with a TTL index on `upserted_at`.
    const indexes = await mongoose.connection.db!.collection('agent_checkpoints').indexes();
    const ttlIndex = indexes.find((idx) => idx.expireAfterSeconds != null);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(3600);
  });

  it('returns undefined for the memory type (SDK MemorySaver fallback) even when connected', async () => {
    expect(await getAgentCheckpointer({ type: 'memory' })).toBeUndefined();
  });

  it('memoizes one saver per resolved config', async () => {
    const a = await getAgentCheckpointer(MONGO_CFG);
    const b = await getAgentCheckpointer(MONGO_CFG);
    expect(a).toBe(b);
  });

  it('deleteAgentCheckpoint prunes a thread’s persisted checkpoint', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    expect(saver).toBeDefined();

    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    await seedInterruptCheckpoint(saver!, threadId);

    // The checkpoint is durably readable before pruning…
    expect(await saver!.getTuple(readConfig(threadId))).toBeDefined();

    await deleteAgentCheckpoint(threadId, MONGO_CFG);

    // …and gone after (so turn N+1 on the same conversationId can't rehydrate it).
    expect(await saver!.getTuple(readConfig(threadId))).toBeUndefined();
  });

  it('prunes only the targeted thread, leaving other conversations intact', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadA = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const threadB = `convo-${new mongoose.Types.ObjectId().toString()}`;

    await seedInterruptCheckpoint(saver!, threadA);
    await seedInterruptCheckpoint(saver!, threadB);

    await deleteAgentCheckpoint(threadA, MONGO_CFG);

    expect(await saver!.getTuple(readConfig(threadA))).toBeUndefined();
    expect(await saver!.getTuple(readConfig(threadB))).toBeDefined();
  });

  it('deleteAgentCheckpoint is a no-op for an undefined threadId', async () => {
    await expect(deleteAgentCheckpoint(undefined, MONGO_CFG)).resolves.toBeUndefined();
  });
});

describe('InterruptOnlyMongoSaver (lazy persistence — mongodb-memory-server)', () => {
  it('does NOT persist a clean-exit checkpoint (a bare put with no interrupt write)', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { config, checkpoint, metadata } = putArgs(threadId);

    // A non-paused run's exit put — no preceding interrupt putWrites.
    await saver!.put(config, checkpoint, metadata);

    expect(await saver!.getTuple(readConfig(threadId))).toBeUndefined();
    const count = await mongoose.connection
      .db!.collection('agent_checkpoints')
      .countDocuments({ thread_id: threadId });
    expect(count).toBe(0);
  });

  it('persists an interrupt checkpoint and carries its __interrupt__ pending write', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    await seedInterruptCheckpoint(saver!, threadId);

    const tuple = await saver!.getTuple(readConfig(threadId));
    expect(tuple).toBeDefined();
    // pendingWrites entries are [taskId, channel, value]; the interrupt is on INTERRUPT.
    expect((tuple?.pendingWrites ?? []).some((w) => w[1] === INTERRUPT)).toBe(true);
  });

  it('end-to-end: a real graph writes nothing on a clean run, a checkpoint on interrupt', async () => {
    const { StateGraph, START, END, interrupt, Annotation } = await import('@langchain/langgraph');
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const coll = mongoose.connection.db!.collection('agent_checkpoints');

    const State = Annotation.Root({ x: Annotation });
    const build = (withInterrupt: boolean) =>
      new StateGraph(State)
        .addNode('a', () => {
          if (withInterrupt) {
            interrupt('approve?');
          }
          return { x: 'done' };
        })
        .addEdge(START, 'a')
        .addEdge('a', END)
        // version skew between checkpoint-mongodb's BaseCheckpointSaver and langgraph's.
        .compile({ checkpointer: saver as never });

    // Clean run → nothing persisted.
    const tClean = `convo-${new mongoose.Types.ObjectId().toString()}`;
    await build(false).invoke(
      { x: 'start' },
      { configurable: { thread_id: tClean }, durability: 'exit' },
    );
    expect(await coll.countDocuments({ thread_id: tClean })).toBe(0);

    // Interrupt run → a checkpoint is persisted and the graph reports a pending pause.
    const tPause = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const pauseGraph = build(true);
    await pauseGraph.invoke(
      { x: 'start' },
      { configurable: { thread_id: tPause }, durability: 'exit' },
    );
    expect(await coll.countDocuments({ thread_id: tPause })).toBeGreaterThan(0);
    const state = await pauseGraph.getState({ configurable: { thread_id: tPause } });
    expect(state.next.length).toBeGreaterThan(0); // the interrupted node is still pending → resumable
  });
});
