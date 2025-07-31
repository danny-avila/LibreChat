import type { PluginAuthMethods } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import { getPluginAuthMap } from '~/agents/auth';
import { getUserMCPAuthMap } from './auth';

jest.mock('~/agents/auth', () => ({
  getPluginAuthMap: jest.fn(),
}));

const mockGetPluginAuthMap = getPluginAuthMap as jest.MockedFunction<typeof getPluginAuthMap>;

const createMockTool = (
  name: string,
  mcpRawServerName?: string,
  mcp = true,
): GenericTool & { mcpRawServerName?: string; mcp?: boolean } =>
  ({
    name,
    mcpRawServerName,
    mcp,
    description: 'Mock tool',
  }) as GenericTool & { mcpRawServerName?: string; mcp?: boolean };

const mockFindPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'] = jest.fn();

describe('getUserMCPAuthMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Core Functionality', () => {
    it('should handle server names with various special characters and spaces', async () => {
      const testCases = [
        {
          originalName: 'Connector: Company',
          normalizedToolName: 'tool_mcp_Connector__Company',
        },
        {
          originalName: 'Server (Production) @ Company.com',
          normalizedToolName: 'tool_mcp_Server__Production____Company.com',
        },
        {
          originalName: '🌟 Testing Server™ (α-β) 测试服务器',
          normalizedToolName: 'tool_mcp_____Testing_Server_________',
        },
      ];

      const tools = testCases.map((testCase) =>
        createMockTool(testCase.normalizedToolName, testCase.originalName),
      );

      const expectedKeys = testCases.map((tc) => `mcp_${tc.originalName}`);
      mockGetPluginAuthMap.mockResolvedValue({});

      await getUserMCPAuthMap({
        userId: 'user123',
        tools,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(mockGetPluginAuthMap).toHaveBeenCalledWith({
        userId: 'user123',
        pluginKeys: expectedKeys,
        throwError: false,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should return empty object when no tools have mcpRawServerName', async () => {
      const tools = [
        createMockTool('regular_tool', undefined, false),
        createMockTool('another_tool', undefined, false),
        createMockTool('test_mcp_Server_no_raw_name', undefined),
      ];

      const result = await getUserMCPAuthMap({
        userId: 'user123',
        tools,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(result).toEqual({});
      expect(mockGetPluginAuthMap).not.toHaveBeenCalled();
    });

    it('should handle empty or undefined tools array', async () => {
      let result = await getUserMCPAuthMap({
        userId: 'user123',
        tools: [],
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });
      expect(result).toEqual({});
      expect(mockGetPluginAuthMap).not.toHaveBeenCalled();

      result = await getUserMCPAuthMap({
        userId: 'user123',
        tools: undefined,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });
      expect(result).toEqual({});
      expect(mockGetPluginAuthMap).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const tools = [createMockTool('test_mcp_Server1', 'Server1')];
      const dbError = new Error('Database connection failed');

      mockGetPluginAuthMap.mockRejectedValue(dbError);

      const result = await getUserMCPAuthMap({
        userId: 'user123',
        tools,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(result).toEqual({});
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const tools = [createMockTool('test_mcp_Server1', 'Server1')];

      mockGetPluginAuthMap.mockRejectedValue('String error');

      const result = await getUserMCPAuthMap({
        userId: 'user123',
        tools,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(result).toEqual({});
    });
  });

  describe('Integration', () => {
    it('should handle complete workflow with normalized tool names and original server names', async () => {
      const originalServerName = 'Connector: Company';
      const toolName = 'test_auth_mcp_Connector__Company';

      const tools = [createMockTool(toolName, originalServerName)];

      const mockCustomUserVars = {
        'mcp_Connector: Company': {
          API_KEY: 'test123',
          SECRET_TOKEN: 'secret456',
        },
      };

      mockGetPluginAuthMap.mockResolvedValue(mockCustomUserVars);

      const result = await getUserMCPAuthMap({
        userId: 'user123',
        tools,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(mockGetPluginAuthMap).toHaveBeenCalledWith({
        userId: 'user123',
        pluginKeys: ['mcp_Connector: Company'],
        throwError: false,
        findPluginAuthsByKeys: mockFindPluginAuthsByKeys,
      });

      expect(result).toEqual(mockCustomUserVars);
    });
  });
});
