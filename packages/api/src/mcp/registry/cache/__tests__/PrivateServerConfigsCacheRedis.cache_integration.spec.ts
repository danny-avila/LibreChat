import { expect } from '@playwright/test';
import { ParsedServerConfig } from '~/mcp/types';

describe('PrivateServerConfigsCacheRedis Integration Tests', () => {
  let PrivateServerConfigsCacheRedis: typeof import('../PrivateServerConfigs/PrivateServerConfigsCacheRedis').PrivateServerConfigsCacheRedis;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let cache: InstanceType<
    typeof import('../PrivateServerConfigs/PrivateServerConfigsCacheRedis').PrivateServerConfigsCacheRedis
  >;

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
    process.env.USE_REDIS_CLUSTER = process.env.USE_REDIS_CLUSTER ?? 'false';
    console.log('USING CLUSETER....', process.env.USE_REDIS_CLUSTER);

    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ?? 'PrivateServerConfigsCacheRedis-IntegrationTest';

    // Import modules after setting env vars
    const cacheModule = await import('../PrivateServerConfigs/PrivateServerConfigsCacheRedis');
    const redisClients = await import('~/cache/redisClients');

    PrivateServerConfigsCacheRedis = cacheModule.PrivateServerConfigsCacheRedis;
    keyvRedisClient = redisClients.keyvRedisClient;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');
    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for connection and topology discovery to complete
    await redisClients.keyvRedisClientReady;
  });

  beforeEach(() => {
    // Create a fresh instance for each test
    cache = new PrivateServerConfigsCacheRedis();
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      const pattern = '*PrivateServerConfigsCacheRedis-IntegrationTest*';
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

  describe('add and get operations', () => {
    it('should add and retrieve a server config for a user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      const result = await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      expect(result).toMatchObject(mockConfig1);
    });

    it('should return undefined for non-existent server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const result = await cache.get(`user1-${randonPrefix}`, 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should throw error when adding duplicate server for same user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await expect(
        cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig2),
      ).rejects.toThrow(
        `Server "server1-${randonPrefix}" already exists in cache. Use update() to modify existing configs.`,
      );
    });

    it('should handle multiple server configs for a single user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user1-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      const result1 = await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      const result2 = await cache.get(`user1-${randonPrefix}`, `server2-${randonPrefix}`);
      const result3 = await cache.get(`user1-${randonPrefix}`, `server3-${randonPrefix}`);

      expect(result1).toMatchObject(mockConfig1);
      expect(result2).toMatchObject(mockConfig2);
      expect(result3).toMatchObject(mockConfig3);
    });

    it('should isolate server configs between different users', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig2);

      const user1Result = await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      const user2Result = await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`);

      expect(user1Result).toMatchObject(mockConfig1);
      expect(user2Result).toMatchObject(mockConfig2);
    });
  });

  describe('getAll operation', () => {
    it('should return empty object when user has no servers', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const result = await cache.getAll(`user1-${randonPrefix}`);
      expect(result).toMatchObject({});
    });

    it('should return all server configs for a user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user1-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      const result = await cache.getAll(`user1-${randonPrefix}`);
      expect(result).toMatchObject({
        [`server1-${randonPrefix}`]: mockConfig1,
        [`server2-${randonPrefix}`]: mockConfig2,
        [`server3-${randonPrefix}`]: mockConfig3,
      });
    });

    it('should only return configs for specific user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user2-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      const user1Result = await cache.getAll(`user1-${randonPrefix}`);
      const user2Result = await cache.getAll(`user2-${randonPrefix}`);

      expect(Object.keys(user1Result).length).toBe(2);
      expect(Object.keys(user2Result).length).toBe(1);
      expect(user1Result.server3).toBeUndefined();
      expect(user2Result.server1).toBeUndefined();
    });
  });

  describe('update operation', () => {
    it('should update an existing server config', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig1,
      );

      await cache.update(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig2);
      const result = await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      expect(result).toMatchObject(mockConfig2);
    });

    it('should throw error when updating non-existent server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await expect(
        cache.update(`user1-${randonPrefix}`, 'non-existent', mockConfig1),
      ).rejects.toThrow(
        'Server "non-existent" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should only update for specific user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig2);

      await cache.update(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig3);

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
    });
  });

  describe('remove operation', () => {
    it('should remove an existing server config', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig1,
      );

      await cache.remove(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });

    it('should throw error when removing non-existent server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await expect(cache.remove(`user1-${randonPrefix}`, 'non-existent')).rejects.toThrow(
        `Failed to remove user1-${randonPrefix} server "non-existent" in cache.`,
      );
    });

    it('should only remove from specific user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig2);

      await cache.remove(`user1-${randonPrefix}`, `server1-${randonPrefix}`);

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
    });

    it('should allow re-adding a removed server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.remove(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig3);

      const result = await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`);
      expect(result).toMatchObject(mockConfig3);
    });
  });

  describe('reset operation', () => {
    it('should clear all servers for a specific user', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user2-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      await cache.reset(`user1-${randonPrefix}`);

      const user1Result = await cache.getAll(`user1-${randonPrefix}`);
      const user2Result = await cache.getAll(`user2-${randonPrefix}`);

      expect(Object.keys(user1Result).length).toBe(0);
      expect(Object.keys(user2Result).length).toBe(1);
    });
  });

  describe('has operation', () => {
    it('should return true for users with loaded cache', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      console.log('check');
      expect(await cache.has(`user1-${randonPrefix}`)).toBe(true);
    });

    it('should return false for users without loaded cache', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      expect(await cache.has(`user1-${randonPrefix}`)).toBe(false);
    });
  });

  describe('updateServerConfigIfExists operation', () => {
    it('should update server config for all users who have it', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user3-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);

      await cache.updateServerConfigIfExists(`server1-${randonPrefix}`, mockConfig3);

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
      expect(await cache.get(`user3-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user3-${randonPrefix}`, `server2-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
    });

    it('should update lastUpdatedAt timestamp', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, 'server1-share', mockConfig1);
      await cache.add(`user2-${randonPrefix}`, 'server1-share', mockConfig1);

      const timeBeforeUpdate = Date.now();
      await new Promise((r) => setTimeout(() => r(true), 100));
      await cache.updateServerConfigIfExists('server1-share', mockConfig2);

      const user1Result = await cache.get(`user1-${randonPrefix}`, 'server1-share');
      const user2Result = await cache.get(`user2-${randonPrefix}`, 'server1-share');
      expect(user1Result).toBeDefined();
      expect(user1Result!.lastUpdatedAt! - timeBeforeUpdate).toBeGreaterThan(0);
      expect(user2Result!.lastUpdatedAt! - timeBeforeUpdate).toBeGreaterThan(0);
    });

    it('should handle case when no users have the server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user2-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      await expect(
        cache.updateServerConfigIfExists(`server1-${randonPrefix}`, mockConfig1),
      ).resolves.not.toThrow();

      expect(await cache.get(`user1-${randonPrefix}`, `server2-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
      expect(await cache.get(`user2-${randonPrefix}`, `server3-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
    });

    it('should handle case with no user caches', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await expect(
        cache.updateServerConfigIfExists(`server1-${randonPrefix}`, mockConfig1),
      ).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache1.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);

      await cache2.updateServerConfigIfExists(`server1-${randonPrefix}`, mockConfig3);

      expect(await cache1.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
      expect(await cache1.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig3,
      );
    });
  });

  describe('addServerConfigIfCacheExists operation', () => {
    it('should add server to specified users with initialized caches', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, 'other', mockConfig1);
      await cache.add(`user2-${randonPrefix}`, 'other', mockConfig1);

      await cache.addServerConfigIfCacheExists(
        [`user1-${randonPrefix}`, `user2-${randonPrefix}`, `user3-${randonPrefix}`],
        `server1-${randonPrefix}`,
        mockConfig2,
      );

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
      expect(await cache.get(`user3-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });

    it('should not add to users without initialized caches', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.addServerConfigIfCacheExists(
        [`user1-${randonPrefix}`, `user2-${randonPrefix}`],
        `server1-${randonPrefix}`,
        mockConfig1,
      );

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });

    it('should handle empty userIds array', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await expect(
        cache.addServerConfigIfCacheExists([], `server1-${randonPrefix}`, mockConfig1),
      ).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add(`user1-${randonPrefix}`, 'other', mockConfig1);
      await cache1.add(`user2-${randonPrefix}`, 'other', mockConfig1);

      await cache2.addServerConfigIfCacheExists(
        [`user1-${randonPrefix}`, `user2-${randonPrefix}`, `user3-${randonPrefix}`],
        `server1-${randonPrefix}`,
        mockConfig2,
      );

      expect(await cache1.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
      expect(await cache1.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig2,
      );
      expect(await cache1.get(`user3-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });
  });

  describe('removeServerConfigIfCacheExists operation', () => {
    it('should remove server from specified users', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user3-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);

      await cache.removeServerConfigIfCacheExists(
        [`user1-${randonPrefix}`, `user3-${randonPrefix}`],
        `server1-${randonPrefix}`,
      );

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toMatchObject(
        mockConfig1,
      );
      expect(await cache.get(`user3-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });

    it('should handle users who do not have the server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);

      await expect(
        cache.removeServerConfigIfCacheExists(
          [`user1-${randonPrefix}`, `user2-${randonPrefix}`],
          `server1-${randonPrefix}`,
        ),
      ).resolves.not.toThrow();

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });

    it('should handle empty userIds array', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await expect(
        cache.removeServerConfigIfCacheExists([], `server1-${randonPrefix}`),
      ).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache1.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);

      await cache2.removeServerConfigIfCacheExists(
        [`user1-${randonPrefix}`, `user2-${randonPrefix}`],
        `server1-${randonPrefix}`,
      );

      expect(await cache1.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache1.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
    });
  });

  describe('findUsersWithServer operation', () => {
    it('should return all users who have the server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user3-${randonPrefix}`, 'other', mockConfig2);

      const users = await cache.findUsersWithServer(`server1-${randonPrefix}`);

      expect(users.sort()).toEqual([`user1-${randonPrefix}`, `user2-${randonPrefix}`].sort());
    });

    it('should return empty array if no users have the server', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, 'other', mockConfig1);

      const users = await cache.findUsersWithServer(`server1-${randonPrefix}`);

      expect(users).toEqual([]);
    });

    it('should return empty array with no user caches', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const users = await cache.findUsersWithServer(`server1-${randonPrefix}`);

      expect(users).toEqual([]);
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache1.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache1.add(`user3-${randonPrefix}`, 'other', mockConfig2);

      const users = await cache2.findUsersWithServer(`server1-${randonPrefix}`);

      expect(users.sort()).toEqual([`user1-${randonPrefix}`, `user2-${randonPrefix}`].sort());
    });
  });

  describe('resetAll operation', () => {
    it('should clear all servers for all users in Redis', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      await cache.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user1-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);
      await cache.add(`user2-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache.add(`user2-${randonPrefix}`, `server3-${randonPrefix}`, mockConfig3);

      await cache.resetAll();

      expect(await cache.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user1-${randonPrefix}`, `server2-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user2-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache.get(`user2-${randonPrefix}`, `server3-${randonPrefix}`)).toBeUndefined();
    });

    it.skip('should handle case with no user caches', async () => {
      // const randonPrefix = Math.random().toString(36).substring(2, 8);

      // Should not throw
      await expect(cache.resetAll()).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const randonPrefix = Math.random().toString(36).substring(2, 8);

      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      // Add servers using cache1
      await cache1.add(`user1-${randonPrefix}`, `server1-${randonPrefix}`, mockConfig1);
      await cache1.add(`user2-${randonPrefix}`, `server2-${randonPrefix}`, mockConfig2);

      // Reset using cache2
      await cache2.resetAll();

      // Verify using cache1
      expect(await cache1.get(`user1-${randonPrefix}`, `server1-${randonPrefix}`)).toBeUndefined();
      expect(await cache1.get(`user2-${randonPrefix}`, `server2-${randonPrefix}`)).toBeUndefined();
    });
  });
});
