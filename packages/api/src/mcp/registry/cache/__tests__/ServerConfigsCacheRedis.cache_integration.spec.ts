import { expect } from '@playwright/test';
import { ParsedServerConfig } from '~/mcp/types';

describe('ServerConfigsCacheRedis Integration Tests', () => {
  let ServerConfigsCacheRedis: typeof import('../ServerConfigsCacheRedis').ServerConfigsCacheRedis;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let LeaderElection: typeof import('~/cluster/LeaderElection').LeaderElection;
  let checkIsLeader: () => Promise<boolean>;
  let cache: InstanceType<typeof import('../ServerConfigsCacheRedis').ServerConfigsCacheRedis>;

  // Test data
  const mockConfig1: ParsedServerConfig = {
    command: 'node',
    args: ['server1.js'],
    env: { TEST: 'value1' },
  };

  const mockConfig2: ParsedServerConfig = {
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
  };

  const mockConfig3: ParsedServerConfig = {
    command: 'node',
    args: ['server3.js'],
    url: 'http://localhost:3000',
    requiresOAuth: true,
  };

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ?? 'ServerConfigsCacheRedis-IntegrationTest';

    // Import modules after setting env vars
    const cacheModule = await import('../ServerConfigsCacheRedis');
    const redisClients = await import('~/cache/redisClients');
    const leaderElectionModule = await import('~/cluster/LeaderElection');
    const clusterModule = await import('~/cluster');

    ServerConfigsCacheRedis = cacheModule.ServerConfigsCacheRedis;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;
    checkIsLeader = clusterModule.isLeader;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for Redis to be ready
    if (!keyvRedisClient.isOpen) await keyvRedisClient.connect();

    // Clear any existing leader key to ensure clean state
    await keyvRedisClient.del(LeaderElection.LEADER_KEY);

    // Become leader so we can perform write operations (using default election instance)
    const isLeader = await checkIsLeader();
    expect(isLeader).toBe(true);
  });

  beforeEach(() => {
    // Create a fresh instance for each test with leaderOnly=true
    cache = new ServerConfigsCacheRedis('test-user', true);
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient) {
      const pattern = '*ServerConfigsCacheRedis-IntegrationTest*';
      if ('scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          await keyvRedisClient.del(key);
        }
      }
    }
  });

  afterAll(async () => {
    // Clear leader key to allow other tests to become leader
    if (keyvRedisClient) await keyvRedisClient.del(LeaderElection.LEADER_KEY);

    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('add and get operations', () => {
    it('should add and retrieve a server config', async () => {
      await cache.add('server1', mockConfig1);
      const result = await cache.get('server1');
      expect(result).toEqual(mockConfig1);
    });

    it('should return undefined for non-existent server', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should throw error when adding duplicate server', async () => {
      await cache.add('server1', mockConfig1);
      await expect(cache.add('server1', mockConfig2)).rejects.toThrow(
        'Server "server1" already exists in cache. Use update() to modify existing configs.',
      );
    });

    it('should handle multiple server configs', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      await cache.add('server3', mockConfig3);

      const result1 = await cache.get('server1');
      const result2 = await cache.get('server2');
      const result3 = await cache.get('server3');

      expect(result1).toEqual(mockConfig1);
      expect(result2).toEqual(mockConfig2);
      expect(result3).toEqual(mockConfig3);
    });

    it('should isolate caches by owner namespace', async () => {
      const userCache = new ServerConfigsCacheRedis('user1', true);
      const globalCache = new ServerConfigsCacheRedis('global', true);

      await userCache.add('server1', mockConfig1);
      await globalCache.add('server1', mockConfig2);

      const userResult = await userCache.get('server1');
      const globalResult = await globalCache.get('server1');

      expect(userResult).toEqual(mockConfig1);
      expect(globalResult).toEqual(mockConfig2);
    });
  });

  describe('getAll operation', () => {
    it('should return empty object when no servers exist', async () => {
      const result = await cache.getAll();
      expect(result).toEqual({});
    });

    it('should return all server configs', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      await cache.add('server3', mockConfig3);

      const result = await cache.getAll();
      expect(result).toEqual({
        server1: mockConfig1,
        server2: mockConfig2,
        server3: mockConfig3,
      });
    });

    it('should reflect updates in getAll', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      let result = await cache.getAll();
      expect(Object.keys(result).length).toBe(2);

      await cache.add('server3', mockConfig3);
      result = await cache.getAll();
      expect(Object.keys(result).length).toBe(3);
      expect(result.server3).toEqual(mockConfig3);
    });

    it('should only return configs for the specific owner', async () => {
      const userCache = new ServerConfigsCacheRedis('user1', true);
      const globalCache = new ServerConfigsCacheRedis('global', true);

      await userCache.add('server1', mockConfig1);
      await userCache.add('server2', mockConfig2);
      await globalCache.add('server3', mockConfig3);

      const userResult = await userCache.getAll();
      const globalResult = await globalCache.getAll();

      expect(Object.keys(userResult).length).toBe(2);
      expect(Object.keys(globalResult).length).toBe(1);
      expect(userResult.server1).toEqual(mockConfig1);
      expect(userResult.server3).toBeUndefined();
      expect(globalResult.server3).toEqual(mockConfig3);
    });
  });

  describe('update operation', () => {
    it('should update an existing server config', async () => {
      await cache.add('server1', mockConfig1);
      expect(await cache.get('server1')).toEqual(mockConfig1);

      await cache.update('server1', mockConfig2);
      const result = await cache.get('server1');
      expect(result).toEqual(mockConfig2);
    });

    it('should throw error when updating non-existent server', async () => {
      await expect(cache.update('non-existent', mockConfig1)).rejects.toThrow(
        'Server "non-existent" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should reflect updates in getAll', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      await cache.update('server1', mockConfig3);
      const result = await cache.getAll();
      expect(result.server1).toEqual(mockConfig3);
      expect(result.server2).toEqual(mockConfig2);
    });

    it('should only update in the specific owner namespace', async () => {
      const userCache = new ServerConfigsCacheRedis('user1', true);
      const globalCache = new ServerConfigsCacheRedis('global', true);

      await userCache.add('server1', mockConfig1);
      await globalCache.add('server1', mockConfig2);

      await userCache.update('server1', mockConfig3);

      expect(await userCache.get('server1')).toEqual(mockConfig3);
      expect(await globalCache.get('server1')).toEqual(mockConfig2);
    });
  });

  describe('remove operation', () => {
    it('should remove an existing server config', async () => {
      await cache.add('server1', mockConfig1);
      expect(await cache.get('server1')).toEqual(mockConfig1);

      await cache.remove('server1');
      expect(await cache.get('server1')).toBeUndefined();
    });

    it('should throw error when removing non-existent server', async () => {
      await expect(cache.remove('non-existent')).rejects.toThrow(
        'Failed to remove test-user server "non-existent"',
      );
    });

    it('should remove server from getAll results', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      let result = await cache.getAll();
      expect(Object.keys(result).length).toBe(2);

      await cache.remove('server1');
      result = await cache.getAll();
      expect(Object.keys(result).length).toBe(1);
      expect(result.server1).toBeUndefined();
      expect(result.server2).toEqual(mockConfig2);
    });

    it('should allow re-adding a removed server', async () => {
      await cache.add('server1', mockConfig1);
      await cache.remove('server1');
      await cache.add('server1', mockConfig3);

      const result = await cache.get('server1');
      expect(result).toEqual(mockConfig3);
    });

    it('should only remove from the specific owner namespace', async () => {
      const userCache = new ServerConfigsCacheRedis('user1', true);
      const globalCache = new ServerConfigsCacheRedis('global', true);

      await userCache.add('server1', mockConfig1);
      await globalCache.add('server1', mockConfig2);

      await userCache.remove('server1');

      expect(await userCache.get('server1')).toBeUndefined();
      expect(await globalCache.get('server1')).toEqual(mockConfig2);
    });
  });
});
