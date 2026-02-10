import type { Redis, Cluster } from 'ioredis';

/**
 * Integration tests for RedisEventTransport.
 *
 * Tests Redis Pub/Sub functionality:
 * - Cross-instance event delivery
 * - Subscriber management
 * - Error handling
 *
 * Run with: USE_REDIS=true npx jest RedisEventTransport.stream_integration
 */
describe('RedisEventTransport Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let ioredisClient: Redis | Cluster | null = null;
  const testPrefix = 'EventTransport-Integration-Test';

  beforeAll(async () => {
    originalEnv = { ...process.env };

    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX = testPrefix;

    jest.resetModules();

    const { ioredisClient: client } = await import('../../cache/redisClients');
    ioredisClient = client;
  });

  afterAll(async () => {
    if (ioredisClient) {
      try {
        // Use quit() to gracefully close - waits for pending commands
        await ioredisClient.quit();
      } catch {
        // Fall back to disconnect if quit fails
        try {
          ioredisClient.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    process.env = originalEnv;
  });

  describe('Pub/Sub Event Delivery', () => {
    test('should deliver events to subscribers on same instance', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      // Create subscriber client (Redis pub/sub requires dedicated connection)
      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `pubsub-same-${Date.now()}`;
      const receivedChunks: unknown[] = [];
      let doneEvent: unknown = null;

      // Subscribe
      const { unsubscribe } = transport.subscribe(streamId, {
        onChunk: (event) => receivedChunks.push(event),
        onDone: (event) => {
          doneEvent = event;
        },
      });

      // Wait for subscription to be established (increased for CI)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Emit events (emitChunk/emitDone are async for ordered delivery)
      await transport.emitChunk(streamId, { type: 'text', text: 'Hello' });
      await transport.emitChunk(streamId, { type: 'text', text: ' World' });
      await transport.emitDone(streamId, { finished: true });

      // Wait for events to propagate (increased for CI)
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(receivedChunks.length).toBe(2);
      expect(doneEvent).toEqual({ finished: true });

      unsubscribe();
      transport.destroy();
      subscriber.disconnect();
    });

    test('should deliver events across transport instances (simulating different servers)', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      // Create two separate transport instances (simulating two servers)
      const subscriber1 = (ioredisClient as Redis).duplicate();
      const subscriber2 = (ioredisClient as Redis).duplicate();

      const transport1 = new RedisEventTransport(ioredisClient, subscriber1);
      const transport2 = new RedisEventTransport(ioredisClient, subscriber2);

      const streamId = `pubsub-cross-${Date.now()}`;

      const instance2Chunks: unknown[] = [];

      // Subscribe on transport 2 (consumer)
      const sub2 = transport2.subscribe(streamId, {
        onChunk: (event) => instance2Chunks.push(event),
      });

      // Wait for subscription
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit from transport 1 (producer on different instance)
      await transport1.emitChunk(streamId, { data: 'from-instance-1' });

      // Wait for cross-instance delivery
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Transport 2 should receive the event
      expect(instance2Chunks.length).toBe(1);
      expect(instance2Chunks[0]).toEqual({ data: 'from-instance-1' });

      sub2.unsubscribe();
      transport1.destroy();
      transport2.destroy();
      subscriber1.disconnect();
      subscriber2.disconnect();
    });

    test('should handle multiple subscribers to same stream', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `pubsub-multi-${Date.now()}`;

      const subscriber1Chunks: unknown[] = [];
      const subscriber2Chunks: unknown[] = [];

      // Two subscribers
      const sub1 = transport.subscribe(streamId, {
        onChunk: (event) => subscriber1Chunks.push(event),
      });

      const sub2 = transport.subscribe(streamId, {
        onChunk: (event) => subscriber2Chunks.push(event),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await transport.emitChunk(streamId, { data: 'broadcast' });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Both should receive
      expect(subscriber1Chunks.length).toBe(1);
      expect(subscriber2Chunks.length).toBe(1);

      sub1.unsubscribe();
      sub2.unsubscribe();
      transport.destroy();
      subscriber.disconnect();
    });
  });

  describe('Sequential Event Ordering', () => {
    test('should maintain strict order when emitChunk is awaited', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `order-test-${Date.now()}`;
      const receivedEvents: number[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => receivedEvents.push((event as { index: number }).index),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit 20 events rapidly with await - they should arrive in order
      for (let i = 0; i < 20; i++) {
        await transport.emitChunk(streamId, { index: i });
      }

      // Wait for all events to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify all events arrived in correct order
      expect(receivedEvents.length).toBe(20);
      for (let i = 0; i < 20; i++) {
        expect(receivedEvents[i]).toBe(i);
      }

      transport.destroy();
      subscriber.disconnect();
    });

    test('should maintain order for tool call delta chunks (simulates streaming args)', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `tool-delta-order-${Date.now()}`;
      const receivedArgs: string[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => {
          const data = event as {
            event: string;
            data: { delta: { tool_calls: { args: string }[] } };
          };
          if (data.event === 'on_run_step_delta') {
            receivedArgs.push(data.data.delta.tool_calls[0].args);
          }
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate streaming tool call arguments like: {"code": "# First line\n..."
      const argChunks = ['{"code"', ': "', '# First', ' line', '\\n', '..."', '}'];

      for (const chunk of argChunks) {
        await transport.emitChunk(streamId, {
          event: 'on_run_step_delta',
          data: {
            id: 'step-1',
            delta: {
              type: 'tool_calls',
              tool_calls: [{ index: 0, args: chunk }],
            },
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify chunks arrived in correct order - this was the bug we fixed
      expect(receivedArgs).toEqual(argChunks);
      expect(receivedArgs.join('')).toBe('{"code": "# First line\\n..."}');

      transport.destroy();
      subscriber.disconnect();
    });

    test('should maintain order across multiple concurrent streams (no cross-contamination)', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId1 = `concurrent-stream-1-${Date.now()}`;
      const streamId2 = `concurrent-stream-2-${Date.now()}`;

      const stream1Events: number[] = [];
      const stream2Events: number[] = [];

      transport.subscribe(streamId1, {
        onChunk: (event) => stream1Events.push((event as { index: number }).index),
      });
      transport.subscribe(streamId2, {
        onChunk: (event) => stream2Events.push((event as { index: number }).index),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Interleave events from both streams
      for (let i = 0; i < 10; i++) {
        await transport.emitChunk(streamId1, { index: i });
        await transport.emitChunk(streamId2, { index: i * 10 });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Each stream should have its own ordered events
      expect(stream1Events).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(stream2Events).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);

      transport.destroy();
      subscriber.disconnect();
    });
  });

  describe('Reorder Buffer (Redis Cluster Fix)', () => {
    test('should reorder out-of-sequence messages', async () => {
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

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

      const streamId = 'reorder-test';
      const receivedEvents: number[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => receivedEvents.push((event as { index: number }).index),
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { index: 0 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 2, data: { index: 2 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 1, data: { index: 1 } }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents).toEqual([0, 1, 2]);

      transport.destroy();
    });

    test('should buffer early messages and deliver when gaps are filled', async () => {
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

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

      const streamId = 'buffer-test';
      const receivedEvents: number[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => receivedEvents.push((event as { index: number }).index),
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 2, data: { index: 2 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 4, data: { index: 4 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 3, data: { index: 3 } }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(receivedEvents).toEqual([]);

      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { index: 0 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 1, data: { index: 1 } }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(receivedEvents).toEqual([0, 1, 2, 3, 4]);

      transport.destroy();
    });

    test('should force-flush on timeout when gaps are not filled', async () => {
      jest.useFakeTimers();

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

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

      const streamId = 'timeout-test';
      const receivedEvents: number[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => receivedEvents.push((event as { index: number }).index),
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 2, data: { index: 2 } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 3, data: { index: 3 } }));

      expect(receivedEvents).toEqual([]);

      jest.advanceTimersByTime(600);

      expect(receivedEvents).toEqual([2, 3]);

      transport.destroy();
      jest.useRealTimers();
    });

    test('should handle messages without sequence numbers (backward compatibility)', async () => {
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

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

      const streamId = 'compat-test';
      const receivedEvents: string[] = [];

      transport.subscribe(streamId, {
        onChunk: (event) => receivedEvents.push((event as { msg: string }).msg),
        onDone: (event) => receivedEvents.push(`done:${(event as { msg: string }).msg}`),
      });

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1] as (channel: string, message: string) => void;

      const channel = `stream:{${streamId}}:events`;

      messageHandler(channel, JSON.stringify({ type: 'chunk', data: { msg: 'no-seq-1' } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', data: { msg: 'no-seq-2' } }));
      messageHandler(channel, JSON.stringify({ type: 'done', data: { msg: 'finished' } }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents).toEqual(['no-seq-1', 'no-seq-2', 'done:finished']);

      transport.destroy();
    });

    test('should deliver done event after all pending chunks (terminal event ordering)', async () => {
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      const transport = new RedisEventTransport(mockPublisher as never, mockSubscriber as never);
      const streamId = `terminal-order-${Date.now()}`;

      const receivedEvents: string[] = [];
      let doneReceived = false;

      transport.subscribe(streamId, {
        onChunk: (event: unknown) => {
          const e = event as { msg?: string };
          receivedEvents.push(e.msg ?? 'unknown');
        },
        onDone: (event: unknown) => {
          const e = event as { msg?: string };
          receivedEvents.push(`done:${e.msg ?? 'finished'}`);
          doneReceived = true;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];
      expect(messageHandler).toBeDefined();

      const channel = `stream:{${streamId}}:events`;

      // Simulate out-of-order delivery in Redis Cluster:
      // Done event (seq=3) arrives before chunk seq=2
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { msg: 'chunk-0' } }));
      messageHandler(channel, JSON.stringify({ type: 'done', seq: 3, data: { msg: 'complete' } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 2, data: { msg: 'chunk-2' } }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 1, data: { msg: 'chunk-1' } }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Done event should be delivered AFTER all chunks despite arriving early
      expect(doneReceived).toBe(true);
      expect(receivedEvents).toEqual(['chunk-0', 'chunk-1', 'chunk-2', 'done:complete']);

      transport.destroy();
    });

    test('should deliver error event after all pending chunks (terminal event ordering)', async () => {
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const mockPublisher = {
        publish: jest.fn().mockResolvedValue(1),
      };
      const mockSubscriber = {
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      const transport = new RedisEventTransport(mockPublisher as never, mockSubscriber as never);
      const streamId = `terminal-error-${Date.now()}`;

      const receivedEvents: string[] = [];
      let errorReceived: string | undefined;

      transport.subscribe(streamId, {
        onChunk: (event: unknown) => {
          const e = event as { msg?: string };
          receivedEvents.push(e.msg ?? 'unknown');
        },
        onError: (error: string) => {
          receivedEvents.push(`error:${error}`);
          errorReceived = error;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const messageHandler = mockSubscriber.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];
      expect(messageHandler).toBeDefined();

      const channel = `stream:{${streamId}}:events`;

      // Simulate out-of-order delivery: error arrives before final chunks
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { msg: 'chunk-0' } }));
      messageHandler(channel, JSON.stringify({ type: 'error', seq: 2, error: 'Something failed' }));
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 1, data: { msg: 'chunk-1' } }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error event should be delivered AFTER all preceding chunks
      expect(errorReceived).toBe('Something failed');
      expect(receivedEvents).toEqual(['chunk-0', 'chunk-1', 'error:Something failed']);

      transport.destroy();
    });
  });

  describe('Subscriber Management', () => {
    test('should track first subscriber correctly', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `first-sub-${Date.now()}`;

      // Before any subscribers - count is 0, not "first" since no one subscribed
      expect(transport.getSubscriberCount(streamId)).toBe(0);

      // First subscriber
      const sub1 = transport.subscribe(streamId, { onChunk: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now there's a subscriber - isFirstSubscriber returns true when count is 1
      expect(transport.getSubscriberCount(streamId)).toBe(1);
      expect(transport.isFirstSubscriber(streamId)).toBe(true);

      // Second subscriber - not first anymore
      const sub2temp = transport.subscribe(streamId, { onChunk: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(transport.isFirstSubscriber(streamId)).toBe(false);
      sub2temp.unsubscribe();

      const sub2 = transport.subscribe(streamId, { onChunk: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(transport.getSubscriberCount(streamId)).toBe(2);

      sub1.unsubscribe();
      sub2.unsubscribe();
      transport.destroy();
      subscriber.disconnect();
    });

    test('should fire onAllSubscribersLeft when last subscriber leaves', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `all-left-${Date.now()}`;
      let allLeftCalled = false;

      transport.onAllSubscribersLeft(streamId, () => {
        allLeftCalled = true;
      });

      const sub1 = transport.subscribe(streamId, { onChunk: () => {} });
      const sub2 = transport.subscribe(streamId, { onChunk: () => {} });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Unsubscribe first
      sub1.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Still have one subscriber
      expect(allLeftCalled).toBe(false);

      // Unsubscribe last
      sub2.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now all left
      expect(allLeftCalled).toBe(true);

      transport.destroy();
      subscriber.disconnect();
    });
  });

  describe('Error Handling', () => {
    test('should deliver error events to subscribers', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `error-${Date.now()}`;
      let receivedError: string | null = null;

      transport.subscribe(streamId, {
        onChunk: () => {},
        onError: (err) => {
          receivedError = err;
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await transport.emitError(streamId, 'Test error message');

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedError).toBe('Test error message');

      transport.destroy();
      subscriber.disconnect();
    });
  });

  describe('Cross-Replica Abort', () => {
    test('should emit and receive abort signals on same instance', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `abort-same-${Date.now()}`;
      let abortReceived = false;

      // Register abort callback
      transport.onAbort(streamId, () => {
        abortReceived = true;
      });

      // Wait for subscription to be established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit abort
      transport.emitAbort(streamId);

      // Wait for signal to propagate
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(abortReceived).toBe(true);

      transport.destroy();
      subscriber.disconnect();
    });

    test('should deliver abort signals across transport instances', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      // Two separate instances (simulating two servers)
      const subscriber1 = (ioredisClient as Redis).duplicate();
      const subscriber2 = (ioredisClient as Redis).duplicate();

      const transport1 = new RedisEventTransport(ioredisClient, subscriber1);
      const transport2 = new RedisEventTransport(ioredisClient, subscriber2);

      const streamId = `abort-cross-${Date.now()}`;
      let instance1AbortReceived = false;

      // Instance 1 registers abort callback (simulates server running generation)
      transport1.onAbort(streamId, () => {
        instance1AbortReceived = true;
      });

      // Wait for subscription
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Instance 2 emits abort (simulates server receiving abort request)
      transport2.emitAbort(streamId);

      // Wait for cross-instance delivery
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Instance 1 should receive abort signal
      expect(instance1AbortReceived).toBe(true);

      transport1.destroy();
      transport2.destroy();
      subscriber1.disconnect();
      subscriber2.disconnect();
    });

    test('should call multiple abort callbacks', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `abort-multi-${Date.now()}`;
      let callback1Called = false;
      let callback2Called = false;

      // Multiple abort callbacks
      transport.onAbort(streamId, () => {
        callback1Called = true;
      });
      transport.onAbort(streamId, () => {
        callback2Called = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      transport.emitAbort(streamId);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(callback1Called).toBe(true);
      expect(callback2Called).toBe(true);

      transport.destroy();
      subscriber.disconnect();
    });

    test('should cleanup abort callbacks on stream cleanup', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `abort-cleanup-${Date.now()}`;
      let abortReceived = false;

      transport.onAbort(streamId, () => {
        abortReceived = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cleanup the stream
      transport.cleanup(streamId);

      // Emit abort after cleanup
      transport.emitAbort(streamId);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should NOT receive abort since stream was cleaned up
      expect(abortReceived).toBe(false);

      transport.destroy();
      subscriber.disconnect();
    });
  });

  describe('Cleanup', () => {
    test('should clean up stream resources', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      const subscriber = (ioredisClient as Redis).duplicate();
      const transport = new RedisEventTransport(ioredisClient, subscriber);

      const streamId = `cleanup-${Date.now()}`;

      transport.subscribe(streamId, { onChunk: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(transport.getSubscriberCount(streamId)).toBe(1);

      // Cleanup the stream
      transport.cleanup(streamId);

      // Subscriber count should be 0
      expect(transport.getSubscriberCount(streamId)).toBe(0);

      transport.destroy();
      subscriber.disconnect();
    });
  });
});
