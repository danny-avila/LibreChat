import { logger } from '@librechat/data-schemas';
import * as t from '~/mcp/types';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPConnection } from '~/mcp/connection';
import { registryStatusCache } from '~/mcp/registry/cache/RegistryStatusCache';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { mcpServersRegistry as registry } from '~/mcp/registry/MCPServersRegistry';
const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

// Mock external dependencies
jest.mock('../../MCPConnectionFactory');
jest.mock('../../connection');
jest.mock('../../registry/MCPServerInspector');
jest.mock('~/cluster', () => ({
  isLeader: jest.fn().mockResolvedValue(true),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockInspect = MCPServerInspector.inspect as jest.MockedFunction<
  typeof MCPServerInspector.inspect
>;

describe('MCPServersInitializer', () => {
  let mockConnection: jest.Mocked<MCPConnection>;

  afterAll(() => {
    Date.now = originalDateNow;
  });

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
    remote_no_oauth_server: {
      type: 'streamable-http',
      url: 'https://api.example.com/mcp-no-auth',
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
      // If URL ends with '-oauth', requires OAuth
      return config.url.endsWith('-oauth');
    }
    return false;
  };

  beforeEach(async () => {
    // Setup MCPConnection mock
    mockConnection = {
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MCPConnection>;

    // Setup MCPConnectionFactory mock
    (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

    // Mock MCPServerInspector.inspect to return parsed config
    // This mock inspects the actual rawConfig to determine requiresOAuth dynamically
    mockInspect.mockImplementation(async (serverName: string, rawConfig: t.MCPOptions) => {
      const baseConfig = testParsedConfigs[serverName] || {};
      return {
        ...baseConfig,
        ...rawConfig,
        // Override requiresOAuth based on the actual config being inspected
        requiresOAuth: determineRequiresOAuth(rawConfig),
        _processedByInspector: true,
      } as unknown as t.ParsedServerConfig;
    });

    // Reset caches before each test
    await registryStatusCache.reset();
    await registry.sharedAppServers.reset();
    await registry.sharedUserServers.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    it('should skip initialization if already initialized (Redis flag)', async () => {
      // First initialization
      await MCPServersInitializer.initialize(testConfigs);

      jest.clearAllMocks();

      // Second initialization should skip due to Redis cache flag
      await MCPServersInitializer.initialize(testConfigs);

      expect(mockInspect).not.toHaveBeenCalled();
    });

    it('should process all server configs through inspector', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      // Verify all configs were processed by inspector (without connection parameter)
      expect(mockInspect).toHaveBeenCalledTimes(5);
      expect(mockInspect).toHaveBeenCalledWith('disabled_server', testConfigs.disabled_server);
      expect(mockInspect).toHaveBeenCalledWith('oauth_server', testConfigs.oauth_server);
      expect(mockInspect).toHaveBeenCalledWith('file_tools_server', testConfigs.file_tools_server);
      expect(mockInspect).toHaveBeenCalledWith(
        'search_tools_server',
        testConfigs.search_tools_server,
      );
      expect(mockInspect).toHaveBeenCalledWith(
        'remote_no_oauth_server',
        testConfigs.remote_no_oauth_server,
      );
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
      mockInspect.mockImplementation(async (serverName: string, rawConfig: t.MCPOptions) => {
        if (serverName === 'file_tools_server') {
          throw new Error('Inspection failed');
        }
        const baseConfig = testParsedConfigs[serverName] || {};
        return {
          ...rawConfig,
          ...baseConfig,
          requiresOAuth: determineRequiresOAuth(rawConfig),
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

    it('should log server configuration after initialization', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      // Verify logging occurred for each server
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][disabled_server]'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[MCP][oauth_server]'));
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][file_tools_server]'),
      );
    });

    it('should use Promise.allSettled for parallel server initialization', async () => {
      const allSettledSpy = jest.spyOn(Promise, 'allSettled');

      await MCPServersInitializer.initialize(testConfigs);

      expect(allSettledSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Promise)]));
      expect(allSettledSpy).toHaveBeenCalledTimes(1);

      allSettledSpy.mockRestore();
    });

    it('should set initialized status after completion', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      expect(await registryStatusCache.isInitialized()).toBe(true);
    });
  });

  describe('reInitializeServer()', () => {
    it('should migrate server from sharedUserServers to sharedAppServers when OAuth requirement changes', async () => {
      await MCPServersInitializer.initialize(testConfigs);

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

    it('should migrate server from sharedAppServers to sharedUserServers when OAuth is added', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      // Verify server is in sharedAppServers (no OAuth required)
      let serverInAppRegistry = await registry.sharedAppServers.get('remote_no_oauth_server');
      let serverInUserRegistry = await registry.sharedUserServers.get('remote_no_oauth_server');
      expect(serverInAppRegistry).toBeDefined();
      expect(serverInAppRegistry?.requiresOAuth).toBe(false);
      expect(serverInUserRegistry).toBeUndefined();

      // Re-initialize with OAuth-required config (URL ending with -oauth)
      const updatedConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.example.com/protected-mcp-oauth',
      };

      await MCPServersInitializer.reInitializeServer({
        serverName: 'remote_no_oauth_server',
        config: updatedConfig,
      });

      // Verify server moved to sharedUserServers
      serverInAppRegistry = await registry.sharedAppServers.get('remote_no_oauth_server');
      serverInUserRegistry = await registry.sharedUserServers.get('remote_no_oauth_server');
      expect(serverInAppRegistry).toBeUndefined();
      expect(serverInUserRegistry).toBeDefined();
      expect(serverInUserRegistry?.requiresOAuth).toBe(true);
      expect(serverInUserRegistry?.url).toBe('https://api.example.com/protected-mcp-oauth');
    });

    it('should throw error when re-initializing private server without user', async () => {
      await MCPServersInitializer.initialize(testConfigs);

      const config: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['tools.js'],
      };

      await expect(
        MCPServersInitializer.reInitializeServer({
          serverName: 'file_tools_server',
          config,
          isPrivateServer: true,
        }),
      ).rejects.toThrow('User must be provided for private server updates');
    });

    it('should throw error when user lacks id for private server', async () => {
      await MCPServersInitializer.initialize(testConfigs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userWithoutId = { name: 'Test User' } as any;

      await expect(
        MCPServersInitializer.reInitializeServer({
          serverName: 'file_tools_server',
          config: testConfigs.file_tools_server,
          user: userWithoutId,
          isPrivateServer: true,
        }),
      ).rejects.toThrow('User must be provided for private server updates');
    });

    it('should migrate server from private to shared when isPrivateServer changes to false', async () => {
      const userId = 'user123';
      const privateConfig: t.ParsedServerConfig = {
        type: 'stdio',
        command: 'node',
        args: ['private-tools.js'],
        requiresOAuth: false,
      };

      // Add private server first
      await registry.addPrivateUserServer(userId, 'my_server', privateConfig);

      // Verify server is in private registry using the new helper method
      const privateServer = await registry.getPrivateServerConfig('my_server', userId);
      expect(privateServer).toBeDefined();
      expect(privateServer?.type).toBe('stdio');
      if (privateServer && 'args' in privateServer) {
        expect(privateServer.args).toEqual(['private-tools.js']);
      }

      // Verify server is NOT in shared registries
      expect(await registry.sharedAppServers.get('my_server')).toBeUndefined();
      expect(await registry.sharedUserServers.get('my_server')).toBeUndefined();

      // Re-initialize as shared server (isPrivateServer: false)
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
      expect(sharedServer?.type).toBe('stdio');
      if (sharedServer && 'args' in sharedServer) {
        expect(sharedServer.args).toEqual(['shared-tools.js']);
      }

      // Verify server is NO LONGER in private registry
      expect(await registry.getPrivateServerConfig('my_server', userId)).toBeUndefined();
    });

    it('should migrate server from shared to private when isPrivateServer changes to true', async () => {
      const userId = 'user456';

      // Initialize as shared server
      await MCPServersInitializer.initialize({
        my_shared_server: {
          type: 'stdio',
          command: 'node',
          args: ['shared.js'],
        },
      });

      // Verify server is in shared app registry
      let sharedServer = await registry.sharedAppServers.get('my_shared_server');
      expect(sharedServer).toBeDefined();
      expect(sharedServer?.type).toBe('stdio');
      if (sharedServer && 'args' in sharedServer) {
        expect(sharedServer.args).toEqual(['shared.js']);
      }

      // Re-initialize as private server
      const privateConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['private.js'],
      };

      await MCPServersInitializer.reInitializeServer({
        serverName: 'my_shared_server',
        config: privateConfig,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user: { id: userId } as any,
        isPrivateServer: true,
      });

      // Verify server is now in private registry using the new helper method
      const privateServer = await registry.getPrivateServerConfig('my_shared_server', userId);
      expect(privateServer).toBeDefined();
      if (privateServer && 'args' in privateServer) {
        expect(privateServer.args).toEqual(['private.js']);
      }
      // Verify server is NO LONGER in shared registry
      sharedServer = await registry.sharedAppServers.get('my_shared_server');
      expect(sharedServer).toBeUndefined();
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

      jest.clearAllMocks();

      // Initialize again - should skip due to cache
      await MCPServersInitializer.initPrivateServers(privateConfigs, userId);

      // Verify debug log was called (indicating cache hit)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][cached_server]'),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Using cached config'));
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

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][failing_server]'),
        expect.any(Error),
      );

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
