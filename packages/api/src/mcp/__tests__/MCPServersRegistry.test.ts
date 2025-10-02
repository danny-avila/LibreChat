import { join } from 'path';
import { readFileSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';
import { logger } from '@librechat/data-schemas';
import type { OAuthDetectionResult } from '~/mcp/oauth/detectOAuth';
import type * as t from '~/mcp/types';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPServersRegistry } from '~/mcp/MCPServersRegistry';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { MCPConnection } from '~/mcp/connection';

// Mock external dependencies
jest.mock('../oauth/detectOAuth');
jest.mock('../ConnectionsRepository');
jest.mock('../connection');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock processMCPEnv to verify it's called and adds a processed marker
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  processMCPEnv: jest.fn(({ options }) => ({
    ...options,
    _processed: true, // Simple marker to verify processing occurred
  })),
}));

const mockDetectOAuthRequirement = detectOAuthRequirement as jest.MockedFunction<
  typeof detectOAuthRequirement
>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('MCPServersRegistry - Initialize Function', () => {
  let rawConfigs: t.MCPServers;
  let expectedParsedConfigs: Record<string, t.ParsedServerConfig>;
  let mockConnectionsRepo: jest.Mocked<ConnectionsRepository>;
  let mockConnections: Map<string, jest.Mocked<MCPConnection>>;

  beforeEach(() => {
    // Load fixtures
    const rawConfigsPath = join(__dirname, 'fixtures', 'MCPServersRegistry.rawConfigs.yml');
    const parsedConfigsPath = join(__dirname, 'fixtures', 'MCPServersRegistry.parsedConfigs.yml');

    rawConfigs = yamlLoad(readFileSync(rawConfigsPath, 'utf8')) as t.MCPServers;
    expectedParsedConfigs = yamlLoad(readFileSync(parsedConfigsPath, 'utf8')) as Record<
      string,
      t.ParsedServerConfig
    >;

    // Setup mock connections
    mockConnections = new Map();
    const serverNames = Object.keys(rawConfigs);

    serverNames.forEach((serverName) => {
      const mockClient = {
        listTools: jest.fn(),
        getInstructions: jest.fn(),
        getServerCapabilities: jest.fn(),
      };
      const mockConnection = {
        client: mockClient,
      } as unknown as jest.Mocked<MCPConnection>;

      // Setup mock responses based on expected configs
      const expectedConfig = expectedParsedConfigs[serverName];

      // Mock listTools response
      if (expectedConfig.tools) {
        const toolNames = expectedConfig.tools.split(', ');
        const tools = toolNames.map((name: string) => ({
          name,
          description: `Description for ${name}`,
          inputSchema: {
            type: 'object' as const,
            properties: {
              input: { type: 'string' },
            },
          },
        }));
        (mockClient.listTools as jest.Mock).mockResolvedValue({ tools });
      } else {
        (mockClient.listTools as jest.Mock).mockResolvedValue({ tools: [] });
      }

      // Mock getInstructions response
      if (expectedConfig.serverInstructions) {
        (mockClient.getInstructions as jest.Mock).mockReturnValue(
          expectedConfig.serverInstructions as string,
        );
      } else {
        (mockClient.getInstructions as jest.Mock).mockReturnValue(undefined);
      }

      // Mock getServerCapabilities response
      if (expectedConfig.capabilities) {
        const capabilities = JSON.parse(expectedConfig.capabilities) as Record<string, unknown>;
        (mockClient.getServerCapabilities as jest.Mock).mockReturnValue(capabilities);
      } else {
        (mockClient.getServerCapabilities as jest.Mock).mockReturnValue(undefined);
      }

      mockConnections.set(serverName, mockConnection);
    });

    // Setup ConnectionsRepository mock
    mockConnectionsRepo = {
      get: jest.fn(),
      getLoaded: jest.fn(),
      disconnectAll: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ConnectionsRepository>;

    mockConnectionsRepo.get.mockImplementation((serverName: string) => {
      const connection = mockConnections.get(serverName);
      if (!connection) {
        throw new Error(`Connection not found for server: ${serverName}`);
      }
      return Promise.resolve(connection);
    });

    mockConnectionsRepo.getLoaded.mockResolvedValue(mockConnections);

    (ConnectionsRepository as jest.Mock).mockImplementation(() => mockConnectionsRepo);

    // Setup OAuth detection mock with deterministic results
    mockDetectOAuthRequirement.mockImplementation((url: string) => {
      const oauthResults: Record<string, OAuthDetectionResult> = {
        'https://api.github.com/mcp': {
          requiresOAuth: true,
          method: 'protected-resource-metadata',
          metadata: {
            authorization_url: 'https://github.com/login/oauth/authorize',
            token_url: 'https://github.com/login/oauth/access_token',
          },
        },
        'https://api.disabled.com/mcp': {
          requiresOAuth: false,
          method: 'no-metadata-found',
          metadata: null,
        },
        'https://api.public.com/mcp': {
          requiresOAuth: false,
          method: 'no-metadata-found',
          metadata: null,
        },
      };

      return Promise.resolve(
        oauthResults[url] || { requiresOAuth: false, method: 'no-metadata-found', metadata: null },
      );
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MCP_INIT_TIMEOUT_MS;
    jest.clearAllMocks();
  });

  describe('initialize() method', () => {
    it('should only run initialization once', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      await registry.initialize();
      await registry.initialize(); // Second call should not re-run

      // Verify that connections are only requested for servers that need them
      // (servers with serverInstructions=true or all servers for capabilities)
      expect(mockConnectionsRepo.get).toHaveBeenCalled();
    });

    it('should set all public properties correctly after initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Verify initial state
      expect(registry.oauthServers.size).toBe(0);
      expect(registry.serverInstructions).toEqual({});
      expect(registry.toolFunctions).toEqual({});
      expect(registry.appServerConfigs).toEqual({});

      await registry.initialize();

      // Test oauthServers Set
      expect(registry.oauthServers).toEqual(
        new Set(['oauth_server', 'oauth_predefined', 'oauth_startup_enabled']),
      );

      // Test serverInstructions - OAuth servers keep their original boolean value, non-OAuth fetch actual strings
      expect(registry.serverInstructions).toEqual({
        stdio_server: 'Follow these instructions for stdio server',
        oauth_server: true,
        non_oauth_server: 'Public API instructions',
      });

      // Test appServerConfigs (startup enabled, non-OAuth servers only)
      expect(registry.appServerConfigs).toEqual({
        stdio_server: rawConfigs.stdio_server,
        websocket_server: rawConfigs.websocket_server,
        non_oauth_server: rawConfigs.non_oauth_server,
      });

      // Test toolFunctions (only non-OAuth servers get their tools fetched during initialization)
      const expectedToolFunctions = {
        file_read_mcp_stdio_server: {
          type: 'function',
          function: {
            name: 'file_read_mcp_stdio_server',
            description: 'Description for file_read',
            parameters: { type: 'object', properties: { input: { type: 'string' } } },
          },
        },
        file_write_mcp_stdio_server: {
          type: 'function',
          function: {
            name: 'file_write_mcp_stdio_server',
            description: 'Description for file_write',
            parameters: { type: 'object', properties: { input: { type: 'string' } } },
          },
        },
      };
      expect(registry.toolFunctions).toEqual(expectedToolFunctions);
    });

    it('should handle errors gracefully and continue initialization of other servers', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Make one specific server throw an error during OAuth detection
      mockDetectOAuthRequirement.mockImplementation((url: string) => {
        if (url === 'https://api.github.com/mcp') {
          return Promise.reject(new Error('OAuth detection failed'));
        }
        // Return normal responses for other servers
        const oauthResults: Record<string, OAuthDetectionResult> = {
          'https://api.disabled.com/mcp': {
            requiresOAuth: false,
            method: 'no-metadata-found',
            metadata: null,
          },
          'https://api.public.com/mcp': {
            requiresOAuth: false,
            method: 'no-metadata-found',
            metadata: null,
          },
        };
        return Promise.resolve(
          oauthResults[url] ?? {
            requiresOAuth: false,
            method: 'no-metadata-found',
            metadata: null,
          },
        );
      });

      await registry.initialize();

      // Should still initialize successfully for other servers
      expect(registry.oauthServers).toBeInstanceOf(Set);
      expect(registry.toolFunctions).toBeDefined();

      // The failed server should not be in oauthServers (since it failed OAuth detection)
      expect(registry.oauthServers.has('oauth_server')).toBe(false);

      // But other servers should still be processed successfully
      expect(registry.appServerConfigs).toHaveProperty('stdio_server');
      expect(registry.appServerConfigs).toHaveProperty('non_oauth_server');

      // Error should be logged as a warning at the higher level
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][oauth_server] Failed to initialize server:'),
        expect.any(Error),
      );
    });

    it('should disconnect individual connections after each server initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      await registry.initialize();

      // Verify disconnect was called for each server during initialization
      // All servers attempt to connect during initialization for metadata gathering
      const serverNames = Object.keys(rawConfigs);
      expect(mockConnectionsRepo.disconnect).toHaveBeenCalledTimes(serverNames.length);
    });

    it('should log configuration updates for each startup-enabled server', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      await registry.initialize();

      const serverNames = Object.keys(rawConfigs);
      serverNames.forEach((serverName) => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`[MCP][${serverName}] URL:`),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`[MCP][${serverName}] OAuth Required:`),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`[MCP][${serverName}] Capabilities:`),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`[MCP][${serverName}] Tools:`),
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`[MCP][${serverName}] Server Instructions:`),
        );
      });
    });

    it('should have parsedConfigs matching the expected fixture after initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      await registry.initialize();

      // Compare the actual parsedConfigs against the expected fixture
      expect(registry.parsedConfigs).toEqual(expectedParsedConfigs);
    });

    it('should handle serverInstructions as string "true" correctly and fetch from server', async () => {
      // Create test config with serverInstructions as string "true"
      const testConfig: t.MCPServers = {
        test_server_string_true: {
          type: 'stdio',
          args: [],
          command: 'test-command',
          serverInstructions: 'true', // Simulating string "true" from YAML parsing
        },
        test_server_custom_string: {
          type: 'stdio',
          args: [],
          command: 'test-command',
          serverInstructions: 'Custom instructions here',
        },
        test_server_bool_true: {
          type: 'stdio',
          args: [],
          command: 'test-command',
          serverInstructions: true,
        },
      };

      const registry = new MCPServersRegistry(testConfig);

      // Setup mock connection for servers that should fetch
      const mockClient = {
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
        getInstructions: jest.fn().mockReturnValue('Fetched instructions from server'),
        getServerCapabilities: jest.fn().mockReturnValue({ tools: {} }),
      };
      const mockConnection = {
        client: mockClient,
      } as unknown as jest.Mocked<MCPConnection>;

      mockConnectionsRepo.get.mockResolvedValue(mockConnection);
      mockConnectionsRepo.getLoaded.mockResolvedValue(
        new Map([
          ['test_server_string_true', mockConnection],
          ['test_server_bool_true', mockConnection],
        ]),
      );
      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
        metadata: null,
      });

      await registry.initialize();

      // Verify that string "true" was treated as fetch-from-server
      expect(registry.parsedConfigs['test_server_string_true'].serverInstructions).toBe(
        'Fetched instructions from server',
      );

      // Verify that custom string was kept as-is
      expect(registry.parsedConfigs['test_server_custom_string'].serverInstructions).toBe(
        'Custom instructions here',
      );

      // Verify that boolean true also fetched from server
      expect(registry.parsedConfigs['test_server_bool_true'].serverInstructions).toBe(
        'Fetched instructions from server',
      );

      // Verify getInstructions was called for both "true" cases
      expect(mockClient.getInstructions).toHaveBeenCalledTimes(2);
    });

    it('should use Promise.allSettled for individual server initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Spy on Promise.allSettled to verify it's being used
      const allSettledSpy = jest.spyOn(Promise, 'allSettled');

      await registry.initialize();

      // Verify Promise.allSettled was called with an array of server initialization promises
      expect(allSettledSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Promise)]));

      // Verify it was called with the correct number of server promises
      const serverNames = Object.keys(rawConfigs);
      expect(allSettledSpy).toHaveBeenCalledWith(
        expect.arrayContaining(new Array(serverNames.length).fill(expect.any(Promise))),
      );

      allSettledSpy.mockRestore();
    });

    it('should isolate server failures and not affect other servers', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Make multiple servers fail in different ways
      mockConnectionsRepo.get.mockImplementation((serverName: string) => {
        if (serverName === 'stdio_server') {
          // First server fails
          throw new Error('Connection failed for stdio_server');
        }
        if (serverName === 'websocket_server') {
          // Second server fails
          throw new Error('Connection failed for websocket_server');
        }
        // Other servers succeed
        const connection = mockConnections.get(serverName);
        if (!connection) {
          throw new Error(`Connection not found for server: ${serverName}`);
        }
        return Promise.resolve(connection);
      });

      await registry.initialize();

      // Despite failures, initialization should complete
      expect(registry.oauthServers).toBeInstanceOf(Set);
      expect(registry.toolFunctions).toBeDefined();

      // Successful servers should still be processed
      expect(registry.appServerConfigs).toHaveProperty('non_oauth_server');

      // Failed servers should not crash the whole initialization
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][stdio_server] Failed to fetch server capabilities:'),
        expect.any(Error),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][websocket_server] Failed to fetch server capabilities:'),
        expect.any(Error),
      );
    });

    it('should properly clean up connections even when some servers fail', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Track disconnect failures but suppress unhandled rejections
      const disconnectErrors: Error[] = [];
      mockConnectionsRepo.disconnect.mockImplementation((serverName: string) => {
        if (serverName === 'stdio_server') {
          const error = new Error('Disconnect failed');
          disconnectErrors.push(error);
          return Promise.reject(error).catch(() => {}); // Suppress unhandled rejection
        }
        return Promise.resolve();
      });

      await registry.initialize();

      // Should still attempt to disconnect all servers during initialization
      const serverNames = Object.keys(rawConfigs);
      expect(mockConnectionsRepo.disconnect).toHaveBeenCalledTimes(serverNames.length);
      expect(disconnectErrors).toHaveLength(1);
    });

    it('should timeout individual server initialization after configured timeout', async () => {
      const timeout = 2000;
      // Create registry with a short timeout for testing
      process.env.MCP_INIT_TIMEOUT_MS = `${timeout}`;

      const registry = new MCPServersRegistry(rawConfigs);

      // Make one server hang indefinitely during OAuth detection
      mockDetectOAuthRequirement.mockImplementation((url: string) => {
        if (url === 'https://api.github.com/mcp') {
          // Slow init
          return new Promise((res) => setTimeout(res, timeout * 2));
        }
        // Return normal responses for other servers
        return Promise.resolve({
          requiresOAuth: false,
          method: 'no-metadata-found',
          metadata: null,
        });
      });

      const start = Date.now();
      await registry.initialize();
      const duration = Date.now() - start;

      // Should complete within reasonable time despite one server hanging
      // Allow some buffer for test execution overhead
      expect(duration).toBeLessThan(timeout * 1.5);

      // The timeout should prevent the hanging server from blocking initialization
      // Other servers should still be processed successfully
      expect(registry.appServerConfigs).toHaveProperty('stdio_server');
      expect(registry.appServerConfigs).toHaveProperty('non_oauth_server');
    }, 10_000); // 10 second Jest timeout

    it('should skip tool function fetching if connection was not established', async () => {
      const testConfig: t.MCPServers = {
        server_with_connection: {
          type: 'stdio',
          args: [],
          command: 'test-command',
        },
        server_without_connection: {
          type: 'stdio',
          args: [],
          command: 'failing-command',
        },
      };

      const registry = new MCPServersRegistry(testConfig);

      const mockClient = {
        listTools: jest.fn().mockResolvedValue({
          tools: [
            {
              name: 'test_tool',
              description: 'Test tool',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
        getInstructions: jest.fn().mockReturnValue(undefined),
        getServerCapabilities: jest.fn().mockReturnValue({ tools: {} }),
      };
      const mockConnection = {
        client: mockClient,
      } as unknown as jest.Mocked<MCPConnection>;

      mockConnectionsRepo.get.mockImplementation((serverName: string) => {
        if (serverName === 'server_with_connection') {
          return Promise.resolve(mockConnection);
        }
        throw new Error('Connection failed');
      });

      // Mock getLoaded to return connections map - the real implementation returns all loaded connections at once
      mockConnectionsRepo.getLoaded.mockResolvedValue(
        new Map([['server_with_connection', mockConnection]]),
      );

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
        metadata: null,
      });

      await registry.initialize();

      expect(registry.toolFunctions).toHaveProperty('test_tool_mcp_server_with_connection');
      expect(Object.keys(registry.toolFunctions)).toHaveLength(1);
    });

    it('should handle getLoaded returning empty map gracefully', async () => {
      const testConfig: t.MCPServers = {
        test_server: {
          type: 'stdio',
          args: [],
          command: 'test-command',
        },
      };

      const registry = new MCPServersRegistry(testConfig);

      mockConnectionsRepo.get.mockRejectedValue(new Error('All connections failed'));
      mockConnectionsRepo.getLoaded.mockResolvedValue(new Map());
      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
        metadata: null,
      });

      await registry.initialize();

      expect(registry.toolFunctions).toEqual({});
    });
  });
});
