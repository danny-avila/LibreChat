import { FlowStateManager } from './manager';
import { Keyv } from 'keyv';
import type { FlowState } from './types';

// Create a mock class without extending Keyv
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
});
