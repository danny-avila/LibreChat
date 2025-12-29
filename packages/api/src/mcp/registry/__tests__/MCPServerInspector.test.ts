import type { MCPConnection } from '~/mcp/connection';
import type * as t from '~/mcp/types';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { detectOAuthRequirement } from '~/mcp/oauth';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { createMockConnection } from './mcpConnectionsMock.helper';

// Mock external dependencies
jest.mock('../../oauth/detectOAuth');
jest.mock('../../MCPConnectionFactory');

const mockDetectOAuthRequirement = detectOAuthRequirement as jest.MockedFunction<
  typeof detectOAuthRequirement
>;

describe('MCPServerInspector', () => {
  let mockConnection: jest.Mocked<MCPConnection>;

  beforeEach(() => {
    mockConnection = createMockConnection('test_server');
    jest.clearAllMocks();
  });

  describe('inspect()', () => {
    it('should process env and fetch all metadata for non-OAuth stdio server with serverInstructions=true', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: true,
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'instructions for test_server',
        requiresOAuth: false,
        capabilities:
          '{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"get":"getPrompts for test_server"}}',
        tools: 'listFiles',
        toolFunctions: {
          listFiles_mcp_test_server: expect.objectContaining({
            type: 'function',
            function: expect.objectContaining({
              name: 'listFiles_mcp_test_server',
            }),
          }),
        },
        initDuration: expect.any(Number),
      });
    });

    it('should detect OAuth and skip capabilities fetch for streamable-http server', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp',
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: true,
        method: 'protected-resource-metadata',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'streamable-http',
        url: 'https://api.example.com/mcp',
        requiresOAuth: true,
        oauthMetadata: undefined,
        initDuration: expect.any(Number),
      });
    });

    it('should skip capabilities fetch when startup=false', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        startup: false,
      };

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        startup: false,
        requiresOAuth: false,
        initDuration: expect.any(Number),
      });
    });

    it('should keep custom serverInstructions string and not fetch from server', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'Custom instructions here',
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'Custom instructions here',
        requiresOAuth: false,
        capabilities:
          '{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"get":"getPrompts for test_server"}}',
        tools: 'listFiles',
        toolFunctions: expect.any(Object),
        initDuration: expect.any(Number),
      });
    });

    it('should handle serverInstructions as string "true" and fetch from server', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'true', // String "true" from YAML
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'instructions for test_server',
        requiresOAuth: false,
        capabilities:
          '{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"get":"getPrompts for test_server"}}',
        tools: 'listFiles',
        toolFunctions: expect.any(Object),
        initDuration: expect.any(Number),
      });
    });

    it('should handle predefined requiresOAuth without detection', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        requiresOAuth: true,
      };

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'sse',
        url: 'https://api.example.com/sse',
        requiresOAuth: true,
        initDuration: expect.any(Number),
      });
    });

    it('should set requiresOAuth to false when apiKey.source is admin', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'my-api-key',
        },
      };

      // OAuth detection should be skipped
      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: true, // This would be returned if called, but it shouldn't be
        method: 'protected-resource-metadata',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      // Should NOT call OAuth detection
      expect(mockDetectOAuthRequirement).not.toHaveBeenCalled();

      // requiresOAuth should be false due to admin-provided API key
      expect(result.requiresOAuth).toBe(false);
      expect(result.apiKey?.source).toBe('admin');
    });

    it('should still detect OAuth when apiKey.source is user', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'sse',
        url: 'https://api.example.com/sse',
        apiKey: {
          source: 'user',
          authorization_type: 'bearer',
        },
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: true,
        method: 'protected-resource-metadata',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      // Should call OAuth detection for user-provided API key
      expect(mockDetectOAuthRequirement).toHaveBeenCalled();
      expect(result.requiresOAuth).toBe(true);
    });

    it('should fetch capabilities when server has no tools', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      // Mock server with no tools
      mockConnection.client.listTools = jest.fn().mockResolvedValue({ tools: [] });

      const result = await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        requiresOAuth: false,
        capabilities:
          '{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"get":"getPrompts for test_server"}}',
        tools: '',
        toolFunctions: {},
        initDuration: expect.any(Number),
      });
    });

    it('should create temporary connection when no connection is provided', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: true,
      };

      const tempMockConnection = createMockConnection('test_server');
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(tempMockConnection);

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      const result = await MCPServerInspector.inspect('test_server', rawConfig);

      // Verify factory was called to create connection
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith({
        serverName: 'test_server',
        serverConfig: expect.objectContaining({ type: 'stdio', command: 'node' }),
      });

      // Verify temporary connection was disconnected
      expect(tempMockConnection.disconnect).toHaveBeenCalled();

      // Verify result is correct
      expect(result).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: 'instructions for test_server',
        requiresOAuth: false,
        capabilities:
          '{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"get":"getPrompts for test_server"}}',
        tools: 'listFiles',
        toolFunctions: expect.any(Object),
        initDuration: expect.any(Number),
      });
    });

    it('should not create temporary connection when connection is provided', async () => {
      const rawConfig: t.MCPOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        serverInstructions: true,
      };

      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: false,
        method: 'no-metadata-found',
      });

      await MCPServerInspector.inspect('test_server', rawConfig, mockConnection);

      // Verify factory was NOT called
      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();

      // Verify provided connection was NOT disconnected
      expect(mockConnection.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('getToolFunctions()', () => {
    it('should convert MCP tools to LibreChat tool functions format', async () => {
      mockConnection.client.listTools = jest.fn().mockResolvedValue({
        tools: [
          {
            name: 'file_read',
            description: 'Read a file',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'file_write',
            description: 'Write a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        ],
      });

      const result = await MCPServerInspector.getToolFunctions('my_server', mockConnection);

      expect(result).toEqual({
        file_read_mcp_my_server: {
          type: 'function',
          function: {
            name: 'file_read_mcp_my_server',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
        },
        file_write_mcp_my_server: {
          type: 'function',
          function: {
            name: 'file_write_mcp_my_server',
            description: 'Write a file',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      });
    });

    it('should handle empty tools list', async () => {
      mockConnection.client.listTools = jest.fn().mockResolvedValue({ tools: [] });

      const result = await MCPServerInspector.getToolFunctions('my_server', mockConnection);

      expect(result).toEqual({});
    });
  });
});
