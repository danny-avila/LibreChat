import { expect } from '@playwright/test';
import { ParsedServerConfig } from '~/mcp/types';
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

describe('PrivateServerConfigsCacheInMemory Tests', () => {
  let PrivateServerConfigsCacheInMemory: typeof import('../PrivateServerConfigs/PrivateServerConfigsCacheInMemory').PrivateServerConfigsCacheInMemory;
  let cache: InstanceType<
    typeof import('../PrivateServerConfigs/PrivateServerConfigsCacheInMemory').PrivateServerConfigsCacheInMemory
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
    // Import modules
    const cacheModule = await import('../PrivateServerConfigs/PrivateServerConfigsCacheInMemory');
    PrivateServerConfigsCacheInMemory = cacheModule.PrivateServerConfigsCacheInMemory;
  });

  afterAll(() => {
    Date.now = originalDateNow;
  });

  beforeEach(() => {
    // Create a fresh instance for each test
    cache = new PrivateServerConfigsCacheInMemory();
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
        'Failed to remove server "non-existent" in cache.',
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
    it('should clear all servers for a specific user', async () => {
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

    it('should handle case when no users have the server', async () => {
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server3', mockConfig3);

      await expect(cache.updateServerConfigIfExists('server1', mockConfig1)).resolves.not.toThrow();

      expect(await cache.get('user1', 'server2')).toEqual(mockConfig2);
      expect(await cache.get('user2', 'server3')).toEqual(mockConfig3);
    });

    it('should handle case with no loaded user caches', async () => {
      await expect(cache.updateServerConfigIfExists('server1', mockConfig1)).resolves.not.toThrow();
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

    it('should return empty array with no loaded user caches', async () => {
      const users = await cache.findUsersWithServer('server1');

      expect(users).toEqual([]);
    });
  });

  describe('resetAll operation', () => {
    it('should clear all servers for all users', async () => {
      await cache.add('user1', 'server1', mockConfig1);
      await cache.add('user1', 'server2', mockConfig2);
      await cache.add('user2', 'server1', mockConfig1);
      await cache.add('user2', 'server3', mockConfig3);

      await cache.resetAll();

      expect(await cache.has('user1')).toBe(false);
      expect(await cache.has('user2')).toBe(false);
    });

    it('should handle case with no loaded user caches', async () => {
      // Should not throw
      await expect(cache.resetAll()).resolves.not.toThrow();
    });
  });
});
