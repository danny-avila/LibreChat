import type { Redis, Cluster } from 'ioredis';
import { RedisEventTransport } from '~/stream/implementations/RedisEventTransport';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { createStreamServices } from '~/stream/createStreamServices';
import {
  ioredisClient as staticRedisClient,
  keyvRedisClient as staticKeyvClient,
  keyvRedisClientReady,
} from '~/cache/redisClients';

/**
 * Regression tests for the reconnect reorder buffer desync bug.
 *
 * Bug: When a user disconnects and reconnects to a stream multiple times,
 * the second+ reconnect lost chunks because the transport deleted stream state
 * on last unsubscribe, destroying the allSubscribersLeftCallbacks registered
 * by createJob(). This prevented hasSubscriber from being reset, which in turn
 * prevented syncReorderBuffer from being called on reconnect.
 *
 * Fix: Preserve stream state (callbacks, abort handlers) across reconnect cycles
 * instead of deleting it. The state is fully cleaned up by cleanup() when the
 * job completes.
 *
 * Run with: USE_REDIS=true npx jest reconnect-reorder-desync
 */
describe('Reconnect Reorder Buffer Desync (Regression)', () => {
  describe('Callback preservation across reconnect cycles (Unit)', () => {
    test('allSubscribersLeft callback fires on every disconnect, not just the first', () => {
      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        on: jest.fn(),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      const transport = new RedisEventTransport(
        mockPublisher as unknown as Redis,
        mockSubscriber as unknown as Redis,
      );

      const streamId = 'callback-persist-test';
      let callbackFireCount = 0;

      // Register callback (simulates what createJob does)
      transport.onAllSubscribersLeft(streamId, () => {
        callbackFireCount++;
      });

      // First subscribe/unsubscribe cycle
      const sub1 = transport.subscribe(streamId, { onChunk: () => {} });
      sub1.unsubscribe();

      expect(callbackFireCount).toBe(1);

      // Second subscribe/unsubscribe cycle — callback must still fire
      const sub2 = transport.subscribe(streamId, { onChunk: () => {} });
      sub2.unsubscribe();

      expect(callbackFireCount).toBe(2);

      // Third cycle — continues to work
      const sub3 = transport.subscribe(streamId, { onChunk: () => {} });
      sub3.unsubscribe();

      expect(callbackFireCount).toBe(3);

      transport.destroy();
    });

    test('abort callback survives across reconnect cycles', () => {
      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        on: jest.fn(),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      const transport = new RedisEventTransport(
        mockPublisher as unknown as Redis,
        mockSubscriber as unknown as Redis,
      );

      const streamId = 'abort-callback-persist-test';
      let abortCallbackFired = false;

      // Register abort callback (simulates what createJob does)
      transport.onAbort(streamId, () => {
        abortCallbackFired = true;
      });

      // Subscribe/unsubscribe cycle
      const sub1 = transport.subscribe(streamId, { onChunk: () => {} });
      sub1.unsubscribe();

      // Re-subscribe and receive an abort signal
      const sub2 = transport.subscribe(streamId, { onChunk: () => {} });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;
      messageHandler(channel, JSON.stringify({ type: 'abort' }));

      // Abort callback should fire — it was preserved across the reconnect
      expect(abortCallbackFired).toBe(true);

      sub2.unsubscribe();
      transport.destroy();
    });
  });

  describe('Reorder buffer sync on reconnect (Unit)', () => {
    /**
     * After the fix, the allSubscribersLeft callback fires on every disconnect,
     * which resets hasSubscriber. GenerationJobManager.subscribe() then enters
     * the if (!runtime.hasSubscriber) block and calls syncReorderBuffer.
     *
     * This test verifies at the transport level that when syncReorderBuffer IS
     * called (as it now will be on every reconnect), messages are delivered
     * immediately regardless of how many reconnect cycles have occurred.
     */
    test('syncReorderBuffer works correctly on third+ reconnect', async () => {
      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        on: jest.fn(),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      const transport = new RedisEventTransport(
        mockPublisher as unknown as Redis,
        mockSubscriber as unknown as Redis,
      );

      const streamId = 'reorder-multi-reconnect-test';

      transport.onAllSubscribersLeft(streamId, () => {
        // Simulates the callback from createJob
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      // Run 3 full subscribe/emit/unsubscribe cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        const chunks: unknown[] = [];
        const sub = transport.subscribe(streamId, {
          onChunk: (event) => chunks.push(event),
        });

        // Sync reorder buffer (as GenerationJobManager.subscribe does)
        transport.syncReorderBuffer(streamId);

        const baseSeq = cycle * 10;

        // Emit 10 chunks (advances publisher sequence)
        for (let i = 0; i < 10; i++) {
          await transport.emitChunk(streamId, { index: baseSeq + i });
        }

        // Deliver messages via pub/sub handler
        for (let i = 0; i < 10; i++) {
          messageHandler(
            channel,
            JSON.stringify({ type: 'chunk', seq: baseSeq + i, data: { index: baseSeq + i } }),
          );
        }

        // Messages should be delivered immediately on every cycle
        expect(chunks.length).toBe(10);
        expect(chunks.map((c) => (c as { index: number }).index)).toEqual(
          Array.from({ length: 10 }, (_, i) => baseSeq + i),
        );

        sub.unsubscribe();
      }

      transport.destroy();
    });

    test('reorder buffer works correctly when syncReorderBuffer IS called', async () => {
      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        on: jest.fn(),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      const transport = new RedisEventTransport(
        mockPublisher as unknown as Redis,
        mockSubscriber as unknown as Redis,
      );

      const streamId = 'reorder-sync-test';

      // Emit 20 chunks to advance publisher sequence
      for (let i = 0; i < 20; i++) {
        await transport.emitChunk(streamId, { index: i });
      }

      // Subscribe and sync the reorder buffer
      const chunks: unknown[] = [];
      const sub = transport.subscribe(streamId, {
        onChunk: (event) => chunks.push(event),
      });

      // This is the critical call - sync nextSeq to match publisher
      transport.syncReorderBuffer(streamId);

      // Deliver messages starting at seq 20
      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      for (let i = 20; i < 25; i++) {
        messageHandler(channel, JSON.stringify({ type: 'chunk', seq: i, data: { index: i } }));
      }

      // Messages should be delivered IMMEDIATELY (no 500ms wait)
      // because nextSeq was synced to 20
      expect(chunks.length).toBe(5);
      expect(chunks.map((c) => (c as { index: number }).index)).toEqual([20, 21, 22, 23, 24]);

      sub.unsubscribe();
      transport.destroy();
    });
  });

  describe('End-to-end reconnect with GenerationJobManager (Integration)', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let ioredisClient: Redis | Cluster | null = null;
    let dynamicKeyvClient: unknown = null;
    let dynamicKeyvReady: Promise<unknown> | null = null;
    const testPrefix = 'ReconnectDesync-Test';

    beforeAll(async () => {
      originalEnv = { ...process.env };

      process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
      process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
      process.env.REDIS_KEY_PREFIX = testPrefix;

      jest.resetModules();

      const redisModule = await import('~/cache/redisClients');
      ioredisClient = redisModule.ioredisClient;
      dynamicKeyvClient = redisModule.keyvRedisClient;
      dynamicKeyvReady = redisModule.keyvRedisClientReady;
    });

    afterEach(async () => {
      jest.resetModules();

      if (ioredisClient) {
        try {
          const keys = await ioredisClient.keys(`${testPrefix}*`);
          const streamKeys = await ioredisClient.keys('stream:*');
          const allKeys = [...keys, ...streamKeys];
          await Promise.all(allKeys.map((key) => ioredisClient!.del(key)));
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    afterAll(async () => {
      for (const ready of [keyvRedisClientReady, dynamicKeyvReady]) {
        if (ready) {
          await ready.catch(() => {});
        }
      }

      const clients = [ioredisClient, staticRedisClient, staticKeyvClient, dynamicKeyvClient];
      for (const client of clients) {
        if (!client) {
          continue;
        }
        try {
          await (client as { disconnect: () => void | Promise<void> }).disconnect();
        } catch {
          /* ignore */
        }
      }

      process.env = originalEnv;
    });

    /**
     * Verifies that all reconnect cycles deliver chunks immediately —
     * not just the first reconnect.
     */
    test('chunks are delivered immediately on every reconnect cycle', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const manager = new GenerationJobManagerClass();
      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      manager.configure(services);
      manager.initialize();

      const streamId = `reconnect-fixed-${Date.now()}`;
      await manager.createJob(streamId, 'user-1');

      // Run 3 subscribe/emit/unsubscribe cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        const chunks: unknown[] = [];
        const sub = await manager.subscribe(streamId, (event) => chunks.push(event));

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Emit 10 chunks
        for (let i = 0; i < 10; i++) {
          await manager.emitChunk(streamId, {
            event: 'on_message_delta',
            data: {
              delta: { content: { type: 'text', text: `c${cycle}-${i}` } },
              index: cycle * 10 + i,
            },
          });
        }

        // Chunks should arrive within 200ms (well under the 500ms force-flush timeout)
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(chunks.length).toBe(10);

        sub!.unsubscribe();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await manager.destroy();
    });

    /**
     * Verifies that syncSent is correctly reset on every disconnect,
     * proving the onAllSubscribersLeft callback survives reconnect cycles.
     */
    test('onAllSubscribersLeft callback resets state on every disconnect', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const manager = new GenerationJobManagerClass();
      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      manager.configure(services);
      manager.initialize();

      const streamId = `callback-persist-integ-${Date.now()}`;
      await manager.createJob(streamId, 'user-1');

      for (let cycle = 0; cycle < 3; cycle++) {
        const sub = await manager.subscribe(streamId, () => {});
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Mark sync as sent
        manager.markSyncSent(streamId);
        await new Promise((resolve) => setTimeout(resolve, 50));

        let syncSent = await manager.wasSyncSent(streamId);
        expect(syncSent).toBe(true);

        // Disconnect
        sub!.unsubscribe();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Callback should reset syncSent on every disconnect
        syncSent = await manager.wasSyncSent(streamId);
        expect(syncSent).toBe(false);
      }

      await manager.destroy();
    });

    /**
     * Verifies all reconnect cycles deliver chunks immediately with no
     * increasing gap pattern.
     */
    test('no increasing gap pattern across reconnect cycles', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const manager = new GenerationJobManagerClass();
      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      manager.configure(services);
      manager.initialize();

      const streamId = `no-gaps-${Date.now()}`;
      await manager.createJob(streamId, 'user-1');

      const chunksPerCycle = 15;

      for (let cycle = 0; cycle < 4; cycle++) {
        const chunks: unknown[] = [];
        const sub = await manager.subscribe(streamId, (event) => chunks.push(event));
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Emit chunks
        for (let i = 0; i < chunksPerCycle; i++) {
          await manager.emitChunk(streamId, {
            event: 'on_message_delta',
            data: {
              delta: { content: { type: 'text', text: `c${cycle}-${i}` } },
              index: cycle * chunksPerCycle + i,
            },
          });
        }

        // All chunks should arrive within 200ms on every cycle
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(chunks.length).toBe(chunksPerCycle);

        sub!.unsubscribe();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await manager.destroy();
    });
  });
});
