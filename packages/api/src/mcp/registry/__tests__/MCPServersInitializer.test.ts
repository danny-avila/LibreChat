import { logger } from '@librechat/data-schemas';
import * as t from '~/mcp/types';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPConnection } from '~/mcp/connection';
import { registryStatusCache } from '~/mcp/registry/cache/RegistryStatusCache';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';

const FIXED_TIME = 1699564800000;
const originalDateNow = Date.now;
Date.now = jest.fn(() => FIXED_TIME);

// Mock mongoose for registry initialization
const mockMongoose = {} as typeof import('mongoose');

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

// Mock ServerConfigsDB to avoid mongoose dependency
jest.mock('~/mcp/registry/db/ServerConfigsDB', () => ({
  ServerConfigsDB: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockInspect = MCPServerInspector.inspect as jest.MockedFunction<
  typeof MCPServerInspector.inspect
>;

describe('MCPServersInitializer', () => {
  let mockConnection: jest.Mocked<MCPConnection>;
  let registry: MCPServersRegistry;

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
    // Reset the singleton instance before each test
    (MCPServersRegistry as unknown as { instance: undefined }).instance = undefined;

    // Create a new instance for testing
    MCPServersRegistry.createInstance(mockMongoose);
    registry = MCPServersRegistry.getInstance();

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

    // Reset caches and process flag before each test
    await registryStatusCache.reset();
    await registry.reset();
    MCPServersInitializer.resetProcessFlag();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialize()', () => {
    it('should reset registry and status cache before initialization', async () => {
      // Pre-populate registry with some old servers using the public API
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

      // Verify all configs were processed by inspector
      // Signature: inspect(serverName, rawConfig, connection?, allowedDomains?)
      expect(mockInspect).toHaveBeenCalledTimes(5);
      expect(mockInspect).toHaveBeenCalledWith(
        'disabled_server',
        testConfigs.disabled_server,
        undefined,
        undefined,
      );
      expect(mockInspect).toHaveBeenCalledWith(
        'oauth_server',
        testConfigs.oauth_server,
        undefined,
        undefined,
      );
      expect(mockInspect).toHaveBeenCalledWith(
        'file_tools_server',
        testConfigs.file_tools_server,
        undefined,
        undefined,
      );
      expect(mockInspect).toHaveBeenCalledWith(
        'search_tools_server',
        testConfigs.search_tools_server,
        undefined,
        undefined,
      );
      expect(mockInspect).toHaveBeenCalledWith(
        'remote_no_oauth_server',
        testConfigs.remote_no_oauth_server,
        undefined,
        undefined,
      );
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

    it('should re-initialize on first call even if Redis cache says initialized (simulating app restart)', async () => {
      // First initialization - populates caches
      await MCPServersInitializer.initialize(testConfigs);
      expect(await registryStatusCache.isInitialized()).toBe(true);
      expect(await registry.getServerConfig('file_tools_server')).toBeDefined();

      // Simulate stale data: add an extra server that shouldn't be there
      await registry.addServer('stale_server', testConfigs.file_tools_server, 'CACHE');
      expect(await registry.getServerConfig('stale_server')).toBeDefined();

      jest.clearAllMocks();

      // Simulate app restart by resetting the process flag
      // In real scenario, this happens automatically when process restarts
      MCPServersInitializer.resetProcessFlag();

      // Re-initialize - should reset caches even though Redis says initialized
      await MCPServersInitializer.initialize(testConfigs);

      // Verify stale server was removed (cache was reset)
      expect(await registry.getServerConfig('stale_server')).toBeUndefined();

      // Verify new servers are present
      expect(await registry.getServerConfig('file_tools_server')).toBeDefined();
      expect(await registry.getServerConfig('oauth_server')).toBeDefined();

      // Verify inspector was called again (re-initialization happened)
      expect(mockInspect).toHaveBeenCalled();
    });

    it('should not re-initialize on subsequent calls within same process', async () => {
      // First initialization (5 servers in testConfigs)
      await MCPServersInitializer.initialize(testConfigs);
      expect(mockInspect).toHaveBeenCalledTimes(5);

      jest.clearAllMocks();

      // Second call - should skip because process flag is set and Redis says initialized
      await MCPServersInitializer.initialize(testConfigs);
      expect(mockInspect).not.toHaveBeenCalled();

      // Third call - still skips
      await MCPServersInitializer.initialize(testConfigs);
      expect(mockInspect).not.toHaveBeenCalled();
    });
  });
});
