import type * as t from '~/mcp/types';
import type { MCPServerDB } from 'librechat-data-provider';

describe('MCPPrivateServerLoader Cache Integration Tests', () => {
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let registry: typeof import('../MCPServersRegistry').mcpServersRegistry;
  let MCPPrivateServerLoader: typeof import('../MCPPrivateServerLoader').MCPPrivateServerLoader;
  let loadStatusCache: typeof import('../cache/PrivateServersLoadStatusCache').privateServersLoadStatusCache;
  const mockConfig1: t.ParsedServerConfig = {
    command: 'node',
    args: ['server1.js'],
    env: { TEST: 'value1' },
  };

  const mockConfig2: t.ParsedServerConfig = {
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
  };

  const mockConfig3: t.ParsedServerConfig = {
    url: 'http://localhost:3000',
    requiresOAuth: true,
  };

  const mockUpdatedConfig: t.ParsedServerConfig = {
    command: 'node',
    args: ['server1-updated.js'],
    env: { TEST: 'updated', NEW_VAR: 'added' },
  };
  beforeAll(async () => {
    jest.resetModules();
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.USE_REDIS_CLUSTER = process.env.USE_REDIS_CLUSTER ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ?? `MCPPrivateServerLoader-integration-test`;

    // Import modules after setting env vars
    const registryModule = await import('../MCPServersRegistry');
    const redisClients = await import('~/cache/redisClients');
    const MCPPrivateServerLoaderModule = await import('../MCPPrivateServerLoader');
    const loadStatusCacheLoaderModule = await import('../cache/PrivateServersLoadStatusCache');

    loadStatusCache = loadStatusCacheLoaderModule.privateServersLoadStatusCache;
    MCPPrivateServerLoader = MCPPrivateServerLoaderModule.MCPPrivateServerLoader;
    registry = registryModule.mcpServersRegistry;
    keyvRedisClient = redisClients.keyvRedisClient;

    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    await redisClients.keyvRedisClientReady;
  });

  beforeEach(async () => {
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

  afterEach(async () => {
    // Restore all mocks after each test
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      const pattern = '*MCPPrivateServerLoader-integration-test*';
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
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('loadPrivateServers() integration', () => {
    it('should load private servers from configsLoader and cache them', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);

      // Verify servers were cached
      const server1 = await registry.privateServersCache.get('user1', 'server1');
      const server2 = await registry.privateServersCache.get('user1', 'server2');

      expect(server1).toMatchObject(mockConfig1);
      expect(server2).toMatchObject(mockConfig2);
      expect(configsLoader).toHaveBeenCalledWith('user1');
    });

    it('should not reload servers if already cached for user', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];

      const configsLoader = jest.fn().mockResolvedValue(mockConfigs);

      // First load
      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);
      expect(configsLoader).toHaveBeenCalledTimes(1);

      // Second load should skip
      await MCPPrivateServerLoader.loadPrivateServers('user1', configsLoader);
      expect(configsLoader).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should isolate servers between different users', async () => {
      const user1Configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];

      const user2Configs: MCPServerDB[] = [
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const user1Loader = jest.fn().mockResolvedValue(user1Configs);
      const user2Loader = jest.fn().mockResolvedValue(user2Configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', user1Loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', user2Loader);

      // Verify isolation
      const user1Server1 = await registry.privateServersCache.get('user1', 'server1');
      const user1Server2 = await registry.privateServersCache.get('user1', 'server2');
      const user2Server1 = await registry.privateServersCache.get('user2', 'server1');
      const user2Server2 = await registry.privateServersCache.get('user2', 'server2');

      expect(user1Server1).toMatchObject(mockConfig1);
      expect(user1Server2).toBeUndefined();
      expect(user2Server1).toBeUndefined();
      expect(user2Server2).toMatchObject(mockConfig2);
    });

    it('should handle partial failures gracefully', async () => {
      const mockConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

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
      expect(server1).toMatchObject(mockConfig1);

      jest.restoreAllMocks();
    });

    it('should reset cache before loading, removing old servers no longer in configs', async () => {
      // Initial load with server1 and server2
      const initialConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-2',
          mcp_id: 'server2',
          config: mockConfig2,
        },
      ];

      const initialLoader = jest.fn().mockResolvedValue(initialConfigs);
      await MCPPrivateServerLoader.loadPrivateServers('user1', initialLoader);

      // Verify both servers are cached
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user1', 'server2')).toBeDefined();

      // Clear load status to force reload
      await loadStatusCache.clearLoaded('user1');

      // Second load with only server1 and a new server3
      const updatedConfigs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
        {
          _id: 'mock-id-3',
          mcp_id: 'server3',
          config: mockConfig3,
        },
      ];

      const updatedLoader = jest.fn().mockResolvedValue(updatedConfigs);
      await MCPPrivateServerLoader.loadPrivateServers('user1', updatedLoader);

      // Verify server2 is removed (cache was reset)
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user1', 'server2')).toBeUndefined();
      expect(await registry.privateServersCache.get('user1', 'server3')).toBeDefined();
    });
  });

  describe('updatePrivateServer() integration', () => {
    beforeEach(async () => {
      // Setup: Load same server for multiple users
      const configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];
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

      expect(user1Server).toMatchObject({
        command: 'node',
        args: ['server1-updated.js'],
        env: { TEST: 'updated', NEW_VAR: 'added' },
      });
      expect(user2Server).toMatchObject(user1Server!);
      expect(user3Server).toMatchObject(user1Server!);
    });

    it('should not affect other servers', async () => {
      // Add another server to user1
      await registry.privateServersCache.add('user1', 'server2', mockConfig2);

      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      // Verify server2 unchanged
      const server2 = await registry.privateServersCache.get('user1', 'server2');
      expect(server2).toMatchObject(mockConfig2);
    });

    it('should handle updating non-existent server gracefully', async () => {
      await expect(
        MCPPrivateServerLoader.updatePrivateServer('non-existent-server', mockUpdatedConfig),
      ).resolves.not.toThrow();
    });

    it('should handle promoted server by updating shared registry instead of private caches', async () => {
      // First add server to shared registry (simulating promotion)
      await registry.addSharedServer('promoted-server', mockConfig1);

      // Verify it's in shared registry
      const sharedConfig = await registry.getServerConfig('promoted-server');
      expect(sharedConfig).toBeDefined();

      // Now update it - should go through the promoted server path
      await MCPPrivateServerLoader.updatePrivateServer('promoted-server', mockUpdatedConfig);

      // Verify the shared registry was updated with new config
      const updatedSharedConfig = await registry.getServerConfig('promoted-server');
      expect(updatedSharedConfig).toMatchObject(
        expect.objectContaining({
          command: 'node',
          args: ['server1-updated.js'],
          env: { TEST: 'updated', NEW_VAR: 'added' },
        }),
      );

      // Verify users' private caches were NOT updated (no users had it privately)
      expect(await registry.privateServersCache.get('user1', 'promoted-server')).toBeUndefined();
      expect(await registry.privateServersCache.get('user2', 'promoted-server')).toBeUndefined();
      expect(await registry.privateServersCache.get('user3', 'promoted-server')).toBeUndefined();
    });

    it('should handle promoted server update when users had it privately before promotion', async () => {
      // Setup: Users have server1 in private caches
      const configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];
      const loader = jest.fn().mockResolvedValue(configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', loader);

      // Verify they have it privately
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user2', 'server1')).toBeDefined();

      await MCPPrivateServerLoader.promoteToSharedServer('server1', mockConfig1);
      // Verify it's now in shared registry and removed from private caches
      expect(await registry.getServerConfig('server1')).toBeDefined();
      expect(await registry.privateServersCache.get('user1', 'server1')).toBeUndefined();
      expect(await registry.privateServersCache.get('user2', 'server1')).toBeUndefined();

      // Now update it - should update shared registry
      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      // Verify shared registry was updated
      const updatedSharedConfig = await registry.getServerConfig('server1');
      expect(updatedSharedConfig).toMatchObject(
        expect.objectContaining({
          command: 'node',
          args: ['server1-updated.js'],
        }),
      );
    });
  });

  describe('updatePrivateServerAccess() integration', () => {
    beforeEach(async () => {
      // Setup: Load server for user1, user2, user3
      const configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedAt: _1, ...user1ServerAfterFirst } =
        (await registry.privateServersCache.get('user1', 'server1')) || {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedAt: _2, ...user2ServerAfterFirst } =
        (await registry.privateServersCache.get('user2', 'server1')) || {};
      // Second call with same permissions
      await MCPPrivateServerLoader.updatePrivateServerAccess(
        'server1',
        allowedUserIds,
        mockConfig1,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedAt: _3, ...user1ServerAfterSecond } =
        (await registry.privateServersCache.get('user1', 'server1')) || {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedAt: _4, ...user2ServerAfterSecond } =
        (await registry.privateServersCache.get('user2', 'server1')) || {};

      // Should be unchanged
      expect(user1ServerAfterSecond).toMatchObject(user1ServerAfterFirst!);
      expect(user2ServerAfterSecond).toMatchObject(user2ServerAfterFirst!);
    });
  });

  describe('Combined operations integration', () => {
    it('should handle load, update metadata, and update access in sequence', async () => {
      // 1. Load servers for user1 and user2
      const configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];
      const loader = jest.fn().mockResolvedValue(configs);

      await MCPPrivateServerLoader.loadPrivateServers('user1', loader);
      await MCPPrivateServerLoader.loadPrivateServers('user2', loader);

      // Verify initial state
      let user1Server = await registry.privateServersCache.get('user1', 'server1');
      let user2Server = await registry.privateServersCache.get('user2', 'server1');
      expect((user1Server as typeof mockConfig1)?.args).toEqual(['server1.js']);
      expect((user2Server as typeof mockConfig1)?.args).toEqual(['server1.js']);

      // 2. Update metadata for all users
      await MCPPrivateServerLoader.updatePrivateServer('server1', mockUpdatedConfig);

      user1Server = await registry.privateServersCache.get('user1', 'server1');
      user2Server = await registry.privateServersCache.get('user2', 'server1');

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
      const user1Configs: MCPServerDB[] = [
        {
          _id: 'mock-id-1',
          mcp_id: 'server1',
          config: mockConfig1,
        },
      ];
      const user2Configs: MCPServerDB[] = [
        {
          _id: 'mock-id-2',
          mcp_id: 'server1',
          config: mockConfig2,
        },
      ];
      const user3Configs: MCPServerDB[] = [
        {
          _id: 'mock-id-3',
          mcp_id: 'server2',
          config: mockConfig3,
        },
      ];

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

      expect(user1Server1).toMatchObject(mockConfig1);
      expect(user2Server1).toMatchObject(mockConfig2);
      expect(user3Server2).toMatchObject(mockConfig3);
    });
  });
});
