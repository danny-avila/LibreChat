import { expect } from '@playwright/test';
import type * as t from '~/mcp/types';
import type { MCPConnection } from '~/mcp/connection';

// Mock isLeader to always return true to avoid lock contention during parallel operations
jest.mock('~/cluster', () => ({
  ...jest.requireActual('~/cluster'),
  isLeader: jest.fn().mockResolvedValue(true),
}));

describe('MCPServersInitializer Redis Integration Tests', () => {
  let MCPServersInitializer: typeof import('../MCPServersInitializer').MCPServersInitializer;
  let registry: typeof import('../MCPServersRegistry').mcpServersRegistry;
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
      url: 'https://api.example.com/mcp',
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
      url: 'https://api.example.com/mcp',
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
  };

  beforeAll(async () => {
    // Set up environment variables for Redis (only if not already set)
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX =
      process.env.REDIS_KEY_PREFIX ?? 'MCPServersInitializer-IntegrationTest';

    // Import modules after setting env vars
    const initializerModule = await import('../MCPServersInitializer');
    const registryModule = await import('../MCPServersRegistry');
    const statusCacheModule = await import('../cache/RegistryStatusCache');
    const inspectorModule = await import('../MCPServerInspector');
    const connectionFactoryModule = await import('~/mcp/MCPConnectionFactory');
    const redisClients = await import('~/cache/redisClients');
    const leaderElectionModule = await import('~/cluster/LeaderElection');

    MCPServersInitializer = initializerModule.MCPServersInitializer;
    registry = registryModule.mcpServersRegistry;
    registryStatusCache = statusCacheModule.registryStatusCache;
    MCPServerInspector = inspectorModule.MCPServerInspector;
    MCPConnectionFactory = connectionFactoryModule.MCPConnectionFactory;
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

  beforeEach(async () => {
    // Ensure we're still the leader
    const isLeader = await leaderInstance.isLeader();
    if (!isLeader) {
      throw new Error('Lost leader status before test');
    }

    // Mock MCPServerInspector.inspect to return parsed config
    jest.spyOn(MCPServerInspector, 'inspect').mockImplementation(async (serverName: string) => {
      return {
        ...testParsedConfigs[serverName],
        _processedByInspector: true,
      } as unknown as t.ParsedServerConfig;
    });

    // Mock MCPConnection
    const mockConnection = {
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MCPConnection>;

    // Mock MCPConnectionFactory
    jest.spyOn(MCPConnectionFactory, 'create').mockResolvedValue(mockConnection);

    // Reset caches before each test
    await registryStatusCache.reset();
    await registry.reset();
  });

  afterEach(async () => {
    // Clean up: clear all test keys from Redis
    if (keyvRedisClient) {
      const pattern = '*MCPServersInitializer-IntegrationTest*';
      if ('scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          await keyvRedisClient.del(key);
        }
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
      // Pre-populate registry with some old servers
      await registry.sharedAppServers.add('old_app_server', testParsedConfigs.file_tools_server);
      await registry.sharedUserServers.add('old_user_server', testParsedConfigs.oauth_server);

      // Initialize with new configs (this should reset first)
      await MCPServersInitializer.initialize(testConfigs);

      // Verify old servers are gone
      expect(await registry.sharedAppServers.get('old_app_server')).toBeUndefined();
      expect(await registry.sharedUserServers.get('old_user_server')).toBeUndefined();

      // Verify new servers are present
      expect(await registry.sharedAppServers.get('file_tools_server')).toBeDefined();
      expect(await registry.sharedUserServers.get('oauth_server')).toBeDefined();
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

    it('should add disabled servers to sharedUserServers', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      const disabledServer = await registry.sharedUserServers.get('disabled_server');
      expect(disabledServer).toBeDefined();
      expect(disabledServer).toMatchObject({
        ...testParsedConfigs.disabled_server,
        _processedByInspector: true,
      });
    });

    it('should add OAuth servers to sharedUserServers', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      const oauthServer = await registry.sharedUserServers.get('oauth_server');
      expect(oauthServer).toBeDefined();
      expect(oauthServer).toMatchObject({
        ...testParsedConfigs.oauth_server,
        _processedByInspector: true,
      });
    });

    it('should add enabled non-OAuth servers to sharedAppServers', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      const fileToolsServer = await registry.sharedAppServers.get('file_tools_server');
      expect(fileToolsServer).toBeDefined();
      expect(fileToolsServer).toMatchObject({
        ...testParsedConfigs.file_tools_server,
        _processedByInspector: true,
      });

      const searchToolsServer = await registry.sharedAppServers.get('search_tools_server');
      expect(searchToolsServer).toBeDefined();
      expect(searchToolsServer).toMatchObject({
        ...testParsedConfigs.search_tools_server,
        _processedByInspector: true,
      });
    });

    it('should successfully initialize all servers', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      // Verify all servers were added to appropriate registries
      expect(await registry.sharedUserServers.get('disabled_server')).toBeDefined();
      expect(await registry.sharedUserServers.get('oauth_server')).toBeDefined();
      expect(await registry.sharedAppServers.get('file_tools_server')).toBeDefined();
      expect(await registry.sharedAppServers.get('search_tools_server')).toBeDefined();
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
      const disabledServer = await registry.sharedUserServers.get('disabled_server');
      expect(disabledServer).toBeDefined();

      const oauthServer = await registry.sharedUserServers.get('oauth_server');
      expect(oauthServer).toBeDefined();

      const searchToolsServer = await registry.sharedAppServers.get('search_tools_server');
      expect(searchToolsServer).toBeDefined();

      // Verify file_tools_server was not added (due to inspection failure)
      const fileToolsServer = await registry.sharedAppServers.get('file_tools_server');
      expect(fileToolsServer).toBeUndefined();
    });

    it('should set initialized status after completion', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      expect(await registryStatusCache.isInitialized()).toBe(true);
    });
  });
});
