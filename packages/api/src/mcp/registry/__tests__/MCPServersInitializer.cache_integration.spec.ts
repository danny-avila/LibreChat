import type * as t from '~/mcp/types';
import type { MCPConnection } from '~/mcp/connection';
import type { MCPServersRegistry as MCPServersRegistryType } from '../MCPServersRegistry';

// Mock isLeader to always return true to avoid lock contention during parallel operations
jest.mock('~/cluster', () => ({
  ...jest.requireActual('~/cluster'),
  isLeader: jest.fn().mockResolvedValue(true),
}));

// Mock ServerConfigsDB to avoid needing MongoDB for cache integration tests
jest.mock('../db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue({ config: {}, isNew: true }),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('MCPServersInitializer Redis Integration Tests', () => {
  let MCPServersInitializer: typeof import('../MCPServersInitializer').MCPServersInitializer;
  let MCPServersRegistry: typeof import('../MCPServersRegistry').MCPServersRegistry;
  let registry: MCPServersRegistryType;
  let registryStatusCache: typeof import('../cache/RegistryStatusCache').registryStatusCache;
  let MCPServerInspector: typeof import('../MCPServerInspector').MCPServerInspector;
  let MCPConnectionFactory: typeof import('~/mcp/MCPConnectionFactory').MCPConnectionFactory;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let LeaderElection: typeof import('~/cluster/LeaderElection').LeaderElection;
  let leaderInstance: InstanceType<typeof import('~/cluster/LeaderElection').LeaderElection>;

  const testConfigs: t.MCPServers = {
    disabled_server: {
      type: 'stdio',
      command: 'node',
      args: ['disabled.js'],
      startup: false,
    },
    oauth_server: {
      type: 'streamable-http',
      url: 'https://api.example.com/mcp-oauth',
    },
    file_tools_server: {
      type: 'stdio',
      command: 'node',
      args: ['tools.js'],
    },
    search_tools_server: {
      type: 'stdio',
      command: 'node',
      args: ['instructions.js'],
    },
  };

  const testParsedConfigs: Record<string, t.ParsedServerConfig> = {
    disabled_server: {
      type: 'stdio',
      command: 'node',
      args: ['disabled.js'],
      startup: false,
      requiresOAuth: false,
    },
    oauth_server: {
      type: 'streamable-http',
      url: 'https://api.example.com/mcp-oauth',
      requiresOAuth: true,
    },
    file_tools_server: {
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
    },
    search_tools_server: {
      type: 'stdio',
      command: 'node',
      args: ['instructions.js'],
      requiresOAuth: false,
      serverInstructions: 'Instructions for search_tools_server',
      capabilities: '{"tools":{"listChanged":true}}',
      tools: 'search',
      toolFunctions: {
        search_mcp_search_tools_server: {
          type: 'function',
          function: {
            name: 'search_mcp_search_tools_server',
            description: 'Search tool',
            parameters: { type: 'object' },
          },
        },
      },
    },
    remote_no_oauth_server: {
      type: 'streamable-http',
      url: 'https://api.example.com/mcp-no-auth',
      requiresOAuth: false,
    },
  };

  // Helper to determine requiresOAuth based on URL pattern
  // URLs ending with '-oauth' require OAuth, others don't
  const determineRequiresOAuth = (config: t.MCPOptions): boolean => {
    if ('url' in config && config.url) {
      return config.url.endsWith('-oauth');
    }
    return false;
  };

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    // Use a unique prefix for each test run to avoid conflicts with parallel test executions
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ??
      `MCPServersInitializer-IntegrationTest-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Import modules after setting env vars
    const initializerModule = await import('../MCPServersInitializer');
    const registryModule = await import('../MCPServersRegistry');
    const statusCacheModule = await import('../cache/RegistryStatusCache');
    const inspectorModule = await import('../MCPServerInspector');
    const connectionFactoryModule = await import('~/mcp/MCPConnectionFactory');
    const redisClients = await import('~/cache/redisClients');
    const leaderElectionModule = await import('~/cluster/LeaderElection');
    const mongoose = await import('mongoose');

    MCPServersInitializer = initializerModule.MCPServersInitializer;
    MCPServersRegistry = registryModule.MCPServersRegistry;
    registryStatusCache = statusCacheModule.registryStatusCache;
    MCPServerInspector = inspectorModule.MCPServerInspector;
    MCPConnectionFactory = connectionFactoryModule.MCPConnectionFactory;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;

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
    // eslint-disable-next-line jest/no-standalone-expect
    expect(isLeader).toBe(true);
  });

  beforeEach(async () => {
    jest.resetModules();

    // Ensure we're still the leader
    const isLeader = await leaderInstance.isLeader();
    if (!isLeader) {
      throw new Error('Lost leader status before test');
    }

    // Reset caches first to ensure clean state
    await registryStatusCache.reset();
    await registry.reset();

    // Mock MCPServerInspector.inspect to return parsed config
    // This mock inspects the actual rawConfig to determine requiresOAuth dynamically
    jest
      .spyOn(MCPServerInspector, 'inspect')
      .mockImplementation(async (serverName: string, rawConfig: t.MCPOptions) => {
        const baseConfig = testParsedConfigs[serverName] || {};
        return {
          ...baseConfig,
          ...rawConfig,
          // Override requiresOAuth based on the actual config being inspected
          requiresOAuth: determineRequiresOAuth(rawConfig),
          _processedByInspector: true,
        } as unknown as t.ParsedServerConfig;
      });

    // Mock MCPConnection
    const mockConnection = {
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MCPConnection>;

    // Mock MCPConnectionFactory
    jest.spyOn(MCPConnectionFactory, 'create').mockResolvedValue(mockConnection);
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      const pattern = '*MCPServersInitializer-IntegrationTest*';
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

  describe('initialize()', () => {
    it('should reset registry and status cache before initialization', async () => {
      // Pre-populate registry with some old servers using public API
      await registry.addServer('old_app_server', testConfigs.file_tools_server, 'CACHE');
      await registry.addServer('old_user_server', testConfigs.oauth_server, 'CACHE');

      // Initialize with new configs (this should reset first)
      await MCPServersInitializer.initialize(testConfigs);

      // Verify old servers are gone
      expect(await registry.getServerConfig('old_app_server')).toBeUndefined();
      expect(await registry.getServerConfig('old_user_server')).toBeUndefined();

      // Verify new servers are present
      expect(await registry.getServerConfig('file_tools_server')).toBeDefined();
      expect(await registry.getServerConfig('oauth_server')).toBeDefined();
      expect(await registryStatusCache.isInitialized()).toBe(true);
    });

    it('should skip initialization if already initialized', async () => {
      // First initialization
      await MCPServersInitializer.initialize(testConfigs);

      // Clear mock calls
      jest.clearAllMocks();

      // Second initialization should skip due to static flag
      await MCPServersInitializer.initialize(testConfigs);

      // Verify inspect was not called again
      expect(MCPServerInspector.inspect).not.toHaveBeenCalled();
    });

    it('should initialize all servers to cache repository', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      // Verify all server types (disabled, OAuth, and regular) were added to cache
      expect(await registry.getServerConfig('disabled_server')).toBeDefined();
      expect(await registry.getServerConfig('oauth_server')).toBeDefined();
      expect(await registry.getServerConfig('file_tools_server')).toBeDefined();
      expect(await registry.getServerConfig('search_tools_server')).toBeDefined();
    });

    it('should handle inspection failures gracefully', async () => {
      // Mock inspection failure for one server
      jest.spyOn(MCPServerInspector, 'inspect').mockImplementation(async (serverName: string) => {
        if (serverName === 'file_tools_server') {
          throw new Error('Inspection failed');
        }
        return {
          ...testParsedConfigs[serverName],
          _processedByInspector: true,
        } as unknown as t.ParsedServerConfig;
      });

      await MCPServersInitializer.initialize(testConfigs);

      // Verify other servers were still processed
      const disabledServer = await registry.getServerConfig('disabled_server');
      expect(disabledServer).toBeDefined();

      const oauthServer = await registry.getServerConfig('oauth_server');
      expect(oauthServer).toBeDefined();

      const searchToolsServer = await registry.getServerConfig('search_tools_server');
      expect(searchToolsServer).toBeDefined();

      // Verify file_tools_server was not added (due to inspection failure)
      const fileToolsServer = await registry.getServerConfig('file_tools_server');
      expect(fileToolsServer).toBeUndefined();
    });

    it('should set initialized status after completion', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      expect(await registryStatusCache.isInitialized()).toBe(true);
    });
  });
});
