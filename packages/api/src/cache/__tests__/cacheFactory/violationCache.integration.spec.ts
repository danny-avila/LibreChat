interface ViolationData {
  count?: number;
  timestamp?: number;
  namespace?: number;
  data?: string;
  userId?: string;
  violations?: Array<{
    type: string;
    timestamp: number;
    severity: string;
  }>;
  metadata?: {
    ip: string;
    userAgent: string;
    nested: {
      deep: {
        value: string;
      };
    };
  };
}

describe('violationCache', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Clear cache-related env vars
    delete process.env.USE_REDIS;
    delete process.env.REDIS_URI;
    delete process.env.USE_REDIS_CLUSTER;
    delete process.env.REDIS_PING_INTERVAL;
    delete process.env.REDIS_KEY_PREFIX;

    // Set test configuration
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'Cache-Integration-Test';
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';

    // Clear require cache to reload modules
    jest.resetModules();
  });

  afterEach(async () => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('should create violation cache with Redis when USE_REDIS is true', async () => {
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = 'redis://127.0.0.1:6379';

    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const cache = cacheFactory.violationCache('test-violations', 60000); // 60 second TTL

    // Wait for Redis connection to be ready
    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    // Verify it returns a Keyv instance
    expect(cache).toBeDefined();
    expect(cache.constructor.name).toBe('Keyv');

    // Test basic cache operations
    const testKey = 'user:456:violation';
    const testValue: ViolationData = { count: 1, timestamp: Date.now() };

    // SET operation
    await cache.set(testKey, testValue);

    // GET operation
    const retrievedValue = await cache.get(testKey);
    expect(retrievedValue).toEqual(testValue);

    // DELETE operation
    const deleted = await cache.delete(testKey);
    expect(deleted).toBe(true);

    // Verify deletion
    const afterDelete = await cache.get(testKey);
    expect(afterDelete).toBeUndefined();
  });

  test('should use fallback store when USE_REDIS is false', async () => {
    process.env.USE_REDIS = 'false';

    const cacheFactory = await import('../../cacheFactory');
    const cache = cacheFactory.violationCache('test-violations');

    // Verify it returns a Keyv instance
    expect(cache).toBeDefined();
    expect(cache.constructor.name).toBe('Keyv');

    // Test basic operations with fallback store
    const testKey = 'user:789:violation';
    const testValue: ViolationData = { count: 2, timestamp: Date.now() };

    // SET operation
    await cache.set(testKey, testValue);

    // GET operation
    const retrievedValue = await cache.get(testKey);
    expect(retrievedValue).toEqual(testValue);

    // DELETE operation
    const deleted = await cache.delete(testKey);
    expect(deleted).toBe(true);

    // Verify deletion
    const afterDelete = await cache.get(testKey);
    expect(afterDelete).toBeUndefined();
  });

  test('should respect namespace prefixing', async () => {
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = 'redis://127.0.0.1:6379';

    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const cache1 = cacheFactory.violationCache('namespace1');
    const cache2 = cacheFactory.violationCache('namespace2');

    // Wait for Redis connection to be ready
    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    const testKey = 'shared-key';
    const value1: ViolationData = { namespace: 1 };
    const value2: ViolationData = { namespace: 2 };

    // Set same key in different namespaces
    await cache1.set(testKey, value1);
    await cache2.set(testKey, value2);

    // Verify namespace isolation
    const retrieved1 = await cache1.get(testKey);
    const retrieved2 = await cache2.get(testKey);

    expect(retrieved1).toEqual(value1);
    expect(retrieved2).toEqual(value2);

    // Clean up
    await cache1.delete(testKey);
    await cache2.delete(testKey);
  });

  test('should respect TTL settings', async () => {
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = 'redis://127.0.0.1:6379';

    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const ttl = 1000; // 1 second TTL
    const cache = cacheFactory.violationCache('ttl-test', ttl);

    // Wait for Redis connection to be ready
    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    const testKey = 'ttl-key';
    const testValue: ViolationData = { data: 'expires soon' };

    // Set value with TTL
    await cache.set(testKey, testValue);

    // Verify value exists immediately
    const immediate = await cache.get(testKey);
    expect(immediate).toEqual(testValue);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, ttl + 100));

    // Verify value has expired
    const expired = await cache.get(testKey);
    expect(expired).toBeUndefined();
  });

  test('should handle complex violation data structures', async () => {
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = 'redis://127.0.0.1:6379';

    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const cache = cacheFactory.violationCache('complex-violations');

    // Wait for Redis connection to be ready
    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    const complexData: ViolationData = {
      userId: 'user123',
      violations: [
        { type: 'rate_limit', timestamp: Date.now(), severity: 'warning' },
        { type: 'spam', timestamp: Date.now() - 1000, severity: 'critical' },
      ],
      metadata: {
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        nested: {
          deep: {
            value: 'test',
          },
        },
      },
    };

    const key = 'complex-violation-data';

    // Store complex data
    await cache.set(key, complexData);

    // Retrieve and verify
    const retrieved = await cache.get(key);
    expect(retrieved).toEqual(complexData);

    // Clean up
    await cache.delete(key);
  });
});
