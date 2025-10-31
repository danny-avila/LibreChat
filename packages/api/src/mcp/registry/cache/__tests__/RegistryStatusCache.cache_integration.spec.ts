import { expect } from '@playwright/test';

describe('RegistryStatusCache Integration Tests', () => {
  let registryStatusCache: typeof import('../RegistryStatusCache').registryStatusCache;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let LeaderElection: typeof import('~/cluster/LeaderElection').LeaderElection;
  let leaderInstance: InstanceType<typeof import('~/cluster/LeaderElection').LeaderElection>;

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ?? 'RegistryStatusCache-IntegrationTest';

    // Import modules after setting env vars
    const statusCacheModule = await import('../RegistryStatusCache');
    const redisClients = await import('~/cache/redisClients');
    const leaderElectionModule = await import('~/cluster/LeaderElection');

    registryStatusCache = statusCacheModule.registryStatusCache;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for Redis to be ready
    if (!keyvRedisClient.isOpen) await keyvRedisClient.connect();

    // Become leader so we can perform write operations
    leaderInstance = new LeaderElection();
    const isLeader = await leaderInstance.isLeader();
    expect(isLeader).toBe(true);
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient) {
      const pattern = '*RegistryStatusCache-IntegrationTest*';
      if ('scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          await keyvRedisClient.del(key);
        }
      }
    }
  });

  afterAll(async () => {
    // Resign as leader
    if (leaderInstance) await leaderInstance.resign();

    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('Initialization status tracking', () => {
    it('should return false for isInitialized when not set', async () => {
      const initialized = await registryStatusCache.isInitialized();
      expect(initialized).toBe(false);
    });

    it('should set and get initialized status', async () => {
      await registryStatusCache.setInitialized(true);
      const initialized = await registryStatusCache.isInitialized();
      expect(initialized).toBe(true);

      await registryStatusCache.setInitialized(false);
      const uninitialized = await registryStatusCache.isInitialized();
      expect(uninitialized).toBe(false);
    });
  });
});
