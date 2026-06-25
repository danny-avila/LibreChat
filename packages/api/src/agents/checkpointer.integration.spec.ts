import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint';
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
    const { config, checkpoint, metadata } = putArgs(threadId);
    await saver!.put(config, checkpoint, metadata);

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

    const a = putArgs(threadA);
    const b = putArgs(threadB);
    await saver!.put(a.config, a.checkpoint, a.metadata);
    await saver!.put(b.config, b.checkpoint, b.metadata);

    await deleteAgentCheckpoint(threadA, MONGO_CFG);

    expect(await saver!.getTuple(readConfig(threadA))).toBeUndefined();
    expect(await saver!.getTuple(readConfig(threadB))).toBeDefined();
  });

  it('deleteAgentCheckpoint is a no-op for an undefined threadId', async () => {
    await expect(deleteAgentCheckpoint(undefined, MONGO_CFG)).resolves.toBeUndefined();
  });
});
