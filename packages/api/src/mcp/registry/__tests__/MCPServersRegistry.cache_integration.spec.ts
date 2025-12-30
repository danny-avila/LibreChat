import { expect } from '@playwright/test';
import type * as t from '~/mcp/types';
import type { MCPServersRegistry as MCPServersRegistryType } from '../MCPServersRegistry';

// Mock ServerConfigsDB to avoid needing MongoDB for cache integration tests
jest.mock('../db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue({
      serverName: 'mock-server',
      config: {} as t.ParsedServerConfig,
    }),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

/**
 * Integration tests for MCPServersRegistry using Redis-backed cache.
 * For unit tests using in-memory cache, see MCPServersRegistry.test.ts
 *
 * NOTE: After refactoring, these tests have been simplified.
 * Private server functionality has been moved to DB (not yet implemented).
 * The registry now uses a unified cache repository for YAML configs only.
 */
describe('MCPServersRegistry Redis Integration Tests', () => {
  let MCPServersRegistry: typeof import('../MCPServersRegistry').MCPServersRegistry;
  let registry: MCPServersRegistryType;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let LeaderElection: typeof import('~/cluster/LeaderElection').LeaderElection;
  let leaderInstance: InstanceType<typeof import('~/cluster/LeaderElection').LeaderElection>;
  let MCPServerInspector: typeof import('../MCPServerInspector').MCPServerInspector;

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
  };

  const testRawConfig: t.MCPOptions = {
    type: 'stdio',
    command: 'node',
    args: ['tools.js'],
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
    const inspectorModule = await import('../MCPServerInspector');
    const mongoose = await import('mongoose');

    MCPServersRegistry = registryModule.MCPServersRegistry;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;
    MCPServerInspector = inspectorModule.MCPServerInspector;

    // Reset singleton and create new instance with mongoose
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;
    MCPServersRegistry.createInstance(mongoose.default);
    registry = MCPServersRegistry.getInstance();

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for connection and topology discovery to complete
    await redisClients.keyvRedisClientReady;

    // Become leader so we can perform write operations
    leaderInstance = new LeaderElection();
    const isLeader = await leaderInstance.isLeader();
    expect(isLeader).toBe(true);
  });

  beforeEach(() => {
    // Mock MCPServerInspector.inspect to avoid actual server connections
    // Use mockImplementation to return the config that's actually passed in
    jest
      .spyOn(MCPServerInspector, 'inspect')
      .mockImplementation(async (_serverName: string, rawConfig: t.MCPOptions) => {
        return {
          ...testParsedConfig,
          ...rawConfig,
          requiresOAuth: false,
        } as unknown as t.ParsedServerConfig;
      });
  });

  afterEach(async () => {
    // Clean up: reset registry to clear all test data
    await registry.reset();

    // Also clean up any remaining test keys from Redis
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      const pattern = '*MCPServersRegistry-IntegrationTest*';
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
    // Resign as leader
    if (leaderInstance) await leaderInstance.resign();

    // Close Redis connection
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  // Tests for the old privateServersCache API have been removed
  // The refactoring simplified the architecture to use unified repositories (cache + DB)
  // Private server functionality is now handled by the DB repository (not yet implemented)

  describe('cache repository functionality', () => {
    it('should add and retrieve server config from cache', async () => {
      const serverName = 'test_server';

      // Add server using public API
      await registry.addServer(serverName, testRawConfig, 'CACHE');

      // Verify server was added
      const retrievedConfig = await registry.getServerConfig(serverName);
      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig?.type).toBe('stdio');
      if (retrievedConfig && 'command' in retrievedConfig) {
        expect(retrievedConfig.command).toBe('node');
        expect(retrievedConfig.args).toEqual(['tools.js']);
      }
    });

    it('should update existing server config in cache', async () => {
      const serverName = 'test_server';
      const updatedConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'python',
        args: ['updated.py'],
      };

      // Add server
      await registry.addServer(serverName, testRawConfig, 'CACHE');

      // Update server
      await registry.updateServer(serverName, updatedConfig, 'CACHE');

      // Verify server was updated
      const retrievedConfig = await registry.getServerConfig(serverName);
      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig?.type).toBe('stdio');
      if (retrievedConfig && 'command' in retrievedConfig) {
        expect(retrievedConfig.command).toBe('python');
        expect(retrievedConfig.args).toEqual(['updated.py']);
      }
    });

    it('should remove server config from cache', async () => {
      const serverName = 'test_server';

      // Add server
      await registry.addServer(serverName, testRawConfig, 'CACHE');

      // Verify server exists in underlying cache repository (not via getServerConfig to avoid populating read-through cache)
      expect(await registry['cacheConfigsRepo'].get(serverName)).toBeDefined();

      // Remove server
      await registry.removeServer(serverName, 'CACHE');

      // Verify server was removed from underlying cache repository
      const configAfter = await registry['cacheConfigsRepo'].get(serverName);
      expect(configAfter).toBeUndefined();
    });
  });

  describe('getAllServerConfigs', () => {
    it('should return servers from cache repository', async () => {
      // Add servers using public API
      await registry.addServer('app_server', testRawConfig, 'CACHE');
      await registry.addServer('user_server', testRawConfig, 'CACHE');

      // Get all configs
      const configs = await registry.getAllServerConfigs();
      expect(Object.keys(configs)).toHaveLength(2);
      expect(configs).toHaveProperty('app_server');
      expect(configs).toHaveProperty('user_server');
    });
  });

  describe('reset', () => {
    it('should clear all servers from cache repository', async () => {
      // Add servers
      await registry.addServer('app_server', testRawConfig, 'CACHE');
      await registry.addServer('user_server', testRawConfig, 'CACHE');

      // Verify servers exist
      const configsBefore = await registry.getAllServerConfigs();
      expect(Object.keys(configsBefore)).toHaveLength(2);

      // Reset everything
      await registry.reset();

      // Verify all servers are cleared
      const configsAfter = await registry.getAllServerConfigs();
      expect(Object.keys(configsAfter)).toHaveLength(0);
    });
  });
});
