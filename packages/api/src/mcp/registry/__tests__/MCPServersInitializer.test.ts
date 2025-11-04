import { logger } from '@librechat/data-schemas';
import * as t from '~/mcp/types';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPConnection } from '~/mcp/connection';
import { registryStatusCache } from '~/mcp/registry/cache/RegistryStatusCache';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { mcpServersRegistry as registry } from '~/mcp/registry/MCPServersRegistry';

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

  beforeEach(async () => {
    // Setup MCPConnection mock
    mockConnection = {
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MCPConnection>;

    // Setup MCPConnectionFactory mock
    (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

    // Mock MCPServerInspector.inspect to return parsed config
    mockInspect.mockImplementation(async (serverName: string) => {
      return {
        ...testParsedConfigs[serverName],
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
      expect(mockInspect).toHaveBeenCalledTimes(4);
      expect(mockInspect).toHaveBeenCalledWith('disabled_server', testConfigs.disabled_server);
      expect(mockInspect).toHaveBeenCalledWith('oauth_server', testConfigs.oauth_server);
      expect(mockInspect).toHaveBeenCalledWith('file_tools_server', testConfigs.file_tools_server);
      expect(mockInspect).toHaveBeenCalledWith(
        'search_tools_server',
        testConfigs.search_tools_server,
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
      mockInspect.mockImplementation(async (serverName: string) => {
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
});
