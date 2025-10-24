import type { Redis, Cluster } from 'ioredis';
import type { RedisClientType, RedisClusterType } from '@redis/client';

type RedisClient = RedisClientType | RedisClusterType | Redis | Cluster;

describe('redisClients Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let ioredisClient: Redis | Cluster | null = null;
  let keyvRedisClient: RedisClientType | RedisClusterType | null = null;

  // Helper function to test set/get/delete operations
  const testRedisOperations = async (client: RedisClient, keyPrefix: string): Promise<void> => {
    // Wait  cluster to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const testKey = `${keyPrefix}-test-key`;
    const testValue = `${keyPrefix}-test-value`;

    // Test set operation
    await client.set(testKey, testValue);

    // Test get operation
    const result = await client.get(testKey);
    expect(result).toBe(testValue);

    // Test delete operation
    const deleteResult = await client.del(testKey);
    expect(deleteResult).toBe(1);

    // Verify key is deleted
    const deletedResult = await client.get(testKey);
    expect(deletedResult).toBeNull();
  };

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Clear Redis-related env vars
    delete process.env.USE_REDIS;
    delete process.env.REDIS_URI;
    delete process.env.USE_REDIS_CLUSTER;
    delete process.env.REDIS_PING_INTERVAL;
    delete process.env.REDIS_KEY_PREFIX;

    // Set common test configuration
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'Redis-Integration-Test';
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';
    process.env.REDIS_PING_INTERVAL = '1000';

    // Clear module cache to reload module
    jest.resetModules();
  });

  afterEach(async () => {
    // Clean up test keys using the prefix
    if (ioredisClient && ioredisClient.status === 'ready') {
      try {
        const keys = await ioredisClient.keys('Redis-Integration-Test::*');
        if (keys.length > 0) {
          await ioredisClient.del(...keys);
        }
      } catch (error: any) {
        console.warn('Error cleaning up test keys:', error.message);
      }
    }

    // Cleanup Redis connections
    if (ioredisClient) {
      try {
        if (ioredisClient.status === 'ready') {
          ioredisClient.disconnect();
        }
      } catch (error: any) {
        console.warn('Error disconnecting ioredis client:', error.message);
      }
      ioredisClient = null;
    }

    if (keyvRedisClient) {
      try {
        // Try to disconnect - keyv/redis client doesn't have an isReady property
        await keyvRedisClient.disconnect();
      } catch (error: any) {
        console.warn('Error disconnecting keyv redis client:', error.message);
      }
      keyvRedisClient = null;
    }

    process.env = originalEnv;
    jest.resetModules();
  });

  describe('ioredis Client Tests', () => {
    describe('when USE_REDIS is false', () => {
      test('should have null client', async () => {
        process.env.USE_REDIS = 'false';

        const clients = await import('../redisClients');
        ioredisClient = clients.ioredisClient;

        expect(ioredisClient).toBeNull();
      });
    });

    describe('when connecting to a Redis instance', () => {
      test('should connect and perform set/get/delete operations', async () => {
        process.env.USE_REDIS = 'true';
        process.env.USE_REDIS_CLUSTER = 'false';
        process.env.REDIS_URI = 'redis://127.0.0.1:6379';

        const clients = await import('../redisClients');
        ioredisClient = clients.ioredisClient;
        await testRedisOperations(ioredisClient!, 'ioredis-single');
      });
    });

    describe('when connecting to a Redis cluster', () => {
      test('should connect to cluster and perform set/get/delete operations', async () => {
        process.env.USE_REDIS = 'true';
        process.env.USE_REDIS_CLUSTER = 'true';
        process.env.REDIS_URI =
          'redis://127.0.0.1:7001,redis://127.0.0.1:7002,redis://127.0.0.1:7003';

        const clients = await import('../redisClients');
        ioredisClient = clients.ioredisClient;
        await testRedisOperations(ioredisClient!, 'ioredis-cluster');
      });
    });
  });

  describe('keyvRedisClient Tests', () => {
    describe('when USE_REDIS is false', () => {
      test('should have null client', async () => {
        process.env.USE_REDIS = 'false';

        const clients = await import('../redisClients');
        keyvRedisClient = clients.keyvRedisClient;
        expect(keyvRedisClient).toBeNull();
      });
    });

    describe('when connecting to a Redis instance', () => {
      test('should connect and perform set/get/delete operations', async () => {
        process.env.USE_REDIS = 'true';
        process.env.USE_REDIS_CLUSTER = 'false';
        process.env.REDIS_URI = 'redis://127.0.0.1:6379';

        const clients = await import('../redisClients');
        keyvRedisClient = clients.keyvRedisClient;
        await testRedisOperations(keyvRedisClient!, 'keyv-single');
      });
    });

    describe('when connecting to a Redis cluster', () => {
      test('should connect to cluster and perform set/get/delete operations', async () => {
        process.env.USE_REDIS = 'true';
        process.env.USE_REDIS_CLUSTER = 'true';
        process.env.REDIS_URI =
          'redis://127.0.0.1:7001,redis://127.0.0.1:7002,redis://127.0.0.1:7003';

        const clients = await import('../redisClients');
        keyvRedisClient = clients.keyvRedisClient;
        await testRedisOperations(keyvRedisClient!, 'keyv-cluster');
      });
    });
  });
});
