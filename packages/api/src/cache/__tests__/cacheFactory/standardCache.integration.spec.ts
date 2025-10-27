import type { Keyv } from 'keyv';

// Mock GLOBAL_PREFIX_SEPARATOR
jest.mock('../../redisClients', () => {
  const originalModule = jest.requireActual('../../redisClients');
  return {
    ...originalModule,
    GLOBAL_PREFIX_SEPARATOR: '>>',
  };
});

describe('standardCache', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testCache: Keyv | null = null;

  // Helper function to verify Redis keys exist
  const expectRedisKeysExist = async (expectedKeys: string[]) => {
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    if (!ioredisClient) throw new Error('ioredisClient is null');
    const allKeys = await ioredisClient.keys('Cache-Integration-Test*');
    expectedKeys.forEach((expectedKey) => {
      expect(allKeys).toContain(expectedKey);
    });
  };

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Clear cache-related env vars
    delete process.env.USE_REDIS;
    delete process.env.REDIS_URI;
    delete process.env.USE_REDIS_CLUSTER;
    delete process.env.REDIS_PING_INTERVAL;
    delete process.env.REDIS_KEY_PREFIX;
    delete process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES;

    // Set test configuration
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'Cache-Integration-Test';
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';

    // Clear require cache to reload modules
    jest.resetModules();
  });

  afterEach(async () => {
    // Clean up test keys using prefix and test namespaces
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    if (ioredisClient && ioredisClient.status === 'ready') {
      try {
        const patterns = [
          'Cache-Integration-Test>>*',
          'Cache-Integration-Test>>test-namespace:*',
          'Cache-Integration-Test>>another-namespace:*',
        ];

        for (const pattern of patterns) {
          const keys = await ioredisClient.keys(pattern);
          if (keys.length > 0) {
            await ioredisClient.del(...keys);
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.warn('Error cleaning up test keys:', error.message);
        }
      }
    }

    // Clean up cache instance
    if (testCache) {
      try {
        await testCache.clear();
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.warn('Error clearing cache:', error.message);
        }
      }
      testCache = null;
    }

    process.env = originalEnv;
    jest.resetModules();
  });

  describe('when USE_REDIS is false', () => {
    test('should create in-memory cache', async () => {
      process.env.USE_REDIS = 'false';

      const cacheFactory = await import('../../cacheFactory');
      testCache = cacheFactory.standardCache('test-namespace');

      expect(testCache).toBeDefined();
      expect(testCache.constructor.name).toBe('Keyv');
    });

    test('should use fallback store when provided', async () => {
      process.env.USE_REDIS = 'false';
      const fallbackStore = new Map();

      const cacheFactory = await import('../../cacheFactory');
      testCache = cacheFactory.standardCache('test-namespace', 200, fallbackStore);

      expect(testCache).toBeDefined();
      // Type assertion to access internal options
      const cacheWithOpts = testCache as Keyv & {
        opts: { store: unknown; namespace: string; ttl: number };
      };
      expect(cacheWithOpts.opts.store).toBe(fallbackStore);
      expect(cacheWithOpts.opts.namespace).toBe('test-namespace');
      expect(cacheWithOpts.opts.ttl).toBe(200);
    });
  });

  describe('when connecting to a Redis server', () => {
    test('should handle different namespaces with correct prefixes', async () => {
      process.env.USE_REDIS = 'true';
      process.env.USE_REDIS_CLUSTER = 'false';
      process.env.REDIS_URI = 'redis://127.0.0.1:6379';

      const cacheFactory = await import('../../cacheFactory');

      const cache1 = cacheFactory.standardCache('namespace-one');
      const cache2 = cacheFactory.standardCache('namespace-two');

      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');

      // Verify both caches work independently
      expect(await cache1.get('key1')).toBe('value1');
      expect(await cache2.get('key2')).toBe('value2');
      expect(await cache1.get('key2')).toBeUndefined();
      expect(await cache2.get('key1')).toBeUndefined();

      // Verify Redis keys have correct prefixes for different namespaces
      await expectRedisKeysExist([
        'Cache-Integration-Test>>namespace-one:key1',
        'Cache-Integration-Test>>namespace-two:key2',
      ]);

      await cache1.clear();
      await cache2.clear();
    });

    test('should respect FORCED_IN_MEMORY_CACHE_NAMESPACES', async () => {
      process.env.USE_REDIS = 'true';
      process.env.USE_REDIS_CLUSTER = 'false';
      process.env.REDIS_URI = 'redis://127.0.0.1:6379';
      process.env.FORCED_IN_MEMORY_CACHE_NAMESPACES = 'ROLES'; // Use a valid cache key

      const cacheFactory = await import('../../cacheFactory');

      // This should create an in-memory cache despite USE_REDIS being true
      testCache = cacheFactory.standardCache('ROLES', 5000);

      expect(testCache).toBeDefined();
      expect(testCache.constructor.name).toBe('Keyv');
      // Type assertion to access internal options
      const cacheWithOpts = testCache as Keyv & { opts: { namespace: string; ttl: number } };
      expect(cacheWithOpts.opts.namespace).toBe('ROLES');
      expect(cacheWithOpts.opts.ttl).toBe(5000);
    });

    test('should handle TTL correctly', async () => {
      process.env.USE_REDIS = 'true';
      process.env.USE_REDIS_CLUSTER = 'false';
      process.env.REDIS_URI = 'redis://127.0.0.1:6379';

      const cacheFactory = await import('../../cacheFactory');
      testCache = cacheFactory.standardCache('ttl-test', 1000); // 1 second TTL

      const testKey = 'ttl-key';
      const testValue = 'ttl-value';

      await testCache.set(testKey, testValue);
      expect(await testCache.get(testKey)).toBe(testValue);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await testCache.get(testKey)).toBeUndefined();
    });
  });
});
