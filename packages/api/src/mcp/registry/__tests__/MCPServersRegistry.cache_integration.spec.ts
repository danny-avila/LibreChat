import { expect } from '@playwright/test';
import type * as t from '~/mcp/types';

// Mock Date.now BEFORE any other imports to ensure it's applied everywhere
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

/**
 * Integration tests for MCPServersRegistry using Redis-backed cache.
 * For unit tests using in-memory cache, see MCPServersRegistry.test.ts
 */
describe('MCPServersRegistry Redis Integration Tests', () => {
  let registry: typeof import('../MCPServersRegistry').mcpServersRegistry;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let LeaderElection: typeof import('~/cluster/LeaderElection').LeaderElection;
  let leaderInstance: InstanceType<typeof import('~/cluster/LeaderElection').LeaderElection>;

  const testParsedConfig: t.ParsedServerConfig = {
    type: 'stdio',
    command: 'node',
    args: ['tools.js'],
    requiresOAuth: false,
    serverInstructions: 'Instructions for file_tools_server',
    tools: 'file_read, file_write',
    capabilities: '{"tools":{"listChanged":true}}',
    toolFunctions: {
      file_read_mcp_file_tools_server: {
        type: 'function',
        function: {
          name: 'file_read_mcp_file_tools_server',
          description: 'Read a file',
          parameters: { type: 'object' },
        },
      },
    },
    lastUpdatedAt: FIXED_TIME,
  };

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ??
      `MCPServersRegistry-IntegrationTest-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Import modules after setting env vars
    const registryModule = await import('../MCPServersRegistry');
    const redisClients = await import('~/cache/redisClients');
    const leaderElectionModule = await import('~/cluster/LeaderElection');

    registry = registryModule.mcpServersRegistry;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for connection and topology discovery to complete
    await redisClients.keyvRedisClientReady;

    // Become leader so we can perform write operations
    leaderInstance = new LeaderElection();
    const isLeader = await leaderInstance.isLeader();
    expect(isLeader).toBe(true);
  });

  afterEach(async () => {
    // Clean up: reset registry to clear all test data
    await registry.reset();

    // Also clean up any remaining test keys from Redis
    if (keyvRedisClient) {
      const pattern = '*MCPServersRegistry-IntegrationTest*';
      if ('scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          await keyvRedisClient.del(key);
        }
      }
    }
  });

  afterAll(async () => {
    // Restore original Date.now
    Date.now = originalDateNow;

    // Resign as leader
    if (leaderInstance) await leaderInstance.resign();

    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('private user servers', () => {
    it('should add and remove private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      // Add private user server
      await registry.privateServersCache.add(userId, serverName, testParsedConfig);

      // Verify server was added
      const retrievedConfig = await registry.getServerConfig(serverName, userId);
      expect(retrievedConfig).toEqual(testParsedConfig);

      // Remove private user server
      await registry.privateServersCache.remove(userId, serverName);

      // Verify server was removed
      const configAfterRemoval = await registry.getServerConfig(serverName, userId);
      expect(configAfterRemoval).toBeUndefined();
    });

    it('should throw error when adding duplicate private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      await registry.privateServersCache.add(userId, serverName, testParsedConfig);
      await expect(
        registry.privateServersCache.add(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" already exists in cache. Use update() to modify existing configs.',
      );
    });

    it('should update an existing private user server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';
      const updatedConfig: t.ParsedServerConfig = {
        type: 'stdio',
        command: 'python',
        args: ['updated.py'],
        requiresOAuth: true,
        lastUpdatedAt: FIXED_TIME,
      };

      // Add private user server
      await registry.privateServersCache.add(userId, serverName, testParsedConfig);

      // Update the server config
      await registry.privateServersCache.update(userId, serverName, updatedConfig);

      // Verify server was updated
      const retrievedConfig = await registry.getServerConfig(serverName, userId);
      expect(retrievedConfig).toEqual(updatedConfig);
    });

    it('should throw error when updating non-existent server', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      // Add a user cache first
      await registry.privateServersCache.add(userId, 'other_server', testParsedConfig);

      await expect(
        registry.privateServersCache.update(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should throw error when updating non-existent server (lazy-loads cache)', async () => {
      const userId = 'nonexistent_user';
      const serverName = 'private_server';

      // With lazy-loading, cache is created but server doesn't exist in it
      await expect(
        registry.privateServersCache.update(userId, serverName, testParsedConfig),
      ).rejects.toThrow(
        'Server "private_server" does not exist in cache. Use add() to create new configs.',
      );
    });
  });

  describe('getPrivateServerConfig', () => {
    it('should retrieve private server config for a specific user', async () => {
      const userId = 'user123';
      const serverName = 'private_server';

      await registry.privateServersCache.add(userId, serverName, testParsedConfig);

      const retrievedConfig = await registry.privateServersCache.get(userId, serverName);
      expect(retrievedConfig).toEqual(testParsedConfig);
    });

    it('should return undefined if server does not exist in user private cache', async () => {
      const userId = 'user123';

      // Create a cache for this user with a different server
      await registry.privateServersCache.add(userId, 'other_server', testParsedConfig);

      // Try to get a server that doesn't exist
      const retrievedConfig = await registry.privateServersCache.get(userId, 'nonexistent_server');
      expect(retrievedConfig).toBeUndefined();
    });

    it('should return undefined when user has no private servers (lazy-loads cache)', async () => {
      const userId = 'user_with_no_cache';

      // With lazy-loading, cache is created but is empty
      const config = await registry.privateServersCache.get(userId, 'server_name');
      expect(config).toBeUndefined();
    });

    it('should isolate private servers between different users', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      const serverName = 'shared_name_server';

      const config1: t.ParsedServerConfig = {
        ...testParsedConfig,
        args: ['user1.js'],
      };
      const config2: t.ParsedServerConfig = {
        ...testParsedConfig,
        args: ['user2.js'],
      };

      await registry.privateServersCache.add(user1, serverName, config1);
      await registry.privateServersCache.add(user2, serverName, config2);

      const user1Config = await registry.privateServersCache.get(user1, serverName);
      const user2Config = await registry.privateServersCache.get(user2, serverName);

      // Verify each user gets their own config
      expect(user1Config).toBeDefined();
      expect(user2Config).toBeDefined();
      if (user1Config && 'args' in user1Config) {
        expect(user1Config.args).toEqual(['user1.js']);
      }
      if (user2Config && 'args' in user2Config) {
        expect(user2Config.args).toEqual(['user2.js']);
      }
    });

    it('should not retrieve shared servers through privateServersCache.get', async () => {
      const userId = 'user123';

      // Add servers to shared caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);

      // Create a private cache for the user (but don't add these servers to it)
      await registry.privateServersCache.add(userId, 'private_server', testParsedConfig);

      // Try to get shared servers using privateServersCache.get - should return undefined
      // because privateServersCache.get only looks at private cache, not shared caches
      const appServerConfig = await registry.privateServersCache.get(userId, 'app_server');
      const userServerConfig = await registry.privateServersCache.get(userId, 'user_server');

      expect(appServerConfig).toBeUndefined();
      expect(userServerConfig).toBeUndefined();
    });
  });

  describe('getAllServerConfigs', () => {
    it('should return correct servers based on userId', async () => {
      // Add servers to all three caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);
      await registry.privateServersCache.add('abc', 'abc_private_server', testParsedConfig);
      await registry.privateServersCache.add('xyz', 'xyz_private_server', testParsedConfig);

      // Without userId: should return only shared app + shared user servers
      const configsNoUser = await registry.getAllServerConfigs();
      expect(Object.keys(configsNoUser)).toHaveLength(2);
      expect(configsNoUser).toHaveProperty('app_server');
      expect(configsNoUser).toHaveProperty('user_server');

      // With userId 'abc': should return shared app + shared user + abc's private servers
      const configsAbc = await registry.getAllServerConfigs('abc');
      expect(Object.keys(configsAbc)).toHaveLength(3);
      expect(configsAbc).toHaveProperty('app_server');
      expect(configsAbc).toHaveProperty('user_server');
      expect(configsAbc).toHaveProperty('abc_private_server');

      // With userId 'xyz': should return shared app + shared user + xyz's private servers
      const configsXyz = await registry.getAllServerConfigs('xyz');
      expect(Object.keys(configsXyz)).toHaveLength(3);
      expect(configsXyz).toHaveProperty('app_server');
      expect(configsXyz).toHaveProperty('user_server');
      expect(configsXyz).toHaveProperty('xyz_private_server');
    });
  });

  describe('reset', () => {
    it('should clear all servers from all caches (shared app, shared user, and private user)', async () => {
      const userId = 'user123';

      // Add servers to all three caches
      await registry.sharedAppServers.add('app_server', testParsedConfig);
      await registry.sharedUserServers.add('user_server', testParsedConfig);
      await registry.privateServersCache.add(userId, 'private_server', testParsedConfig);

      // Verify all servers are accessible before reset
      const appConfigBefore = await registry.getServerConfig('app_server');
      const userConfigBefore = await registry.getServerConfig('user_server', userId);
      const privateConfigBefore = await registry.getServerConfig('private_server', userId);
      const allConfigsBefore = await registry.getAllServerConfigs(userId);

      expect(appConfigBefore).toEqual(testParsedConfig);
      expect(userConfigBefore).toEqual(testParsedConfig);
      expect(privateConfigBefore).toEqual(testParsedConfig);
      expect(Object.keys(allConfigsBefore)).toHaveLength(3);

      // Reset everything
      await registry.reset();

      // Verify all servers are cleared after reset
      const appConfigAfter = await registry.getServerConfig('app_server');
      const userConfigAfter = await registry.getServerConfig('user_server');
      const privateConfigAfter = await registry.getServerConfig('private_server', userId);
      const allConfigsAfter = await registry.getAllServerConfigs(userId);

      expect(appConfigAfter).toBeUndefined();
      expect(userConfigAfter).toBeUndefined();
      expect(privateConfigAfter).toBeUndefined();
      expect(Object.keys(allConfigsAfter)).toHaveLength(0);
    });
  });
});
