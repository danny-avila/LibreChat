import { MCPPrivateServerLoader } from '../MCPPrivateServerLoader';
import { mcpServersRegistry as registry } from '../MCPServersRegistry';
import { privateServersLoadStatusCache as loadStatusCache } from '../cache/PrivateServersLoadStatusCache';
import type * as t from '~/mcp/types';

const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

describe('MCPPrivateServerLoader Cache Integration Tests', () => {
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  const mockConfig1: t.ParsedServerConfig = {
    command: 'node',
    args: ['server1.js'],
    env: { TEST: 'value1' },
    lastUpdatedAt: FIXED_TIME,
  };

  const mockConfig2: t.ParsedServerConfig = {
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
    lastUpdatedAt: FIXED_TIME,
  };

  const mockConfig3: t.ParsedServerConfig = {
    url: 'http://localhost:3000',
    requiresOAuth: true,
    lastUpdatedAt: FIXED_TIME,
  };

  const mockUpdatedConfig: t.ParsedServerConfig = {
    command: 'node',
    args: ['server1-updated.js'],
    env: { TEST: 'updated', NEW_VAR: 'added' },
    lastUpdatedAt: FIXED_TIME + 1000,
  };

  beforeEach(async () => {
    // Reset registry state before each test
    await registry.privateServersCache.resetAll();

    // Clear load status for commonly used test users
    // This ensures each test starts with a clean state
    const testUsers = ['user1', 'user2', 'user3', 'user4', 'user5', 'user99'];
    for (const userId of testUsers) {
      try {
        await loadStatusCache.clearLoaded(userId);
      } catch {
        // Ignore errors (user may not have load status set)
      }
    }
  });

  afterEach(() => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    Date.now = originalDateNow;
    await registry.privateServersCache.resetAll();
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('loadPrivateServers() integration', () => {
    it('should load private servers from configsLoader and cache them', async () => {
      const mockConfigs: t.MCPServers = {
        server1: mockConfig1,
        server2: mockConfig2,
      };

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      // Verify servers were cached
      const server1 = await registry.privateServersCache.get('user1', 'server1');
      const server2 = await registry.privateServersCache.get('user1', 'server2');

      expect(server1).toEqual(mockConfig1);
      expect(server2).toEqual(mockConfig2);
      expect(configsLoader).toHaveBeenCalledWith('user1');
    });

    it('should not reload servers if already cached for user', async () => {
      const mockConfigs: t.MCPServers = {
        server1: mockConfig1,
      };

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);

      // First load
      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);
      expect(configsLoader).toHaveBeenCalledTimes(1);

      // Second load should skip
      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);
      expect(configsLoader).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should isolate servers between different users', async () => {
      const user1Configs: t.MCPServers = {
        server1: mockConfig1,
      };

      const user2Configs: t.MCPServers = {
        server2: mockConfig2,
      };

      const user1Loader = jest.fn().mockResolvedValue(user1Configs);
      const user2Loader = jest.fn().mockResolvedValue(user2Configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', user1Loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', user2Loader);

      // Verify isolation
      const user1Server1 = await registry.privateServersCache.get('user1', 'server1');
      const user1Server2 = await registry.privateServersCache.get('user1', 'server2');
      const user2Server1 = await registry.privateServersCache.get('user2', 'server1');
      const user2Server2 = await registry.privateServersCache.get('user2', 'server2');

      expect(user1Server1).toEqual(mockConfig1);
      expect(user1Server2).toBeUndefined();
      expect(user2Server1).toBeUndefined();
      expect(user2Server2).toEqual(mockConfig2);
    });

    it('should handle partial failures gracefully', async () => {
      const mockConfigs: t.MCPServers = {
        server1: mockConfig1,
        server2: mockConfig2,
      };

      // Mock to fail on second server
      let callCount = 0;
      jest
        .spyOn(registry.privateServersCache, 'add')
        .mockImplementation(async (userId, serverName, config) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Cache write failed for server2');
          }
          // Call the real implementation for other calls
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cache = (registry.privateServersCache as any).getOrCreatePrivateUserCache(userId);
          return cache.add(serverName, config);
        });

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);

      await expect(
        MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader),
      ).rejects.toThrow('Cache write failed for server2');

      // Verify first server was added before failure
      const server1 = await registry.privateServersCache.get('user1', 'server1');
      expect(server1).toEqual(mockConfig1);

      jest.restoreAllMocks();
    });
  });

  describe('updatePrivateServer() integration', () => {
    beforeEach(async () => {
      // Setup: Load same server for multiple users
      const configs: t.MCPServers = { server1: mockConfig1 };
      const loader = jest.fn().mockResolvedValue(configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user3', loader);
    });

    it('should update server config for all users who have it', async () => {
      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      // Verify all users got the update
      const user1Server = await registry.privateServersCache.get('user1', 'server1');
      const user2Server = await registry.privateServersCache.get('user2', 'server1');
      const user3Server = await registry.privateServersCache.get('user3', 'server1');

      expect(user1Server).toEqual(
        expect.objectContaining({
          command: 'node',
          args: ['server1-updated.js'],
          env: { TEST: 'updated', NEW_VAR: 'added' },
        }),
      );
      expect(user2Server).toEqual(user1Server);
      expect(user3Server).toEqual(user1Server);
    });

    it('should not affect other servers', async () => {
      // Add another server to user1
      await registry.privateServersCache.add('user1', 'server2', mockConfig2);

      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      // Verify server2 unchanged
      const server2 = await registry.privateServersCache.get('user1', 'server2');
      expect(server2).toEqual(mockConfig2);
    });

    it('should handle updating non-existent server gracefully', async () => {
      await expect(
        MCPPrivateServerLoader.updatePrivateServer('non-existent-server', mockUpdatedConfig),
      ).resolves.not.toThrow();
    });
  });

  describe('updatePrivateServerAccess() integration', () => {
    beforeEach(async () => {
      // Setup: Load server for user1, user2, user3
      const configs: t.MCPServers = { server1: mockConfig1 };
      const loader = jest.fn().mockResolvedValue(configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user3', loader);

      // Also initialize cache for user4 and user5 but without server1
      await registry.privateServersCache.add('user4', 'other-server', mockConfig2);
      await registry.privateServersCache.add('user5', 'other-server', mockConfig2);
    });

    it('should revoke access from all users when allowedUserIds is empty', async () => {
      await MCPPrivateServerLoader.updatePrivateServerAccess('server1', [], mockConfig1);

      // Verify all users lost access
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeUndefined();
      expect(await registry.privateServersCache.get('user2', 'server1')).toBeUndefined();
      expect(await registry.privateServersCache.get('user3', 'server1')).toBeUndefined();
    });

    it('should grant access to new users with initialized caches', async () => {
      const allowedUserIds = ['user1', 'user4', 'user5'];

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // user1 should still have it
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeDefined();

      // user4 and user5 should now have it (they had initialized caches)
      expect(await registry.privateServersCache.get('user4', 'server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user5', 'server1')).toBeDefined();

      // user2 and user3 should have lost access
      expect(await registry.privateServersCache.get('user2', 'server1')).toBeUndefined();
      expect(await registry.privateServersCache.get('user3', 'server1')).toBeUndefined();
    });

    it('should not grant access to users without initialized caches', async () => {
      const allowedUserIds = ['user1', 'user99']; // user99 has no cache

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // user1 should still have it
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeDefined();

      // user99 should not have it (cache not initialized)
      expect(await registry.privateServersCache.get('user99', 'server1')).toBeUndefined();
    });

    it('should handle complex permission changes', async () => {
      // Start: user1, user2, user3 have server1
      // End: user2, user4, user5 should have server1

      const allowedUserIds = ['user2', 'user4', 'user5'];

      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // Revoked: user1, user3
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeUndefined();
      expect(await registry.privateServersCache.get('user3', 'server1')).toBeUndefined();

      // Kept: user2
      expect(await registry.privateServersCache.get('user2', 'server1')).toBeDefined();

      // Granted: user4, user5
      expect(await registry.privateServersCache.get('user4', 'server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user5', 'server1')).toBeDefined();
    });

    it('should be idempotent when called with same permissions', async () => {
      const allowedUserIds = ['user1', 'user2'];

      // First call
      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      const user1ServerAfterFirst = await registry.privateServersCache.get('user1', 'server1');
      const user2ServerAfterFirst = await registry.privateServersCache.get('user2', 'server1');

      // Second call with same permissions
      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      const user1ServerAfterSecond = await registry.privateServersCache.get('user1', 'server1');
      const user2ServerAfterSecond = await registry.privateServersCache.get('user2', 'server1');

      // Should be unchanged
      expect(user1ServerAfterSecond).toEqual(user1ServerAfterFirst);
      expect(user2ServerAfterSecond).toEqual(user2ServerAfterFirst);
    });
  });

  describe('Combined operations integration', () => {
    it('should handle load, update metadata, and update access in sequence', async () => {
      // 1. Load servers for user1 and user2
      const configs: t.MCPServers = { server1: mockConfig1 };
      const loader = jest.fn().mockResolvedValue(configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', loader);

      // 2. Update metadata for all users
      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      let user1Server = await registry.privateServersCache.get('user1', 'server1');
      let user2Server = await registry.privateServersCache.get('user2', 'server1');

      expect((user1Server as typeof mockUpdatedConfig)?.args).toEqual(['server1-updated.js']);
      expect((user2Server as typeof mockUpdatedConfig)?.args).toEqual(['server1-updated.js']);

      // 3. Update access - revoke from user1
      await MCPPrivateServerLoader.updatePrivateServerAccess('server1', ['user2'], mockConfig3);

      user1Server = await registry.privateServersCache.get('user1', 'server1');
      user2Server = await registry.privateServersCache.get('user2', 'server1');

      expect(user1Server).toBeUndefined();
      expect(user2Server).toBeDefined();
    });

    it('should handle concurrent user logins correctly', async () => {
      const user1Configs: t.MCPServers = { server1: mockConfig1 };
      const user2Configs: t.MCPServers = { server1: mockConfig2 };
      const user3Configs: t.MCPServers = { server2: mockConfig3 };

      const user1Loader = jest.fn().mockResolvedValue(user1Configs);
      const user2Loader = jest.fn().mockResolvedValue(user2Configs);
      const user3Loader = jest.fn().mockResolvedValue(user3Configs);

      // Simulate concurrent loads
      await Promise.all([
        MCPPrivateServerLoader.loadPrivateServers('user1', user1Loader),
        MCPPrivateServerLoader.loadPrivateServers('user2', user2Loader),
        MCPPrivateServerLoader.loadPrivateServers('user3', user3Loader),
      ]);

      // Verify all users got their configs
      const user1Server1 = await registry.privateServersCache.get('user1', 'server1');
      const user2Server1 = await registry.privateServersCache.get('user2', 'server1');
      const user3Server2 = await registry.privateServersCache.get('user3', 'server2');

      expect(user1Server1).toEqual(mockConfig1);
      expect(user2Server1).toEqual(mockConfig2);
      expect(user3Server2).toEqual(mockConfig3);
    });
  });
});
