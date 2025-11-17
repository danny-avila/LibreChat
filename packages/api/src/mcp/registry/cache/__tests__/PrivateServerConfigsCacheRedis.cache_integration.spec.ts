import { expect } from '@playwright/test';
import { ParsedServerConfig } from '~/mcp/types';
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

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
    lastUpdatedAt: FIXED_TIME,
  };

  const mockConfig2: ParsedServerConfig = {
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
    lastUpdatedAt: FIXED_TIME,
  };

  const mockConfig3: ParsedServerConfig = {
    command: 'node',
    args: ['server3.js'],
    url: 'http://localhost:3000',
    requiresOAuth: true,
    lastUpdatedAt: FIXED_TIME,
  };

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
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
    if (keyvRedisClient) {
      const pattern = '*PrivateServerConfigsCacheRedis-IntegrationTest*';
      if ('scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          await keyvRedisClient.del(key);
        }
      }
    }
  });

  afterAll(async () => {
    Date.now = originalDateNow;

    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('add and get operations', () => {
    it('should add and retrieve a server config for a user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      const result = await cache.get('user1', 'server1');
      expect(result).toEqual(mockConfig1);
    });

    it('should return undefined for non-existent server', async () => {
      const result = await cache.get('user1', 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should throw error when adding duplicate server for same user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await expect(cache.add('user1', 'server1', mockConfig2)).rejects.toThrow(
        'Server "server1" already exists in cache. Use update() to modify existing configs.',
      );
    });

    it('should handle multiple server configs for a single user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user1', 'server3', mockConfig3);

      const result1 = await cache.get('user1', 'server1');
      const result2 = await cache.get('user1', 'server2');
      const result3 = await cache.get('user1', 'server3');

      expect(result1).toEqual(mockConfig1);
      expect(result2).toEqual(mockConfig2);
      expect(result3).toEqual(mockConfig3);
    });

    it('should isolate server configs between different users', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig2);

      const user1Result = await cache.get('user1', 'server1');
      const user2Result = await cache.get('user2', 'server1');

      expect(user1Result).toEqual(mockConfig1);
      expect(user2Result).toEqual(mockConfig2);
    });
  });

  describe('getAll operation', () => {
    it('should return empty object when user has no servers', async () => {
      const result = await cache.getAll('user1');
      expect(result).toEqual({});
    });

    it('should return all server configs for a user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user1', 'server3', mockConfig3);

      const result = await cache.getAll('user1');
      expect(result).toEqual({
        server1: mockConfig1,
        server2: mockConfig2,
        server3: mockConfig3,
      });
    });

    it('should only return configs for specific user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server3', mockConfig3);

      const user1Result = await cache.getAll('user1');
      const user2Result = await cache.getAll('user2');

      expect(Object.keys(user1Result).length).toBe(2);
      expect(Object.keys(user2Result).length).toBe(1);
      expect(user1Result.server3).toBeUndefined();
      expect(user2Result.server1).toBeUndefined();
    });
  });

  describe('update operation', () => {
    it('should update an existing server config', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      expect(await cache.get('user1', 'server1')).toEqual(mockConfig1);

      await cache.update('user1', 'server1', mockConfig2);
      const result = await cache.get('user1', 'server1');
      expect(result).toEqual(mockConfig2);
    });

    it('should throw error when updating non-existent server', async () => {
      await expect(cache.update('user1', 'non-existent', mockConfig1)).rejects.toThrow(
        'Server "non-existent" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should only update for specific user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig2);

      await cache.update('user1', 'server1', mockConfig3);

      expect(await cache.get('user1', 'server1')).toEqual(mockConfig3);
      expect(await cache.get('user2', 'server1')).toEqual(mockConfig2);
    });
  });

  describe('remove operation', () => {
    it('should remove an existing server config', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      expect(await cache.get('user1', 'server1')).toEqual(mockConfig1);

      await cache.remove('user1', 'server1');
      expect(await cache.get('user1', 'server1')).toBeUndefined();
    });

    it('should throw error when removing non-existent server', async () => {
      await expect(cache.remove('user1', 'non-existent')).rejects.toThrow(
        'Failed to remove user1 server "non-existent" in cache.',
      );
    });

    it('should only remove from specific user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig2);

      await cache.remove('user1', 'server1');

      expect(await cache.get('user1', 'server1')).toBeUndefined();
      expect(await cache.get('user2', 'server1')).toEqual(mockConfig2);
    });

    it('should allow re-adding a removed server', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.remove('user1', 'server1');
      await cache.add('user1', 'server1', mockConfig3);

      const result = await cache.get('user1', 'server1');
      expect(result).toEqual(mockConfig3);
    });
  });

  describe('reset operation', () => {
    //skipping the test until issue #10487 is clarified https://github.com/danny-avila/LibreChat/issues/10487
    test.skip('should clear all servers for a specific user', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server3', mockConfig3);

      await cache.reset('user1');

      const user1Result = await cache.getAll('user1');
      const user2Result = await cache.getAll('user2');

      expect(Object.keys(user1Result).length).toBe(0);
      expect(Object.keys(user2Result).length).toBe(1);
    });
  });

  describe('has operation', () => {
    it('should return true for users with loaded cache', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      expect(await cache.has('user1')).toBe(true);
    });

    it('should return false for users without loaded cache', async () => {
      expect(await cache.has('user1')).toBe(false);
    });
  });

  describe('updateServerConfigIfExists operation', () => {
    it('should update server config for all users who have it', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig1);
      await cache.add('user3', 'server2', mockConfig2);

      await cache.updateServerConfigIfExists('server1', mockConfig3);

      expect(await cache.get('user1', 'server1')).toEqual(mockConfig3);
      expect(await cache.get('user2', 'server1')).toEqual(mockConfig3);
      expect(await cache.get('user3', 'server1')).toBeUndefined();
      expect(await cache.get('user3', 'server2')).toEqual(mockConfig2);
    });

    it('should update lastUpdatedAt timestamp', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig1);

      const newTime = FIXED_TIME + 10000;
      Date.now = jest.fn(() => newTime);

      await cache.updateServerConfigIfExists('server1', mockConfig2);

      const user1Result = await cache.get('user1', 'server1');
      const user2Result = await cache.get('user2', 'server1');

      expect(user1Result?.lastUpdatedAt).toBe(newTime);
      expect(user2Result?.lastUpdatedAt).toBe(newTime);

      Date.now = jest.fn(() => FIXED_TIME);
    });

    it('should handle case when no users have the server', async () => {
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server3', mockConfig3);

      await expect(cache.updateServerConfigIfExists('server1', mockConfig1)).resolves.not.toThrow();

      expect(await cache.get('user1', 'server2')).toEqual(mockConfig2);
      expect(await cache.get('user2', 'server3')).toEqual(mockConfig3);
    });

    it('should handle case with no user caches', async () => {
      await expect(cache.updateServerConfigIfExists('server1', mockConfig1)).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add('user1', 'server1', mockConfig1);
      await cache1.add('user2', 'server1', mockConfig1);

      await cache2.updateServerConfigIfExists('server1', mockConfig3);

      expect(await cache1.get('user1', 'server1')).toEqual(mockConfig3);
      expect(await cache1.get('user2', 'server1')).toEqual(mockConfig3);
    });
  });

  describe('addServerConfigIfCacheExists operation', () => {
    it('should add server to specified users with initialized caches', async () => {
      await cache.add('user1', 'other', mockConfig1);
      await cache.add('user2', 'other', mockConfig1);

      await cache.addServerConfigIfCacheExists(['user1', 'user2', 'user3'], 'server1', mockConfig2);

      expect(await cache.get('user1', 'server1')).toEqual(mockConfig2);
      expect(await cache.get('user2', 'server1')).toEqual(mockConfig2);
      expect(await cache.get('user3', 'server1')).toBeUndefined();
    });

    it('should not add to users without initialized caches', async () => {
      await cache.addServerConfigIfCacheExists(['user1', 'user2'], 'server1', mockConfig1);

      expect(await cache.get('user1', 'server1')).toBeUndefined();
      expect(await cache.get('user2', 'server1')).toBeUndefined();
    });

    it('should handle empty userIds array', async () => {
      await expect(
        cache.addServerConfigIfCacheExists([], 'server1', mockConfig1),
      ).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add('user1', 'other', mockConfig1);
      await cache1.add('user2', 'other', mockConfig1);

      await cache2.addServerConfigIfCacheExists(
        ['user1', 'user2', 'user3'],
        'server1',
        mockConfig2,
      );

      expect(await cache1.get('user1', 'server1')).toEqual(mockConfig2);
      expect(await cache1.get('user2', 'server1')).toEqual(mockConfig2);
      expect(await cache1.get('user3', 'server1')).toBeUndefined();
    });
  });

  describe('removeServerConfigIfCacheExists operation', () => {
    it('should remove server from specified users', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig1);
      await cache.add('user3', 'server1', mockConfig1);

      await cache.removeServerConfigIfCacheExists(['user1', 'user3'], 'server1');

      expect(await cache.get('user1', 'server1')).toBeUndefined();
      expect(await cache.get('user2', 'server1')).toEqual(mockConfig1);
      expect(await cache.get('user3', 'server1')).toBeUndefined();
    });

    it('should handle users who do not have the server', async () => {
      await cache.add('user1', 'server1', mockConfig1);

      await expect(
        cache.removeServerConfigIfCacheExists(['user1', 'user2'], 'server1'),
      ).resolves.not.toThrow();

      expect(await cache.get('user1', 'server1')).toBeUndefined();
    });

    it('should handle empty userIds array', async () => {
      await expect(cache.removeServerConfigIfCacheExists([], 'server1')).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add('user1', 'server1', mockConfig1);
      await cache1.add('user2', 'server1', mockConfig1);

      await cache2.removeServerConfigIfCacheExists(['user1', 'user2'], 'server1');

      expect(await cache1.get('user1', 'server1')).toBeUndefined();
      expect(await cache1.get('user2', 'server1')).toBeUndefined();
    });
  });

  describe('findUsersWithServer operation', () => {
    it('should return all users who have the server', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user2', 'server1', mockConfig1);
      await cache.add('user3', 'other', mockConfig2);

      const users = await cache.findUsersWithServer('server1');

      expect(users.sort()).toEqual(['user1', 'user2'].sort());
    });

    it('should return empty array if no users have the server', async () => {
      await cache.add('user1', 'other', mockConfig1);

      const users = await cache.findUsersWithServer('server1');

      expect(users).toEqual([]);
    });

    it('should return empty array with no user caches', async () => {
      const users = await cache.findUsersWithServer('server1');

      expect(users).toEqual([]);
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      await cache1.add('user1', 'server1', mockConfig1);
      await cache1.add('user2', 'server1', mockConfig1);
      await cache1.add('user3', 'other', mockConfig2);

      const users = await cache2.findUsersWithServer('server1');

      expect(users.sort()).toEqual(['user1', 'user2'].sort());
    });
  });

  describe('resetAll operation', () => {
    it('should clear all servers for all users in Redis', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server1', mockConfig1);
      await cache.add('user2', 'server3', mockConfig3);

      await cache.resetAll();

      expect(await cache.get('user1', 'server1')).toBeUndefined();
      expect(await cache.get('user1', 'server2')).toBeUndefined();
      expect(await cache.get('user2', 'server1')).toBeUndefined();
      expect(await cache.get('user2', 'server3')).toBeUndefined();
    });

    it('should handle case with no user caches', async () => {
      // Should not throw
      await expect(cache.resetAll()).resolves.not.toThrow();
    });

    it('should work across multiple cache instances (distributed scenario)', async () => {
      const cache1 = new PrivateServerConfigsCacheRedis();
      const cache2 = new PrivateServerConfigsCacheRedis();

      // Add servers using cache1
      await cache1.add('user1', 'server1', mockConfig1);
      await cache1.add('user2', 'server2', mockConfig2);

      // Reset using cache2
      await cache2.resetAll();

      // Verify using cache1
      expect(await cache1.get('user1', 'server1')).toBeUndefined();
      expect(await cache1.get('user2', 'server2')).toBeUndefined();
    });
  });
});
