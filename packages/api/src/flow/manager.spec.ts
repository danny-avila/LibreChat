import { Keyv } from 'keyv';
import { FlowStateManager } from './manager';
import { FlowState } from './types';

/** Mock class without extending Keyv */
class MockKeyv {
  private store: Map<string, FlowState<string>>;

  constructor() {
    this.store = new Map();
  }

  async get(key: string): Promise<FlowState<string> | undefined> {
    return this.store.get(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async set(key: string, value: FlowState<string>, _ttl?: number): Promise<true> {
    this.store.set(key, value);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
}

describe('FlowStateManager', () => {
  let flowManager: FlowStateManager<string>;
  let store: MockKeyv;

  beforeEach(() => {
    store = new MockKeyv();
    // Type assertion here since we know our mock implements the necessary methods
    flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Concurrency Tests', () => {
    it('should handle concurrent flow creation and return same result', async () => {
      const flowId = 'test-flow';
      const type = 'test-type';

      // Start two concurrent flow creations
      const flow1Promise = flowManager.createFlowWithHandler(flowId, type, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'result';
      });

      const flow2Promise = flowManager.createFlowWithHandler(flowId, type, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'different-result';
      });

      // Both should resolve to the same result from the first handler
      const [result1, result2] = await Promise.all([flow1Promise, flow2Promise]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
    });

    it('should handle flow timeout correctly', async () => {
      const flowId = 'timeout-flow';
      const type = 'test-type';

      // Create flow with very short TTL
      const shortTtlManager = new FlowStateManager(store as unknown as Keyv, {
        ttl: 100,
        ci: true,
      });

      const flowPromise = shortTtlManager.createFlow(flowId, type);

      await expect(flowPromise).rejects.toThrow('test-type flow timed out');
    });

    it('should maintain flow state consistency under high concurrency', async () => {
      const flowId = 'concurrent-flow';
      const type = 'test-type';

      // Create multiple concurrent operations
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(
          flowManager.createFlowWithHandler(flowId, type, async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
            return `result-${i}`;
          }),
        );
      }

      // All operations should resolve to the same result
      const results = await Promise.all(operations);
      const firstResult = results[0];
      results.forEach((result: string) => {
        expect(result).toBe(firstResult);
      });
    });

    it('should handle race conditions in flow completion', async () => {
      const flowId = 'test-flow';
      const type = 'test-type';

      // Create initial flow
      const flowPromise = flowManager.createFlow(flowId, type);

      // Increase delay to ensure flow is properly created
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Complete the flow
      await flowManager.completeFlow(flowId, type, 'result1');

      const result = await flowPromise;
      expect(result).toBe('result1');
    }, 15000);

    it('should handle concurrent flow monitoring', async () => {
      const flowId = 'test-flow';
      const type = 'test-type';

      // Create initial flow
      const flowPromise = flowManager.createFlow(flowId, type);

      // Increase delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Complete the flow
      await flowManager.completeFlow(flowId, type, 'success');

      const result = await flowPromise;
      expect(result).toBe('success');
    }, 15000);

    it('should handle concurrent success and failure attempts', async () => {
      const flowId = 'race-flow';
      const type = 'test-type';

      const flowPromise = flowManager.createFlow(flowId, type);

      // Increase delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Fail the flow
      await flowManager.failFlow(flowId, type, new Error('failure'));

      await expect(flowPromise).rejects.toThrow('failure');
    }, 15000);
  });

  describe('deleteFlow', () => {
    const flowId = 'test-flow-123';
    const type = 'test-type';
    const flowKey = `${type}:${flowId}`;

    it('deletes an existing flow', async () => {
      await store.set(flowKey, { type, status: 'PENDING', metadata: {}, createdAt: Date.now() });
      expect(await store.get(flowKey)).toBeDefined();

      const result = await flowManager.deleteFlow(flowId, type);

      expect(result).toBe(true);
      expect(await store.get(flowKey)).toBeUndefined();
    });

    it('returns false if the deletion errors', async () => {
      jest.spyOn(store, 'delete').mockRejectedValue(new Error('Deletion failed'));

      const result = await flowManager.deleteFlow(flowId, type);

      expect(result).toBe(false);
    });

    it('does nothing if the flow does not exist', async () => {
      expect(await store.get(flowKey)).toBeUndefined();

      const result = await flowManager.deleteFlow(flowId, type);

      expect(result).toBe(true);
    });
  });

  describe('isFlowStale', () => {
    const flowId = 'test-flow-stale';
    const type = 'test-type';
    const flowKey = `${type}:${flowId}`;

    it('returns not stale for non-existent flow', async () => {
      const result = await flowManager.isFlowStale(flowId, type);

      expect(result).toEqual({
        isStale: false,
        age: 0,
      });
    });

    it('returns not stale for PENDING flow regardless of age', async () => {
      const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      await store.set(flowKey, {
        type,
        status: 'PENDING',
        metadata: {},
        createdAt: oldTimestamp,
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result).toEqual({
        isStale: false,
        age: 0,
        status: 'PENDING',
      });
    });

    it('returns not stale for recently COMPLETED flow', async () => {
      const recentTimestamp = Date.now() - 30 * 1000; // 30 seconds ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 60 * 1000,
        completedAt: recentTimestamp,
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(false);
      expect(result.status).toBe('COMPLETED');
      expect(result.age).toBeGreaterThan(0);
      expect(result.age).toBeLessThan(60 * 1000);
    });

    it('returns stale for old COMPLETED flow', async () => {
      const oldTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 10 * 60 * 1000,
        completedAt: oldTimestamp,
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.age).toBeGreaterThan(2 * 60 * 1000);
    });

    it('returns not stale for recently FAILED flow', async () => {
      const recentTimestamp = Date.now() - 30 * 1000; // 30 seconds ago
      await store.set(flowKey, {
        type,
        status: 'FAILED',
        metadata: {},
        createdAt: Date.now() - 60 * 1000,
        failedAt: recentTimestamp,
        error: 'Test error',
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.age).toBeGreaterThan(0);
      expect(result.age).toBeLessThan(60 * 1000);
    });

    it('returns stale for old FAILED flow', async () => {
      const oldTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      await store.set(flowKey, {
        type,
        status: 'FAILED',
        metadata: {},
        createdAt: Date.now() - 10 * 60 * 1000,
        failedAt: oldTimestamp,
        error: 'Test error',
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(true);
      expect(result.status).toBe('FAILED');
      expect(result.age).toBeGreaterThan(2 * 60 * 1000);
    });

    it('uses custom stale threshold', async () => {
      const timestamp = Date.now() - 90 * 1000; // 90 seconds ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 2 * 60 * 1000,
        completedAt: timestamp,
      });

      // 90 seconds old, threshold 60 seconds = stale
      const result1 = await flowManager.isFlowStale(flowId, type, 60 * 1000);
      expect(result1.isStale).toBe(true);

      // 90 seconds old, threshold 120 seconds = not stale
      const result2 = await flowManager.isFlowStale(flowId, type, 120 * 1000);
      expect(result2.isStale).toBe(false);
    });

    it('uses default threshold of 2 minutes when not specified', async () => {
      const timestamp = Date.now() - 3 * 60 * 1000; // 3 minutes ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5 * 60 * 1000,
        completedAt: timestamp,
      });

      // Should use default 2 minute threshold
      const result = await flowManager.isFlowStale(flowId, type);

      expect(result.isStale).toBe(true);
      expect(result.age).toBeGreaterThan(2 * 60 * 1000);
    });

    it('falls back to createdAt when completedAt/failedAt are not present', async () => {
      const createdTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: createdTimestamp,
        // No completedAt or failedAt
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.age).toBeGreaterThan(2 * 60 * 1000);
    });

    it('handles flow with no timestamps', async () => {
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        // No timestamps at all
      } as FlowState<string>);

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      expect(result.isStale).toBe(false);
      expect(result.age).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });

    it('prefers completedAt over createdAt for age calculation', async () => {
      const createdTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const completedTimestamp = Date.now() - 30 * 1000; // 30 seconds ago
      await store.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: createdTimestamp,
        completedAt: completedTimestamp,
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      // Should use completedAt (30s) not createdAt (10m)
      expect(result.isStale).toBe(false);
      expect(result.age).toBeLessThan(60 * 1000);
    });

    it('prefers failedAt over createdAt for age calculation', async () => {
      const createdTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const failedTimestamp = Date.now() - 30 * 1000; // 30 seconds ago
      await store.set(flowKey, {
        type,
        status: 'FAILED',
        metadata: {},
        createdAt: createdTimestamp,
        failedAt: failedTimestamp,
        error: 'Test error',
      });

      const result = await flowManager.isFlowStale(flowId, type, 2 * 60 * 1000);

      // Should use failedAt (30s) not createdAt (10m)
      expect(result.isStale).toBe(false);
      expect(result.age).toBeLessThan(60 * 1000);
    });
  });
});
