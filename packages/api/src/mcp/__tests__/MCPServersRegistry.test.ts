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
      expect(registry.oauthServers).toBeNull();
      expect(registry.serverInstructions).toBeNull();
      expect(registry.toolFunctions).toBeNull();
      expect(registry.appServerConfigs).toBeNull();

      await registry.initialize();

      // Test oauthServers Set
      expect(registry.oauthServers).toBeInstanceOf(Set);
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

    it('should handle errors gracefully and continue initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      // Make one server throw an error
      mockDetectOAuthRequirement.mockRejectedValueOnce(new Error('OAuth detection failed'));

      await registry.initialize();

      // Should still initialize successfully
      expect(registry.oauthServers).toBeInstanceOf(Set);
      expect(registry.toolFunctions).toBeDefined();

      // Error should be logged as a warning at the higher level
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[MCP][oauth_server] Failed to initialize server:'),
        expect.any(Error),
      );
    });

    it('should disconnect all connections after initialization', async () => {
      const registry = new MCPServersRegistry(rawConfigs);

      await registry.initialize();

      expect(mockConnectionsRepo.disconnectAll).toHaveBeenCalledTimes(1);
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
  });
});
