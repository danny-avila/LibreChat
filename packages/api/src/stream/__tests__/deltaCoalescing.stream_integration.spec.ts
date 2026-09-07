/* eslint jest/no-standalone-expect: ["error", { "additionalTestBlockFunctions": ["testRedis"] }] */
import type { Redis, Cluster } from 'ioredis';
import type { emitChunkWithReceipt as EmitChunkWithReceipt } from '~/stream/internal/chunkPublication';
import type { ServerSentEvent } from '~/types';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { createStreamServices } from '~/stream/createStreamServices';

jest.spyOn(console, 'log').mockImplementation();

/**
 * Integration tests for streaming-delta coalescing (STREAM_DELTA_COALESCE_MS > 0).
 *
 * Coalescing batches eligible delta publications (and their durable appends) into
 * one windowed frame while preserving per-event sequences, barrier ordering,
 * terminal flushing, and the generation fence.
 *
 * Run with: USE_REDIS=true npx jest deltaCoalescing.stream_integration
 */
describe('Delta coalescing integration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let ioredisClient: Redis | Cluster | null = null;
  const testPrefix = 'DeltaCoalescing-Integration-Test';
  const redisConfigured = process.env.USE_REDIS === 'true';
  const testRedis = redisConfigured ? test : test.skip;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX = testPrefix;
    process.env.STREAM_DELTA_COALESCE_MS = '25';

    jest.resetModules();
    const redisModule = await import('~/cache/redisClients');
    ioredisClient = redisModule.ioredisClient;
  });

  afterEach(async () => {
    if (ioredisClient) {
      try {
        const keys = await ioredisClient.keys(`${testPrefix}*`);
        const streamKeys = await ioredisClient.keys(`stream:*`);
        await Promise.all([...keys, ...streamKeys].map((key) => ioredisClient!.del(key)));
      } catch {
        /* ignore */
      }
    }
  });

  afterAll(async () => {
    if (ioredisClient) {
      try {
        await ioredisClient.quit();
      } catch {
        try {
          ioredisClient.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
    process.env = originalEnv;
  });

  function createRedisManager(): GenerationJobManagerClass {
    const manager = new GenerationJobManagerClass();
    manager.configure(
      createStreamServices({
        useRedis: true,
        redisClient: ioredisClient!,
      }),
    );
    manager.initialize();
    return manager;
  }

  /** The dynamically imported transport registers its receipt capability in its
   * own module registry; the receipt helper must come from that same registry. */
  async function importFreshTransportModules(): Promise<{
    RedisEventTransport: typeof import('../implementations/RedisEventTransport').RedisEventTransport;
    emitChunkWithReceipt: typeof EmitChunkWithReceipt;
  }> {
    const [{ RedisEventTransport }, { emitChunkWithReceipt }] = await Promise.all([
      import('../implementations/RedisEventTransport'),
      import('~/stream/internal/chunkPublication'),
    ]);
    return { RedisEventTransport, emitChunkWithReceipt };
  }

  async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for condition');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  testRedis(
    'delivers a coalesced window as individually sequenced chunks in order',
    async () => {
      const { RedisEventTransport, emitChunkWithReceipt } = await importFreshTransportModules();
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient!, subscriber);
      const streamId = `coalesce-order-${Date.now()}`;

      const received: unknown[] = [];
      const rawSubscriber = (ioredisClient as Redis).duplicate();
      const rawFrames: Array<{ type: string; count?: number }> = [];
      rawSubscriber.on('message', (_channel: string, message: string) => {
        const parsed = JSON.parse(message) as { type: string; events?: unknown[] };
        rawFrames.push({ type: parsed.type, count: parsed.events?.length });
      });
      await rawSubscriber.subscribe(`stream:{${streamId}}:events`);

      const subscription = transport.subscribe(streamId, {
        onChunk: (event) => received.push(event),
      });
      await subscription.ready;

      const receipts = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          emitChunkWithReceipt(
            transport,
            streamId,
            { event: 'on_message_delta', data: { i } },
            undefined,
            { coalesce: true },
          ),
        ),
      );

      await waitFor(() => received.length === 5);
      expect(received.map((event) => (event as { data: { i: number } }).data.i)).toEqual([
        0, 1, 2, 3, 4,
      ]);
      const sequences = receipts.filter((value): value is number => typeof value === 'number');
      expect(sequences).toHaveLength(5);
      for (let i = 1; i < sequences.length; i++) {
        expect(sequences[i]).toBe(sequences[0] + i);
      }
      const batchFrames = rawFrames.filter((frame) => frame.type === 'chunk_batch');
      expect(batchFrames).toHaveLength(1);
      expect(batchFrames[0].count).toBe(5);

      subscription.unsubscribe();
      transport.destroy();
      rawSubscriber.disconnect();
    },
    15000,
  );

  testRedis(
    'a non-coalescable publication is a barrier that preserves emission order',
    async () => {
      const { RedisEventTransport, emitChunkWithReceipt } = await importFreshTransportModules();
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient!, subscriber);
      const streamId = `coalesce-barrier-${Date.now()}`;

      const received: Array<{ event: string; data: { label: string } }> = [];
      const subscription = transport.subscribe(streamId, {
        onChunk: (event) => received.push(event as (typeof received)[number]),
      });
      await subscription.ready;

      const first = emitChunkWithReceipt(
        transport,
        streamId,
        { event: 'on_message_delta', data: { label: 'delta-1' } },
        undefined,
        { coalesce: true },
      );
      const second = emitChunkWithReceipt(
        transport,
        streamId,
        { event: 'on_message_delta', data: { label: 'delta-2' } },
        undefined,
        { coalesce: true },
      );
      const barrier = emitChunkWithReceipt(transport, streamId, {
        event: 'on_run_step',
        data: { label: 'barrier' },
      });
      const trailing = emitChunkWithReceipt(
        transport,
        streamId,
        { event: 'on_message_delta', data: { label: 'delta-3' } },
        undefined,
        { coalesce: true },
      );

      const [firstSeq, secondSeq, barrierSeq, trailingSeq] = await Promise.all([
        first,
        second,
        barrier,
        trailing,
      ]);
      await waitFor(() => received.length === 4);

      expect(received.map((event) => event.data.label)).toEqual([
        'delta-1',
        'delta-2',
        'barrier',
        'delta-3',
      ]);
      expect([firstSeq, secondSeq, barrierSeq, trailingSeq]).toEqual([
        firstSeq,
        (firstSeq as number) + 1,
        (firstSeq as number) + 2,
        (firstSeq as number) + 3,
      ]);

      subscription.unsubscribe();
      transport.destroy();
    },
    15000,
  );

  testRedis(
    'emitDone flushes the pending window ahead of the terminal frame',
    async () => {
      const { RedisEventTransport, emitChunkWithReceipt } = await importFreshTransportModules();
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient!, subscriber);
      const streamId = `coalesce-done-${Date.now()}`;

      const order: string[] = [];
      const subscription = transport.subscribe(streamId, {
        onChunk: (event) => order.push((event as { data: { label: string } }).data.label),
        onDone: () => order.push('done'),
      });
      await subscription.ready;

      const receipts = ['tail-1', 'tail-2', 'tail-3'].map((label) =>
        emitChunkWithReceipt(
          transport,
          streamId,
          { event: 'on_message_delta', data: { label } },
          undefined,
          { coalesce: true },
        ),
      );
      await transport.emitDone(streamId, { final: true });
      await Promise.all(receipts);

      await waitFor(() => order.length === 4);
      expect(order).toEqual(['tail-1', 'tail-2', 'tail-3', 'done']);

      subscription.unsubscribe();
      transport.destroy();
    },
    15000,
  );

  testRedis(
    'a replaced generation fences the whole pending window',
    async () => {
      const { RedisEventTransport, emitChunkWithReceipt } = await importFreshTransportModules();
      const { RedisJobStore } = await import('../implementations/RedisJobStore');
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient!, subscriber);
      const store = new RedisJobStore(ioredisClient!);
      const streamId = `coalesce-fence-${Date.now()}`;

      const created = await store.createJob(streamId, 'user-1', streamId);
      const staleGenerationId = created.createdAt - 1000;

      const receipts = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          emitChunkWithReceipt(
            transport,
            streamId,
            { event: 'on_message_delta', data: { i } },
            staleGenerationId,
            { coalesce: true },
          ),
        ),
      );

      expect(receipts).toEqual([false, false, false]);

      transport.destroy();
      await store.destroy();
    },
    15000,
  );

  testRedis(
    'a throwing subscriber callback loses one event, not the rest of the batch',
    async () => {
      const { RedisEventTransport, emitChunkWithReceipt } = await importFreshTransportModules();
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient!, subscriber);
      const streamId = `coalesce-throwing-${Date.now()}`;

      const received: number[] = [];
      let done = false;
      const subscription = transport.subscribe(streamId, {
        onChunk: (event) => {
          const value = (event as { data: { i: number } }).data.i;
          if (value === 1) {
            throw new Error('subscriber exploded on event 1');
          }
          received.push(value);
        },
        onDone: () => {
          done = true;
        },
      });
      await subscription.ready;

      const receipts = Array.from({ length: 4 }, (_, i) =>
        emitChunkWithReceipt(
          transport,
          streamId,
          { event: 'on_message_delta', data: { i } },
          undefined,
          { coalesce: true },
        ),
      );
      await transport.emitDone(streamId, { final: true });
      await Promise.all(receipts);

      /** Event 1's sequence stalls the reorder cursor exactly like a lost
       * individual frame; the force-flush recovers the remaining events and
       * the terminal after REORDER_TIMEOUT_MS. What must NOT happen is the
       * batch tail (2, 3) vanishing without ever entering the buffer. */
      await waitFor(() => done, 3000);
      expect(received).toEqual([0, 2, 3]);

      subscription.unsubscribe();
      transport.destroy();
    },
    15000,
  );

  testRedis(
    'abort with a pending window delivers the tail without error-closing subscribers',
    async () => {
      const manager = createRedisManager();
      const streamId = `coalesce-abort-${Date.now()}`;
      await manager.createJob(streamId, 'user-1', streamId);

      const received: string[] = [];
      const errors: string[] = [];
      const subscription = await manager.subscribe(
        streamId,
        (event) => {
          const data = (event as { data?: { delta?: { content?: Array<{ text?: string }> } } })
            .data;
          const text = data?.delta?.content?.[0]?.text;
          if (typeof text === 'string') {
            received.push(text);
          }
        },
        undefined,
        (error) => errors.push(error),
      );

      await manager.emitChunk(streamId, {
        event: 'on_run_step',
        data: {
          id: 'step-1',
          runId: 'run-1',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
      });
      for (const text of ['tail-1', 'tail-2']) {
        await manager.emitChunk(streamId, {
          event: 'on_message_delta',
          data: { id: 'step-1', delta: { content: [{ type: 'text', text }] } },
        });
      }

      /** Abort lands while both deltas are still inside the 25ms window. The
       * abort path must drain the coalescers before its terminal CAS; without
       * that, the window flush fences (-1) and the false receipts retire the
       * runtime, error-closing this subscriber with a reconnect error.
       *
       * Delivery is observed WHILE the abort runs: the pre-CAS flush publishes
       * the tail several round trips before abortJob's terminal cleanup tears
       * down local subscription state, but under Redis Cluster the frames
       * cross the cluster bus, so waiting until after abortJob returns races
       * that teardown (publish receipts acknowledge execution, not delivery). */
      const abortPromise = manager.abortJob(streamId);
      await waitFor(() => received.length === 2);
      expect(received).toEqual(['tail-1', 'tail-2']);
      const abortResult = await abortPromise;
      expect(abortResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(errors).toEqual([]);

      subscription?.unsubscribe();
      await manager.destroy();
    },
    20000,
  );

  testRedis(
    'cross-replica abort does not error-close the owner subscribers over a warm window',
    async () => {
      const ownerManager = createRedisManager();
      const abortingManager = createRedisManager();
      const streamId = `coalesce-xreplica-abort-${Date.now()}`;
      await ownerManager.createJob(streamId, 'user-1', streamId);

      const errors: string[] = [];
      let done = false;
      const subscription = await ownerManager.subscribe(
        streamId,
        () => undefined,
        () => {
          done = true;
        },
        (error) => errors.push(error),
      );

      await ownerManager.emitChunk(streamId, {
        event: 'on_run_step',
        data: {
          id: 'step-1',
          runId: 'run-1',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
      });
      for (const text of ['warm-1', 'warm-2']) {
        await ownerManager.emitChunk(streamId, {
          event: 'on_message_delta',
          data: { id: 'step-1', delta: { content: [{ type: 'text', text }] } },
        });
      }

      /** The abort CAS lands on another replica while the owner's window is
       * still warm; the owner cannot flush pre-CAS, so its window flush fences
       * against the aborted status. `beforePublish` runs between the CAS and
       * the abort FINAL — forcing the owner's flush there pins the race the
       * window timer only hits probabilistically. The fenced receipts land on
       * a runtime whose abort signal already arrived, and the fence backstop
       * must NOT error-close the subscribers awaiting the FINAL frame. */
      const abortResult = await abortingManager.abortJob(streamId, {
        beforePublish: async () => {
          await Promise.all([
            (
              ownerManager as unknown as {
                jobStore: { flushPendingAppends?: (id: string) => Promise<void> };
              }
            ).jobStore.flushPendingAppends?.(streamId),
            (
              ownerManager as unknown as {
                eventTransport: { flushPendingChunks?: (id: string) => Promise<void> };
              }
            ).eventTransport.flushPendingChunks?.(streamId),
          ]);
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });
      expect(abortResult.success).toBe(true);

      await waitFor(() => done);
      expect(errors).toEqual([]);

      subscription?.unsubscribe();
      await ownerManager.destroy();
      await abortingManager.destroy();
    },
    20000,
  );

  testRedis(
    'manager streams coalesced deltas end-to-end and completes cleanly',
    async () => {
      const manager = createRedisManager();
      const streamId = `coalesce-manager-${Date.now()}`;

      await manager.createJob(streamId, 'user-1', streamId);
      const received: ServerSentEvent[] = [];
      let done = false;
      const subscription = await manager.subscribe(
        streamId,
        (event) => received.push(event),
        () => {
          done = true;
        },
      );

      await manager.emitChunk(streamId, {
        event: 'on_run_step',
        data: {
          id: 'step-1',
          runId: 'run-1',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
      });
      for (const text of ['Hello', ' coalesced', ' world']) {
        await manager.emitChunk(streamId, {
          event: 'on_message_delta',
          data: { id: 'step-1', delta: { content: [{ type: 'text', text }] } },
        });
      }
      await manager.emitChunk(streamId, {
        event: 'on_run_step_completed',
        data: {
          result: {
            id: 'step-1',
            runId: 'run-1',
            index: 0,
            stepDetails: { type: 'message_creation' },
          },
        },
      });

      await waitFor(() => received.length === 5);
      const labels = received.map((event) =>
        'event' in event ? (event as { event: string }).event : 'created',
      );
      expect(labels).toEqual([
        'on_run_step',
        'on_message_delta',
        'on_message_delta',
        'on_message_delta',
        'on_run_step_completed',
      ]);

      /** Same-replica durable read: the append-side window must flush so the
       * resume snapshot reflects everything accepted before the read. */
      const resumeState = await manager.getResumeState(streamId);
      const aggregated = JSON.stringify(resumeState?.aggregatedContent ?? '');
      expect(aggregated).toContain('Hello coalesced world');

      await manager.emitDone(streamId, { final: true, streamId } as unknown as ServerSentEvent);
      await manager.completeJob(streamId);
      await waitFor(() => done);

      subscription?.unsubscribe();
      await manager.destroy();
    },
    20000,
  );
});
