import { Keyv } from 'keyv';
import { FlowStateManager } from './manager';
import { FlowState } from './types';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/** Mock class without extending Keyv */
class MockKeyv<T = string> {
  private store: Map<string, FlowState<T>>;

  constructor() {
    this.store = new Map();
  }

  async get(key: string): Promise<FlowState<T> | undefined> {
    return this.store.get(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async set(key: string, value: FlowState<T>, _ttl?: number): Promise<true> {
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

  describe('createFlowWithHandler - token expiration', () => {
    const flowId = 'token-flow';
    const type = 'mcp_get_tokens';
    const flowKey = `${type}:${flowId}`;

    type TokenResult = {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
    };

    let tokenFlowManager: FlowStateManager<TokenResult>;
    let tokenStore: MockKeyv<TokenResult>;

    beforeEach(() => {
      tokenStore = new MockKeyv<TokenResult>();
      tokenFlowManager = new FlowStateManager(tokenStore as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });
    });

    it('should execute handler when existing flow has expired token', async () => {
      const expiredTokenResult: TokenResult = {
        access_token: 'expired_token',
        refresh_token: 'refresh_token',
        expires_at: Date.now() - 1000, // Expired 1 second ago
      };

      // Create flow with expired token
      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: expiredTokenResult,
      } as FlowState<TokenResult>);

      const newTokenResult: TokenResult = {
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      };
      const handlerSpy = jest.fn().mockResolvedValue(newTokenResult);

      const result = await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      // Handler should be called because token is expired
      expect(handlerSpy).toHaveBeenCalled();
      expect(result).toEqual(newTokenResult);
    });

    it('should reuse existing flow when token is still valid', async () => {
      const validTokenResult: TokenResult = {
        access_token: 'valid_token',
        refresh_token: 'refresh_token',
        expires_at: Date.now() + 3600000, // Expires in 1 hour
      };

      // Create flow with valid token
      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: validTokenResult,
      } as FlowState<TokenResult>);

      const handlerSpy = jest.fn().mockResolvedValue({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      });

      const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      // Complete the monitored flow
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await resultPromise;

      // Handler should NOT be called because token is still valid
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(result).toEqual(validTokenResult);
    }, 15000);

    it('should reuse existing flow when no expires_at field exists', async () => {
      const tokenResultWithoutExpiry: TokenResult = {
        access_token: 'token_without_expiry',
        refresh_token: 'refresh_token',
        // No expires_at field - handles flows without expiration metadata
      };

      // Create flow without expires_at
      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: tokenResultWithoutExpiry,
      } as FlowState<TokenResult>);

      const handlerSpy = jest.fn().mockResolvedValue({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      });

      const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      // Wait for flow monitoring
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await resultPromise;

      // Handler should NOT be called - flows without expires_at are treated as valid/non-expired
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(result).toEqual(tokenResultWithoutExpiry);
    }, 15000);

    it('should treat NaN expires_at as non-expired and reuse existing flow', async () => {
      const tokenResultWithNaN: TokenResult = {
        access_token: 'token_with_nan',
        refresh_token: 'refresh_token',
        expires_at: NaN,
      };

      // Create flow with NaN expires_at
      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: tokenResultWithNaN,
      } as FlowState<TokenResult>);

      const handlerSpy = jest.fn().mockResolvedValue({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      });

      const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      // Wait for flow monitoring
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await resultPromise;

      // Handler should NOT be called - NaN is treated as invalid expiration (non-expired)
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(result).toEqual(tokenResultWithNaN);
    }, 15000);

    it('should handle expires_at in seconds format (Unix timestamp)', async () => {
      const expiredSecondsTimestamp = Math.floor(Date.now() / 1000) - 60;
      const expiredTokenResult: TokenResult = {
        access_token: 'expired_token_seconds',
        refresh_token: 'refresh_token',
        expires_at: expiredSecondsTimestamp,
      };

      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: expiredTokenResult,
      } as FlowState<TokenResult>);

      const newTokenResult: TokenResult = {
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      };
      const handlerSpy = jest.fn().mockResolvedValue(newTokenResult);

      const result = await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      // Handler SHOULD be called - token in seconds format is expired
      expect(handlerSpy).toHaveBeenCalled();
      expect(result).toEqual(newTokenResult);
    });

    it('should reuse flow when expires_at in seconds format is still valid', async () => {
      const validSecondsTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const validTokenResult: TokenResult = {
        access_token: 'valid_token_seconds',
        refresh_token: 'refresh_token',
        expires_at: validSecondsTimestamp,
      };

      await tokenStore.set(flowKey, {
        type,
        status: 'COMPLETED',
        metadata: {},
        createdAt: Date.now() - 5000,
        completedAt: Date.now() - 4000,
        result: validTokenResult,
      } as FlowState<TokenResult>);

      const handlerSpy = jest.fn().mockResolvedValue({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        expires_at: Date.now() + 3600000,
      });

      const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await resultPromise;

      // Handler should NOT be called - seconds-format token is still valid
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(result).toEqual(validTokenResult);
    }, 15000);
  });

  describe('Timestamp normalization', () => {
    const SECONDS_THRESHOLD = 1e10;

    const flowId = 'normalization-test';
    const type = 'timestamp_test';
    const flowKey = `${type}:${flowId}`;

    type TokenResult = {
      access_token: string;
      expires_at: number;
    };

    let tokenFlowManager: FlowStateManager<TokenResult>;
    let tokenStore: MockKeyv<TokenResult>;

    beforeEach(() => {
      tokenStore = new MockKeyv<TokenResult>();
      tokenFlowManager = new FlowStateManager(tokenStore as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });
    });

    describe('Seconds format detection (values < 1e10)', () => {
      it('should normalize current Unix timestamp in seconds (Dec 2024: ~1734000000)', async () => {
        const currentSeconds = Math.floor(Date.now() / 1000);
        const expiredSecondsAgo = currentSeconds - 60;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: expiredSecondsAgo },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle Sept 2001 timestamp in seconds (1000000000)', async () => {
        const sept2001Seconds = 1000000000;
        expect(sept2001Seconds).toBeLessThan(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: sept2001Seconds },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle year 2000 timestamp in seconds (946684800)', async () => {
        const year2000Seconds = 946684800;
        expect(year2000Seconds).toBeLessThan(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: year2000Seconds },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle May 2033 timestamp in seconds (2000000000) - future but still seconds format', async () => {
        const may2033Seconds = 2000000000;
        expect(may2033Seconds).toBeLessThan(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: may2033Seconds },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await resultPromise;

        expect(handlerSpy).not.toHaveBeenCalled();
      }, 15000);

      it('should handle edge case: just below threshold (9999999999 - ~Nov 2286 in seconds)', async () => {
        const justBelowThreshold = 9999999999;
        expect(justBelowThreshold).toBeLessThan(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: justBelowThreshold },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await resultPromise;

        expect(handlerSpy).not.toHaveBeenCalled();
      }, 15000);
    });

    describe('Milliseconds format detection (values >= 1e10)', () => {
      it('should recognize current timestamp in milliseconds (Dec 2024: ~1734000000000)', async () => {
        const currentMs = Date.now();
        const expiredMsAgo = currentMs - 60000;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: expiredMsAgo },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle Sept 2001 timestamp in milliseconds (1000000000000)', async () => {
        const sept2001Ms = 1000000000000;
        expect(sept2001Ms).toBeGreaterThanOrEqual(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: sept2001Ms },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle edge case: exactly at threshold (10000000000 - ~April 1970 in ms)', async () => {
        const exactlyAtThreshold = 10000000000;
        expect(exactlyAtThreshold).toEqual(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: exactlyAtThreshold },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle edge case: just above threshold (10000000001)', async () => {
        const justAboveThreshold = 10000000001;
        expect(justAboveThreshold).toBeGreaterThan(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: justAboveThreshold },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle future timestamp in milliseconds (2000000000000 - May 2033)', async () => {
        const may2033Ms = 2000000000000;
        expect(may2033Ms).toBeGreaterThanOrEqual(SECONDS_THRESHOLD);

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: may2033Ms },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await resultPromise;

        expect(handlerSpy).not.toHaveBeenCalled();
      }, 15000);
    });

    describe('Real-world OAuth provider timestamp formats', () => {
      it('should handle Google/MCP OAuth style (milliseconds, current + expires_in * 1000)', async () => {
        const expiresIn = 3600;
        const googleStyleExpiry = Date.now() + expiresIn * 1000;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'google_token', expires_at: googleStyleExpiry },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 7200000 });
        const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await resultPromise;

        expect(handlerSpy).not.toHaveBeenCalled();
      }, 15000);

      it('should handle OIDC style (seconds, Unix epoch)', async () => {
        const oidcStyleExpiry = Math.floor(Date.now() / 1000) + 3600;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'oidc_token', expires_at: oidcStyleExpiry },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 7200000 });
        const resultPromise = tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await resultPromise;

        expect(handlerSpy).not.toHaveBeenCalled();
      }, 15000);

      it('should handle expired Google/MCP OAuth style token', async () => {
        const expiredGoogleStyle = Date.now() - 60000;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 70000,
          result: { access_token: 'expired_google', expires_at: expiredGoogleStyle },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });

      it('should handle expired OIDC style token', async () => {
        const expiredOidcStyle = Math.floor(Date.now() / 1000) - 60;

        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 70000,
          result: { access_token: 'expired_oidc', expires_at: expiredOidcStyle },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });
    });

    describe('Threshold boundary validation', () => {
      /**
       * The threshold (1e10 = 10 billion) was chosen because:
       * - In SECONDS: 10 billion seconds from epoch = ~year 2286
       * - In MILLISECONDS: 10 billion ms from epoch = ~April 1970
       *
       * So any reasonable timestamp:
       * - Less than 10 billion -> must be seconds (we haven't reached year 2286 yet)
       * - Greater than or equal to 10 billion -> must be milliseconds (we're past April 1970)
       */

      it('should correctly identify threshold represents ~April 1970 in milliseconds', () => {
        const thresholdAsDate = new Date(SECONDS_THRESHOLD);
        expect(thresholdAsDate.getFullYear()).toBe(1970);
        expect(thresholdAsDate.getMonth()).toBe(3);
      });

      it('should correctly identify threshold represents ~year 2286 in seconds', () => {
        const thresholdAsSecondsDate = new Date(SECONDS_THRESHOLD * 1000);
        expect(thresholdAsSecondsDate.getFullYear()).toBe(2286);
      });

      it('should handle token expiring exactly at threshold boundary', async () => {
        await tokenStore.set(flowKey, {
          type,
          status: 'COMPLETED',
          metadata: {},
          createdAt: Date.now() - 5000,
          result: { access_token: 'test', expires_at: SECONDS_THRESHOLD },
        } as FlowState<TokenResult>);

        const handlerSpy = jest
          .fn()
          .mockResolvedValue({ access_token: 'new', expires_at: Date.now() + 3600000 });
        await tokenFlowManager.createFlowWithHandler(flowId, type, handlerSpy);

        expect(handlerSpy).toHaveBeenCalled();
      });
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
