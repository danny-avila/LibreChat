import type * as t from '~/mcp/types';
import type { MCPConnection } from '~/mcp/connection';
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

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

    MCPServersInitializer = initializerModule.MCPServersInitializer;
    registry = registryModule.mcpServersRegistry;
    registryStatusCache = statusCacheModule.registryStatusCache;
    MCPServerInspector = inspectorModule.MCPServerInspector;
    MCPConnectionFactory = connectionFactoryModule.MCPConnectionFactory;
    keyvRedisClient = redisClients.keyvRedisClient;
    LeaderElection = leaderElectionModule.LeaderElection;

    // Ensure Redis is connected
    if (!keyvRedisClient) throw new Error('Redis client is not initialized');

    // Wait for Redis to be ready
    if (!keyvRedisClient.isOpen) await keyvRedisClient.connect();

    // Become leader so we can perform write operations
    leaderInstance = new LeaderElection();
    const isLeader = await leaderInstance.isLeader();
    // eslint-disable-next-line jest/no-standalone-expect
    expect(isLeader).toBe(true);
  });

  beforeEach(async () => {
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
    Date.now = originalDateNow;

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

  describe('reInitializeServer()', () => {
    it('should migrate server from sharedUserServers to sharedAppServers when OAuth requirement changes', async () => {
      // Initial setup with OAuth server
      await MCPServersInitializer.initialize({
        oauth_server: {
          type: 'streamable-http',
          url: 'https://api.example.com/mcp-oauth',
        },
      });

      // Verify server is in sharedUserServers
      let serverInUserRegistry = await registry.sharedUserServers.get('oauth_server');
      let serverInAppRegistry = await registry.sharedAppServers.get('oauth_server');
      expect(serverInUserRegistry).toBeDefined();
      expect(serverInUserRegistry?.requiresOAuth).toBe(true);
      expect(serverInAppRegistry).toBeUndefined();

      // Re-initialize with config that doesn't require OAuth
      const updatedConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp-no-auth',
      };

      await MCPServersInitializer.reInitializeServer({
        serverName: 'oauth_server',
        config: updatedConfig,
      });

      // Verify server moved to sharedAppServers
      serverInUserRegistry = await registry.sharedUserServers.get('oauth_server');
      serverInAppRegistry = await registry.sharedAppServers.get('oauth_server');
      expect(serverInUserRegistry).toBeUndefined();
      expect(serverInAppRegistry).toBeDefined();
      expect(serverInAppRegistry?.requiresOAuth).toBe(false);
      expect(serverInAppRegistry?.url).toBe('https://api.example.com/mcp-no-auth');
    });

    it('should migrate server from private to shared when isPrivateServer changes to false', async () => {
      const userId = 'redis-integration-user123';
      const privateConfig: t.ParsedServerConfig = {
        type: 'stdio',
        command: 'node',
        args: ['private-tools.js'],
        requiresOAuth: false,
      };

      // Add private server first
      await registry.addPrivateUserServer(userId, 'my_server', privateConfig);

      // Verify server is in private registry
      const privateServer = await registry.getPrivateServerConfig('my_server', userId);
      expect(privateServer).toBeDefined();

      // Re-initialize as shared server
      const sharedConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['shared-tools.js'],
      };

      await MCPServersInitializer.reInitializeServer({
        serverName: 'my_server',
        config: sharedConfig,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user: { id: userId } as any,
        isPrivateServer: false,
      });

      // Verify server is now in shared registry
      const sharedServer = await registry.sharedAppServers.get('my_server');
      expect(sharedServer).toBeDefined();

      // Verify server is NO LONGER in private registry
      expect(await registry.getPrivateServerConfig('my_server', userId)).toBeUndefined();
    });
  });

  describe('initPrivateServers()', () => {
    const userId = 'user123';

    it('should initialize multiple private servers for a user', async () => {
      const privateConfigs: t.MCPServers = {
        private_file_tools: {
          type: 'stdio',
          command: 'node',
          args: ['private-file.js'],
        },
        private_search_tools: {
          type: 'stdio',
          command: 'node',
          args: ['private-search.js'],
        },
      };

      await MCPServersInitializer.initPrivateServers(privateConfigs, userId);

      // Verify both servers were added to private registry
      const fileTools = await registry.getPrivateServerConfig('private_file_tools', userId);
      const searchTools = await registry.getPrivateServerConfig('private_search_tools', userId);

      expect(fileTools).toBeDefined();
      expect(searchTools).toBeDefined();
      expect(fileTools?.type).toBe('stdio');
      expect(searchTools?.type).toBe('stdio');
    });

    it('should skip initialization for already cached private servers', async () => {
      const privateConfigs: t.MCPServers = {
        cached_server: testConfigs.file_tools_server,
      };

      // Pre-add server to private cache
      await registry.addPrivateUserServer(userId, 'cached_server', {
        ...testParsedConfigs.file_tools_server,
      });

      // Get cached config before re-init
      const cachedBefore = await registry.getPrivateServerConfig('cached_server', userId);
      expect(cachedBefore).toBeDefined();

      // Initialize again - should skip due to cache
      await MCPServersInitializer.initPrivateServers(privateConfigs, userId);

      // Verify server config hasn't changed (still cached)
      const cachedAfter = await registry.getPrivateServerConfig('cached_server', userId);
      expect(cachedAfter).toBeDefined();
      expect(cachedAfter).toEqual(cachedBefore);
    });

    it('should handle private server initialization failures gracefully', async () => {
      const privateConfigs: t.MCPServers = {
        failing_server: {
          type: 'stdio',
          command: 'node',
          args: ['failing.js'],
        },
        working_server: {
          type: 'stdio',
          command: 'node',
          args: ['working.js'],
        },
      };

      // Mock addPrivateUserServer to fail for one server
      const originalAddPrivate = registry.addPrivateUserServer.bind(registry);
      jest.spyOn(registry, 'addPrivateUserServer').mockImplementation(async (uid, name, config) => {
        if (name === 'failing_server') {
          throw new Error('Failed to add private server');
        }
        return originalAddPrivate(uid, name, config);
      });

      await MCPServersInitializer.initPrivateServers(privateConfigs, userId);

      // Verify working server was still added
      const workingServer = await registry.getPrivateServerConfig('working_server', userId);
      expect(workingServer).toBeDefined();

      // Verify failing server was not added
      const failingServer = await registry.getPrivateServerConfig('failing_server', userId);
      expect(failingServer).toBeUndefined();
    });

    it('should initialize private servers with user-specific cache isolation', async () => {
      const user1 = 'user1';
      const user2 = 'user2';

      const privateConfigsUser1: t.MCPServers = {
        user1_server: {
          type: 'stdio',
          command: 'node',
          args: ['user1.js'],
        },
      };

      const privateConfigsUser2: t.MCPServers = {
        user2_server: {
          type: 'stdio',
          command: 'node',
          args: ['user2.js'],
        },
      };

      await MCPServersInitializer.initPrivateServers(privateConfigsUser1, user1);
      await MCPServersInitializer.initPrivateServers(privateConfigsUser2, user2);

      // Verify each user has their own server
      const user1Server = await registry.getPrivateServerConfig('user1_server', user1);
      const user2Server = await registry.getPrivateServerConfig('user2_server', user2);

      expect(user1Server).toBeDefined();
      expect(user2Server).toBeDefined();

      // Verify servers are isolated - user2 can't see user1's server
      const user1ServerFromUser2 = await registry.getPrivateServerConfig('user1_server', user2);
      expect(user1ServerFromUser2).toBeUndefined();

      // Verify servers are isolated - user1 can't see user2's server
      const user2ServerFromUser1 = await registry.getPrivateServerConfig('user2_server', user1);
      expect(user2ServerFromUser1).toBeUndefined();
    });

    it('should use Promise.allSettled for parallel initialization', async () => {
      const allSettledSpy = jest.spyOn(Promise, 'allSettled');

      const privateConfigs: t.MCPServers = {
        server1: testConfigs.file_tools_server,
        server2: testConfigs.search_tools_server,
      };

      await MCPServersInitializer.initPrivateServers(privateConfigs, userId);
      expect(allSettledSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Promise)]));
      expect(allSettledSpy).toHaveBeenCalledTimes(1);

      allSettledSpy.mockRestore();
    });

    it('should allow same server name for different users', async () => {
      const user1 = 'user1';
      const user2 = 'user2';

      const sharedServerName = 'my_tools_server';

      const configUser1: t.MCPServers = {
        [sharedServerName]: {
          type: 'stdio',
          command: 'node',
          args: ['user1-tools.js'],
        },
      };

      const configUser2: t.MCPServers = {
        [sharedServerName]: {
          type: 'stdio',
          command: 'node',
          args: ['user2-tools.js'],
        },
      };

      await MCPServersInitializer.initPrivateServers(configUser1, user1);
      await MCPServersInitializer.initPrivateServers(configUser2, user2);

      // Verify each user has their own version with different args
      const user1Server = await registry.getPrivateServerConfig(sharedServerName, user1);
      const user2Server = await registry.getPrivateServerConfig(sharedServerName, user2);

      expect(user1Server).toBeDefined();
      expect(user2Server).toBeDefined();

      if (user1Server && 'args' in user1Server) {
        expect(user1Server.args).toEqual(['user1-tools.js']);
      }
      if (user2Server && 'args' in user2Server) {
        expect(user2Server.args).toEqual(['user2-tools.js']);
      }
    });
  });
});
