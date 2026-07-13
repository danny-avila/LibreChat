import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { emptyCheckpoint, ERROR, INTERRUPT } from '@langchain/langgraph-checkpoint';
import {
  getAgentCheckpointer,
  deleteAgentCheckpoint,
  deleteAgentCheckpoints,
  LazyMongoSaver,
  CheckpointTooLargeError,
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

  it('deleteAgentCheckpoints bulk-prunes exactly the given threads (checkpoints AND writes)', async () => {
    // The bulk path behind conversation deletion / delete-all / account deletion:
    // one $in deleteMany per collection instead of two round-trips per thread.
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadA = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const threadB = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const threadC = `convo-${new mongoose.Types.ObjectId().toString()}`;

    await seedInterruptCheckpoint(saver!, threadA);
    await seedInterruptCheckpoint(saver!, threadB);
    await seedInterruptCheckpoint(saver!, threadC);

    // Falsy entries are skipped rather than widening the delete.
    await deleteAgentCheckpoints([threadA, undefined, threadB, null], MONGO_CFG);

    expect(await saver!.getTuple(readConfig(threadA))).toBeUndefined();
    expect(await saver!.getTuple(readConfig(threadB))).toBeUndefined();
    expect(await saver!.getTuple(readConfig(threadC))).toBeDefined();

    const db = mongoose.connection.db!;
    const writesFilter = { thread_id: { $in: [threadA, threadB] } };
    expect(await db.collection('agent_checkpoints').countDocuments(writesFilter)).toBe(0);
    expect(await db.collection('agent_checkpoint_writes').countDocuments(writesFilter)).toBe(0);
    // The untouched thread keeps its interrupt write row.
    expect(
      await db.collection('agent_checkpoint_writes').countDocuments({ thread_id: threadC }),
    ).toBe(1);
  });

  it('deleteAgentCheckpoints is a no-op for an empty or all-falsy list', async () => {
    await expect(deleteAgentCheckpoints([], MONGO_CFG)).resolves.toBeUndefined();
    await expect(deleteAgentCheckpoints([undefined, null], MONGO_CFG)).resolves.toBeUndefined();
    await expect(deleteAgentCheckpoints(undefined, MONGO_CFG)).resolves.toBeUndefined();
  });
});

describe('LazyMongoSaver (lazy persistence — mongodb-memory-server)', () => {
  it('does NOT persist a clean-exit checkpoint (a bare put with no pending writes)', async () => {
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { config, checkpoint, metadata } = putArgs(threadId);

    // A non-paused run's exit put — no preceding putWrites.
    await saver!.put(config, checkpoint, metadata);

    expect(await saver!.getTuple(readConfig(threadId))).toBeUndefined();
    const count = await mongoose.connection
      .db!.collection('agent_checkpoints')
      .countDocuments({ thread_id: threadId });
    expect(count).toBe(0);
  });

  it('persists a checkpoint anchored by a NON-interrupt write (delta-channel safety)', async () => {
    // K1/K3: a delta-channel graph can putWrites on a checkpoint that an interrupt
    // checkpoint then depends on — even without the __interrupt__ marker. A write on a
    // real (non-`__`-prefixed) channel must anchor its checkpoint so resume can walk the chain.
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { config, checkpoint, metadata } = putArgs(threadId);
    await saver!.putWrites(
      { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
      [['some_delta_channel', { msgs: ['delta'] }]],
      'task-1',
    );
    await saver!.put(config, checkpoint, metadata);

    expect(await saver!.getTuple(readConfig(threadId))).toBeDefined();
  });

  it('does NOT persist an error-only checkpoint OR its write row (failed non-paused turn — no leak)', async () => {
    // A turn that throws before any pause records a pending write on the `__error__`
    // bookkeeping channel, then a `put` (probe-confirmed against @langchain/langgraph). That
    // checkpoint is never HITL-resumable, so the lazy saver must leave NOTHING durable: the
    // bookkeeping batch is PARKED (not forwarded) until the checkpoint's fate is known, and the
    // discarding `put` drops both — no dead checkpoint, no orphan row in the writes collection.
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { config, checkpoint, metadata } = putArgs(threadId);
    await saver!.putWrites(
      { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
      [[ERROR, 'boom']], // '__error__' — bookkeeping channel, not resumable
      'task-1',
    );
    await saver!.put(config, checkpoint, metadata);

    expect(await saver!.getTuple(readConfig(threadId))).toBeUndefined();
    const db = mongoose.connection.db!;
    expect(await db.collection('agent_checkpoints').countDocuments({ thread_id: threadId })).toBe(
      0,
    );
    expect(
      await db.collection('agent_checkpoint_writes').countDocuments({ thread_id: threadId }),
    ).toBe(0);
  });

  it('preserves bookkeeping writes on a RETAINED checkpoint, in either arrival order', async () => {
    // Codex M2 (probe-confirmed): when one Send-sibling interrupts, siblings that completed
    // without state updates are recorded as `__no_writes__` pending writes on the SAME retained
    // checkpoint. Those markers must persist — dropping them makes LangGraph re-execute the
    // completed siblings on resume (duplicated side effects). The saver parks bookkeeping
    // batches until the checkpoint is anchored, so both orders must end durable.
    const NO_WRITES = '__no_writes__'; // langgraph constants.NO_WRITES (runner marker)
    const saver = await getAgentCheckpointer(MONGO_CFG);

    const runOrder = async (bookkeepingFirst: boolean) => {
      const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
      const { config, checkpoint, metadata } = putArgs(threadId);
      const writeCfg = {
        configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id },
      };
      const bookkeeping = () => saver!.putWrites(writeCfg, [[NO_WRITES, null]], 'task-sibling');
      const anchor = () => saver!.putWrites(writeCfg, [[INTERRUPT, 'approve?']], 'task-gate');
      if (bookkeepingFirst) {
        await bookkeeping();
        await anchor();
      } else {
        await anchor();
        await bookkeeping();
      }
      await saver!.put(config, checkpoint, metadata);

      const tuple = await saver!.getTuple(readConfig(threadId));
      expect(tuple).toBeDefined();
      const channels = (tuple?.pendingWrites ?? []).map((w) => w[1]);
      expect(channels).toContain(INTERRUPT);
      expect(channels).toContain(NO_WRITES);
    };

    await runOrder(true); // parked, then flushed by the anchoring batch
    await runOrder(false); // forwarded directly (checkpoint already anchored)
  });

  it('un-anchors a checkpoint whose putWrites failed (no phantom pause persisted)', async () => {
    // A transient Mongo failure while writing the interrupt batch must not leave a persisted
    // checkpoint with MISSING pending writes: LangGraph dispatches the matching `put`
    // concurrently with `putWrites` (probe-confirmed), so the failed batch's anchor is removed
    // on rejection and that `put` discards the checkpoint instead of saving a phantom pause.
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { config, checkpoint, metadata } = putArgs(threadId);

    const spy = jest
      .spyOn(MongoDBSaver.prototype, 'putWrites')
      .mockRejectedValueOnce(new Error('transient mongo failure'));
    try {
      await expect(
        saver!.putWrites(
          {
            configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id },
          },
          [[INTERRUPT, 'approve?']],
          'task-1',
        ),
      ).rejects.toThrow('transient mongo failure');
    } finally {
      spy.mockRestore();
    }

    // The `put` LangGraph issues for that checkpoint finds no anchor → discarded.
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

  it('end-to-end: a real graph that THROWS before pausing persists no checkpoint', async () => {
    // F2: a failed non-paused turn records an `__error__` pending write + a put. The lazy
    // saver must discard it so a conversation that errors (and is never retried) leaves nothing
    // durable behind — the clean-path prune that used to catch this was removed.
    const { StateGraph, START, END, Annotation } = await import('@langchain/langgraph');
    const saver = await getAgentCheckpointer(MONGO_CFG);
    const coll = mongoose.connection.db!.collection('agent_checkpoints');

    const State = Annotation.Root({ x: Annotation });
    const boomGraph = new StateGraph(State)
      .addNode('a', () => {
        throw new Error('boom');
      })
      .addEdge(START, 'a')
      .addEdge('a', END)
      .compile({ checkpointer: saver as never });

    const tErr = `convo-${new mongoose.Types.ObjectId().toString()}`;
    await expect(
      boomGraph.invoke({ x: 'start' }, { configurable: { thread_id: tErr }, durability: 'exit' }),
    ).rejects.toThrow('boom');

    // Nothing durable: neither the checkpoint nor an orphan row in the writes collection.
    expect(await coll.countDocuments({ thread_id: tErr })).toBe(0);
    const writesColl = mongoose.connection.db!.collection('agent_checkpoint_writes');
    expect(await writesColl.countDocuments({ thread_id: tErr })).toBe(0);
  });

  it('end-to-end: an interrupt persists, then resumes to completion with the approval value', async () => {
    // Guards the `putWrites` change: the `__interrupt__` write must still be forwarded (it is
    // resumable) so a paused run rehydrates and the resume value flows in. Mirrors the real HITL
    // round-trip across a fresh `invoke` on the same thread_id.
    const { StateGraph, START, END, interrupt, Annotation, Command } = await import(
      '@langchain/langgraph'
    );
    const saver = await getAgentCheckpointer(MONGO_CFG);

    const State = Annotation.Root({ approved: Annotation });
    const graph = new StateGraph(State)
      .addNode('gate', () => ({ approved: interrupt('approve?') }))
      .addNode('done', () => ({}))
      .addEdge(START, 'gate')
      .addEdge('gate', 'done')
      .addEdge('done', END)
      .compile({ checkpointer: saver as never });

    const thread = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const cfg = { configurable: { thread_id: thread }, durability: 'exit' as const };

    // Pause at the interrupt.
    await graph.invoke({ approved: null }, cfg);
    const paused = await graph.getState(cfg);
    expect(paused.next.length).toBeGreaterThan(0);

    // Resume with the approval — the paused run rehydrates from the durable interrupt checkpoint.
    const out = await graph.invoke(new Command({ resume: 'YES' }), cfg);
    expect(out.approved).toBe('YES');
  });

  it('end-to-end: completed Send-siblings are NOT re-executed after a pause (no duplicate side effects)', async () => {
    // Codex M2 end-to-end: a Send fan-out where 'b' pauses for approval while 'a'/'c' complete
    // with side effects but NO state writes (→ `__no_writes__` markers on the retained
    // checkpoint). On resume — through a REBUILT graph, as resume.js rebuilds the Run — the
    // completed siblings must not run again. Before the buffering fix this probe measured
    // effects {a:2, c:2}: the dropped markers made LangGraph re-execute both siblings.
    const { StateGraph, START, END, interrupt, Annotation, Send, Command } = await import(
      '@langchain/langgraph'
    );
    const saver = await getAgentCheckpointer(MONGO_CFG);

    const effects: Record<string, number> = {};
    const State = Annotation.Root({
      items: Annotation({ reducer: (a: string[], b: string[]) => (a ?? []).concat(b ?? []) }),
      results: Annotation({ reducer: (a: string[], b: string[]) => (a ?? []).concat(b ?? []) }),
    });
    const build = () =>
      new StateGraph(State)
        .addNode('fan', () => ({}))
        .addNode('work', (s: { item?: string }) => {
          if (s.item === 'b') {
            return { results: [`b:${interrupt('approve b?')}`] };
          }
          effects[s.item!] = (effects[s.item!] ?? 0) + 1; // side effect, no state update
          return {}; // no channel writes → langgraph records a `__no_writes__` marker
        })
        .addConditionalEdges(
          'fan',
          (s) => s.items.map((i: string) => new Send('work', { item: i })),
          ['work'],
        )
        .addEdge(START, 'fan')
        .addEdge('work', END)
        .compile({ checkpointer: saver as never });

    const thread = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const cfg = { configurable: { thread_id: thread }, durability: 'exit' as const };

    await build().invoke({ items: ['a', 'b', 'c'], results: [] }, cfg); // pauses on 'b'
    expect(effects).toEqual({ a: 1, c: 1 });

    // Resume on a REBUILT graph sharing the durable saver (mirrors resume.js).
    const out = await build().invoke(new Command({ resume: 'YES' }), cfg);
    expect(out.results).toEqual(['b:YES']);
    expect(effects).toEqual({ a: 1, c: 1 }); // siblings did NOT re-execute
  });
});

describe('LazyMongoSaver checkpoint size guard (mongodb-memory-server integration)', () => {
  // Guards the single-document ceiling: a checkpoint embeds the whole message history, so a
  // large conversation can serialize past MongoDB's 16 MB limit. The guard measures the
  // serialized state on the persist path, WARNS past a soft threshold, and REJECTS past a hard
  // limit BEFORE the write — a typed CheckpointTooLargeError instead of a raw BSONObjectTooLarge.
  // Thresholds are shrunk here so payloads stay tiny while exercising the real serde + Mongo.
  const clientForSaver = () =>
    // mongoose vends the live MongoClient; the driver type resolves to a different `mongodb` copy
    // than checkpoint-mongodb's, so the cast mirrors buildMongoSaver in checkpointer.ts.
    mongoose.connection.getClient() as unknown as ConstructorParameters<
      typeof MongoDBSaver
    >[0]['client'];

  const makeSaver = (overrides?: { warnBytes?: number; hardLimitBytes?: number }) =>
    new LazyMongoSaver({
      client: clientForSaver(),
      checkpointCollectionName: 'agent_checkpoints',
      checkpointWritesCollectionName: 'agent_checkpoint_writes',
      ttl: 3600,
      ...overrides,
    });

  /** Seed an interrupt anchor for a checkpoint whose serialized state is inflated to ~`payloadBytes`. */
  async function seedSizedInterrupt(saver: LazyMongoSaver, threadId: string, payloadBytes: number) {
    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = { messages: 'x'.repeat(payloadBytes) };
    await saver.putWrites(
      { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
      [[INTERRUPT, 'approve?']],
      'task-1',
    );
    const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
    const metadata = { source: 'input' as const, step: -1, writes: null, parents: {} };
    return { checkpoint, config, metadata };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists a checkpoint under the soft threshold', async () => {
    const saver = makeSaver({ warnBytes: 5_000, hardLimitBytes: 50_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { checkpoint, config, metadata } = await seedSizedInterrupt(saver, threadId, 100);

    await saver.put(config, checkpoint, metadata);

    expect(await saver.getTuple(readConfig(threadId))).toBeDefined();
  });

  it('persists but WARNS when a checkpoint crosses the soft threshold', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const saver = makeSaver({ warnBytes: 500, hardLimitBytes: 50_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { checkpoint, config, metadata } = await seedSizedInterrupt(saver, threadId, 2_000);

    await saver.put(config, checkpoint, metadata);

    expect(await saver.getTuple(readConfig(threadId))).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('soft threshold'));
  });

  it('REFUSES to persist and throws CheckpointTooLargeError over the hard limit', async () => {
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const saver = makeSaver({ warnBytes: 500, hardLimitBytes: 2_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const { checkpoint, config, metadata } = await seedSizedInterrupt(saver, threadId, 10_000);

    await expect(saver.put(config, checkpoint, metadata)).rejects.toBeInstanceOf(
      CheckpointTooLargeError,
    );

    // Nothing durable was written for that thread — getTuple reads the checkpoint document.
    expect(await saver.getTuple(readConfig(threadId))).toBeUndefined();
    expect(
      await mongoose.connection.db!.collection('agent_checkpoints').countDocuments({
        thread_id: threadId,
      }),
    ).toBe(0);
  });

  it('counts metadata toward the ceiling — refuses when the checkpoint is under but metadata pushes over', async () => {
    // MongoDBSaver stores the serialized checkpoint AND metadata in one document, so a
    // just-under-limit checkpoint with large metadata still overflows. The guard must catch it
    // as a typed CheckpointTooLargeError, not let it fall through to a raw BSONObjectTooLarge.
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const saver = makeSaver({ warnBytes: 500, hardLimitBytes: 2_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;

    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = { messages: 'x'.repeat(400) }; // checkpoint alone well UNDER 2 KB
    await saver.putWrites(
      { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
      [[INTERRUPT, 'approve?']],
      'task-1',
    );
    const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
    // Metadata alone pushes checkpoint + metadata over the 2 KB hard limit.
    const metadata = {
      source: 'input' as const,
      step: -1,
      writes: { payload: 'y'.repeat(4_000) },
      parents: {},
    };

    await expect(saver.put(config, checkpoint, metadata)).rejects.toBeInstanceOf(
      CheckpointTooLargeError,
    );
    expect(await saver.getTuple(readConfig(threadId))).toBeUndefined();
  });

  it('counts metadata_search (the raw metadata copy) — refuses when serialized-only would pass', async () => {
    // MongoDBSaver stores `metadata_search: metadata` — the WHOLE raw metadata a
    // SECOND time in the same document. Sized so checkpoint + serialized metadata is
    // UNDER the limit but adding the raw metadata_search copy pushes it over: the guard
    // must count that copy, else the doc slips the preflight and overflows on the wire.
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const saver = makeSaver({ warnBytes: 500, hardLimitBytes: 6_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;

    const checkpoint = emptyCheckpoint();
    checkpoint.channel_values = { messages: 'x'.repeat(200) };
    await saver.putWrites(
      { configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id } },
      [[INTERRUPT, 'approve?']],
      'task-1',
    );
    const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
    // ~3 KB metadata: checkpoint + serialized metadata (~3.2 KB) is under 6 KB, but the
    // raw metadata_search copy (~another 3 KB) pushes checkpoint+metadata+metadata_search
    // over 6 KB. The pre-fix guard (checkpoint + serialized metadata only) would pass here.
    const metadata = {
      source: 'loop' as const,
      step: 1,
      writes: { payload: 'y'.repeat(3_000) },
      parents: {},
    };

    await expect(saver.put(config, checkpoint, metadata)).rejects.toBeInstanceOf(
      CheckpointTooLargeError,
    );
    expect(await saver.getTuple(readConfig(threadId))).toBeUndefined();
  });

  it('flushes bookkeeping parked during the size-serialization window (not dropped on resume)', async () => {
    // `put` consumes the write anchor, then AWAITS `assertCheckpointFitsDocument` (serialization).
    // A bookkeeping-only putWrites dispatched in that window sees no anchor and no persisted
    // marker, so it parks — and must be flushed once the checkpoint persists, or a resume
    // re-executes the completed sibling.
    const NO_WRITES = '__no_writes__';
    const saver = makeSaver({ warnBytes: 5_000, hardLimitBytes: 50_000 });
    await saver.setup();
    const threadId = `convo-${new mongoose.Types.ObjectId().toString()}`;
    const checkpoint = emptyCheckpoint();
    const writeCfg = {
      configurable: { thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpoint.id },
    };
    await saver.putWrites(writeCfg, [[INTERRUPT, 'approve?']], 'task-gate');

    // Pause the checkpoint serialization inside `put` so the bookkeeping batch lands mid-window.
    const serde = (saver as unknown as { serde: { dumpsTyped: (v: unknown) => unknown } }).serde;
    const realDumps = serde.dumpsTyped.bind(serde);
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let paused = false;
    jest.spyOn(serde, 'dumpsTyped').mockImplementation(async (value: unknown) => {
      if (!paused) {
        paused = true;
        await gate; // hold inside assertCheckpointFitsDocument (anchor consumed, not yet persisted)
      }
      return realDumps(value);
    });

    const config = { configurable: { thread_id: threadId, checkpoint_ns: '' } };
    const metadata = { source: 'input' as const, step: -1, writes: null, parents: {} };
    const putPromise = saver.put(config, checkpoint, metadata); // suspends at the gate
    await saver.putWrites(writeCfg, [[NO_WRITES, null]], 'task-sibling'); // parks in the window
    releaseGate();
    await putPromise;

    const tuple = await saver.getTuple(readConfig(threadId));
    const channels = (tuple?.pendingWrites ?? []).map((w) => w[1]);
    expect(channels).toContain(INTERRUPT);
    expect(channels).toContain(NO_WRITES); // flushed, not dropped
  });
});
