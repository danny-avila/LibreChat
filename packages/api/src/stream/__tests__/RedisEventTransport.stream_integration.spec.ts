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

      // Wait for subscription to be established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit events
      transport.emitChunk(streamId, { type: 'text', text: 'Hello' });
      transport.emitChunk(streamId, { type: 'text', text: ' World' });
      transport.emitDone(streamId, { finished: true });

      // Wait for events to propagate
      await new Promise((resolve) => setTimeout(resolve, 200));

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
      transport1.emitChunk(streamId, { data: 'from-instance-1' });

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

      transport.emitChunk(streamId, { data: 'broadcast' });

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

      transport.emitError(streamId, 'Test error message');

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
