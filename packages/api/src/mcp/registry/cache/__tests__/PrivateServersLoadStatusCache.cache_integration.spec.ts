import { expect } from '@playwright/test';

describe('PrivateServersLoadStatusCache Integration Tests', () => {
  let loadStatusCache: typeof import('../PrivateServersLoadStatusCache').privateServersLoadStatusCache;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let testCounter = 0;

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX = 'PrivateServersLoadStatusCache-IntegrationTest';

    // Import modules after setting env vars
    const loadStatusCacheModule = await import('../PrivateServersLoadStatusCache');
    const redisClients = await import('~/cache/redisClients');

    loadStatusCache = loadStatusCacheModule.privateServersLoadStatusCache;
    keyvRedisClient = redisClients.keyvRedisClient;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for Redis connection and topology discovery to complete
    await redisClients.keyvRedisClientReady;

    process.setMaxListeners(200);
  });

  beforeEach(() => {
    jest.resetModules();
    testCounter++;
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      const pattern = '*PrivateServersLoadStatusCache-IntegrationTest*';
      const keysToDelete: string[] = [];

      // Collect all keys first
      for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
        keysToDelete.push(key);
      }

      // Delete in parallel for cluster mode efficiency
      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map((key) => keyvRedisClient!.del(key)));
      }
    }
  });

  afterAll(async () => {
    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('isLoaded() and setLoaded() integration', () => {
    it('should persist loaded status in cache', async () => {
      const userId = `user-persist-${testCounter}`;

      expect(await loadStatusCache.isLoaded(userId)).toBe(false);

      await loadStatusCache.setLoaded(userId, 60000);

      expect(await loadStatusCache.isLoaded(userId)).toBe(true);
    });

    it('should handle multiple users independently', async () => {
      const user1 = `user-multi-1-${testCounter}`;
      const user2 = `user-multi-2-${testCounter}`;
      const user3 = `user-multi-3-${testCounter}`;

      await loadStatusCache.setLoaded(user1, 60000);
      await loadStatusCache.setLoaded(user2, 60000);

      expect(await loadStatusCache.isLoaded(user1)).toBe(true);
      expect(await loadStatusCache.isLoaded(user2)).toBe(true);
      expect(await loadStatusCache.isLoaded(user3)).toBe(false);
    });

    it('should respect TTL expiration (short TTL for testing)', async () => {
      const userId = `user-ttl-expire-${testCounter}`;

      // Set with 1 second TTL
      await loadStatusCache.setLoaded(userId, 1000);

      expect(await loadStatusCache.isLoaded(userId)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await loadStatusCache.isLoaded(userId)).toBe(false);
    }, 10000);

    it('should allow re-setting loaded status', async () => {
      const userId = `user-reset-${testCounter}`;

      await loadStatusCache.setLoaded(userId, 60000);
      expect(await loadStatusCache.isLoaded(userId)).toBe(true);

      await loadStatusCache.clearLoaded(userId);
      expect(await loadStatusCache.isLoaded(userId)).toBe(false);

      await loadStatusCache.setLoaded(userId, 60000);
      expect(await loadStatusCache.isLoaded(userId)).toBe(true);
    });
  });

  describe('acquireLoadLock() and releaseLoadLock() integration', () => {
    it('should acquire lock successfully when available', async () => {
      const userId = `user-lock-acquire-${testCounter}`;

      const acquired = await loadStatusCache.acquireLoadLock(userId, 10000);

      expect(acquired).toBe(true);

      // Clean up
      await loadStatusCache.releaseLoadLock(userId);
    });

    it('should prevent concurrent lock acquisition', async () => {
      const userId = `user-lock-concurrent-${testCounter}`;

      const lock1 = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(lock1).toBe(true);

      const lock2 = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(lock2).toBe(false);

      // Release lock
      await loadStatusCache.releaseLoadLock(userId);

      // Should be able to acquire again
      const lock3 = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(lock3).toBe(true);

      await loadStatusCache.releaseLoadLock(userId);
    });

    it('should auto-release lock after TTL expires', async () => {
      const userId = `user-lock-ttl-${testCounter}`;

      const acquired = await loadStatusCache.acquireLoadLock(userId, 1000); // 1 second TTL
      expect(acquired).toBe(true);

      // Lock should prevent acquisition
      const blocked = await loadStatusCache.acquireLoadLock(userId, 1000);
      expect(blocked).toBe(false);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be able to acquire now
      const reacquired = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(reacquired).toBe(true);

      await loadStatusCache.releaseLoadLock(userId);
    }, 10000);

    it('should handle locks for multiple users independently', async () => {
      const user1 = `user-lock-multi-1-${testCounter}`;
      const user2 = `user-lock-multi-2-${testCounter}`;
      const user3 = `user-lock-multi-3-${testCounter}`;

      const lock1 = await loadStatusCache.acquireLoadLock(user1, 10000);
      const lock2 = await loadStatusCache.acquireLoadLock(user2, 10000);
      const lock3 = await loadStatusCache.acquireLoadLock(user3, 10000);

      expect(lock1).toBe(true);
      expect(lock2).toBe(true);
      expect(lock3).toBe(true);

      await loadStatusCache.releaseLoadLock(user1);
      await loadStatusCache.releaseLoadLock(user2);
      await loadStatusCache.releaseLoadLock(user3);
    });

    it('should allow release of non-existent lock without error', async () => {
      const userId = `user-lock-nonexist-${testCounter}`;
      await expect(loadStatusCache.releaseLoadLock(userId)).resolves.not.toThrow();
    });
  });

  describe('waitForLoad() integration', () => {
    it('should wait and detect when loaded flag is set', async () => {
      const userId = `user-wait-detect-${testCounter}`;

      // Start waiting in background
      const waitPromise = loadStatusCache.waitForLoad(userId, 2000, 100);

      // Simulate another process setting the loaded flag after 300ms
      const setLoadedPromise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          await loadStatusCache.setLoaded(userId, 60000);
          // Add small delay to ensure Redis write completes
          await new Promise((r) => setTimeout(r, 50));
          resolve();
        }, 300);
      });

      // Await both in parallel - waitPromise should complete first
      const [result] = await Promise.all([waitPromise, setLoadedPromise]);

      expect(result).toBe(true);
    }, 5000);

    it('should timeout if loaded flag is never set', async () => {
      const userId = `user-timeout-${testCounter}`;

      const result = await loadStatusCache.waitForLoad(userId, 300, 50);

      expect(result).toBe(false);
    }, 1000);

    it('should return immediately if already loaded', async () => {
      const userId = `user-immediate-${testCounter}`;

      await loadStatusCache.setLoaded(userId, 60000);
      // Small delay to ensure Redis write completes
      await new Promise((resolve) => setTimeout(resolve, 50));

      const startTime = Date.now();
      const result = await loadStatusCache.waitForLoad(userId, 5000, 100);
      const elapsed = Date.now() - startTime;

      expect(result).toBe(true);
      expect(elapsed).toBeLessThan(300); // Increased tolerance for CI environments
    });
  });

  describe('Complete load workflow integration', () => {
    it('should simulate distributed load coordination', async () => {
      const userId = `user-distributed-${testCounter}`;

      // Process 1: Acquires lock and loads
      const lock1 = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(lock1).toBe(true);

      // Process 2: Tries to acquire lock (should fail) and waits
      const lock2 = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(lock2).toBe(false);

      const waitPromise = loadStatusCache.waitForLoad(userId, 3000, 100);

      // Process 1: Completes loading after 300ms
      const process1Promise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          await loadStatusCache.setLoaded(userId, 60000);
          await new Promise((r) => setTimeout(r, 50)); // Redis write delay
          await loadStatusCache.releaseLoadLock(userId);
          resolve();
        }, 300);
      });

      // Process 2: Should detect completion
      const completed = await waitPromise;
      expect(completed).toBe(true);

      // Both processes should now see it as loaded
      expect(await loadStatusCache.isLoaded(userId)).toBe(true);

      // Wait for process 1 to complete cleanup
      await process1Promise;
    }, 10000);

    it('should handle process crash scenario (lock timeout)', async () => {
      const userId = `user-crash-${testCounter}`;

      // Process 1: Acquires lock but crashes (doesn't release)
      const lock1 = await loadStatusCache.acquireLoadLock(userId, 1000); // 1 second TTL
      expect(lock1).toBe(true);
      // (simulate crash - no releaseLoadLock call)

      // Process 2: Waits for timeout
      const waitResult = await loadStatusCache.waitForLoad(userId, 1500, 200);
      expect(waitResult).toBe(false); // Timeout (process 1 never completed)

      // After lock TTL expires, process 2 can retry
      await new Promise((resolve) => setTimeout(resolve, 200));

      const retryLock = await loadStatusCache.acquireLoadLock(userId, 10000);
      expect(retryLock).toBe(true);

      // Process 2 completes successfully
      await loadStatusCache.setLoaded(userId, 60000);
      await loadStatusCache.releaseLoadLock(userId);

      expect(await loadStatusCache.isLoaded(userId)).toBe(true);
    }, 10000);

    it('should handle concurrent user loads independently', async () => {
      const user1 = `user-concurrent-1-${testCounter}`;
      const user2 = `user-concurrent-2-${testCounter}`;
      const user3 = `user-concurrent-3-${testCounter}`;

      // Simulate 3 users loading concurrently
      const user1Lock = await loadStatusCache.acquireLoadLock(user1, 10000);
      const user2Lock = await loadStatusCache.acquireLoadLock(user2, 10000);
      const user3Lock = await loadStatusCache.acquireLoadLock(user3, 10000);

      expect(user1Lock).toBe(true);
      expect(user2Lock).toBe(true);
      expect(user3Lock).toBe(true);

      // All complete independently
      await Promise.all([
        (async () => {
          await loadStatusCache.setLoaded(user1, 60000);
          await loadStatusCache.releaseLoadLock(user1);
        })(),
        (async () => {
          await loadStatusCache.setLoaded(user2, 60000);
          await loadStatusCache.releaseLoadLock(user2);
        })(),
        (async () => {
          await loadStatusCache.setLoaded(user3, 60000);
          await loadStatusCache.releaseLoadLock(user3);
        })(),
      ]);

      // Small delay for Redis propagation
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(await loadStatusCache.isLoaded(user1)).toBe(true);
      expect(await loadStatusCache.isLoaded(user2)).toBe(true);
      expect(await loadStatusCache.isLoaded(user3)).toBe(true);
    });
  });

  describe('TTL synchronization', () => {
    it('should keep loaded flag and cache entry in sync via TTL', async () => {
      const userId = `user-ttl-sync-${testCounter}`;

      // Set loaded flag with 1 second TTL
      await loadStatusCache.setLoaded(userId, 1000);

      expect(await loadStatusCache.isLoaded(userId)).toBe(true);

      // After TTL expires, both should be gone
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await loadStatusCache.isLoaded(userId)).toBe(false);

      // This simulates cache entry and loaded flag being in sync
      // In real usage, if cache entries expire, loaded flag should also expire
    }, 10000);

    it('should allow different TTLs for different users', async () => {
      const user1 = `user-ttl-diff-1-${testCounter}`;
      const user2 = `user-ttl-diff-2-${testCounter}`;

      await loadStatusCache.setLoaded(user1, 1000); // 1 second
      await loadStatusCache.setLoaded(user2, 3000); // 3 seconds

      expect(await loadStatusCache.isLoaded(user1)).toBe(true);
      expect(await loadStatusCache.isLoaded(user2)).toBe(true);

      // Wait for user1 to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await loadStatusCache.isLoaded(user1)).toBe(false);
      expect(await loadStatusCache.isLoaded(user2)).toBe(true); // Still valid

      // Wait for user2 to expire
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(await loadStatusCache.isLoaded(user2)).toBe(false);
    }, 10000);
  });

  describe('clearLoaded() integration', () => {
    it('should clear loaded status immediately', async () => {
      const userId = `user-clear-${testCounter}`;

      await loadStatusCache.setLoaded(userId, 60000);
      expect(await loadStatusCache.isLoaded(userId)).toBe(true);

      await loadStatusCache.clearLoaded(userId);
      expect(await loadStatusCache.isLoaded(userId)).toBe(false);
    });

    it('should allow clearing multiple users', async () => {
      const user1 = `user-clear-multi-1-${testCounter}`;
      const user2 = `user-clear-multi-2-${testCounter}`;

      await loadStatusCache.setLoaded(user1, 60000);
      await loadStatusCache.setLoaded(user2, 60000);

      await loadStatusCache.clearLoaded(user1);
      await loadStatusCache.clearLoaded(user2);

      expect(await loadStatusCache.isLoaded(user1)).toBe(false);
      expect(await loadStatusCache.isLoaded(user2)).toBe(false);
    });
  });
});
