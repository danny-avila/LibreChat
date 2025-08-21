const { Constants } = require('librechat-data-provider');
const { getCustomConfig, getCachedTools } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

// Mock the dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(),
  getCachedTools: jest.fn(),
  setCachedTools: jest.fn(),
  mergeUserTools: jest.fn(),
}));

jest.mock('~/server/services/ToolService', () => ({
  getToolkitKey: jest.fn(),
  loadAndFormatTools: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    loadAllManifestTools: jest.fn().mockResolvedValue([]),
  })),
  getFlowStateManager: jest.fn(),
}));

jest.mock('~/app/clients/tools', () => ({
  availableTools: [],
  toolkits: [],
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

const { getAvailableTools, getAvailablePluginsController } = require('./PluginController');
const { loadAndFormatTools } = require('~/server/services/ToolService');

describe('PluginController', () => {
  let mockReq, mockRes, mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { id: 'test-user-id' },
      app: {
        locals: {
          paths: { structuredTools: '/mock/path' },
          filteredTools: null,
          includedTools: null,
        },
      },
    };
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockCache = { get: jest.fn(), set: jest.fn() };
    getLogStores.mockReturnValue(mockCache);

    // Clear availableTools and toolkits arrays before each test
    require('~/app/clients/tools').availableTools.length = 0;
    require('~/app/clients/tools').toolkits.length = 0;
  });

  describe('getAvailablePluginsController', () => {
    beforeEach(() => {
      mockReq.app = { locals: { filteredTools: [], includedTools: [] } };
    });

    it('should use filterUniquePlugins to remove duplicate plugins', async () => {
      // Add plugins with duplicates to availableTools
      const mockPlugins = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First' },
        { name: 'Plugin1', pluginKey: 'key1', description: 'First duplicate' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second' },
      ];

      require('~/app/clients/tools').availableTools.push(...mockPlugins);

      mockCache.get.mockResolvedValue(null);

      await getAvailablePluginsController(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData).toHaveLength(2);
      expect(responseData[0].pluginKey).toBe('key1');
      expect(responseData[1].pluginKey).toBe('key2');
    });

    it('should use checkPluginAuth to verify plugin authentication', async () => {
      // checkPluginAuth returns false for plugins without authConfig
      // so authenticated property won't be added
      const mockPlugin = { name: 'Plugin1', pluginKey: 'key1', description: 'First' };

      require('~/app/clients/tools').availableTools.push(mockPlugin);
      mockCache.get.mockResolvedValue(null);

      await getAvailablePluginsController(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      // checkPluginAuth returns false, so authenticated property is not added
      expect(responseData[0].authenticated).toBeUndefined();
    });

    it('should return cached plugins when available', async () => {
      const cachedPlugins = [
        { name: 'CachedPlugin', pluginKey: 'cached', description: 'Cached plugin' },
      ];

      mockCache.get.mockResolvedValue(cachedPlugins);

      await getAvailablePluginsController(mockReq, mockRes);

      // When cache is hit, we return immediately without processing
      expect(mockRes.json).toHaveBeenCalledWith(cachedPlugins);
    });

    it('should filter plugins based on includedTools', async () => {
      const mockPlugins = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second' },
      ];

      require('~/app/clients/tools').availableTools.push(...mockPlugins);
      mockReq.app.locals.includedTools = ['key1'];
      mockCache.get.mockResolvedValue(null);

      await getAvailablePluginsController(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData).toHaveLength(1);
      expect(responseData[0].pluginKey).toBe('key1');
    });
  });

  describe('getAvailableTools', () => {
    it('should use convertMCPToolsToPlugins for user-specific MCP tools', async () => {
      const mockUserTools = {
        [`tool1${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: {
            name: `tool1${Constants.mcp_delimiter}server1`,
            description: 'Tool 1',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce(mockUserTools);
      getCustomConfig.mockResolvedValue(null);

      // Mock second call to return tool definitions
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      await getAvailableTools(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      // convertMCPToolsToPlugins should have converted the tool
      expect(responseData.length).toBeGreaterThan(0);
      const convertedTool = responseData.find(
        (tool) => tool.pluginKey === `tool1${Constants.mcp_delimiter}server1`,
      );
      expect(convertedTool).toBeDefined();
      expect(convertedTool.name).toBe('tool1');
    });

    it('should use filterUniquePlugins to deduplicate combined tools', async () => {
      const mockUserTools = {
        'user-tool': {
          type: 'function',
          function: {
            name: 'user-tool',
            description: 'User tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      const mockCachedPlugins = [
        { name: 'user-tool', pluginKey: 'user-tool', description: 'Duplicate user tool' },
        { name: 'ManifestTool', pluginKey: 'manifest-tool', description: 'Manifest tool' },
      ];

      mockCache.get.mockResolvedValue(mockCachedPlugins);
      getCachedTools.mockResolvedValueOnce(mockUserTools);
      getCustomConfig.mockResolvedValue(null);

      // Mock second call to return tool definitions
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      await getAvailableTools(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      // Should have deduplicated tools with same pluginKey
      const userToolCount = responseData.filter((tool) => tool.pluginKey === 'user-tool').length;
      expect(userToolCount).toBe(1);
    });

    it('should use checkPluginAuth to verify authentication status', async () => {
      // Add a plugin to availableTools that will be checked
      const mockPlugin = {
        name: 'Tool1',
        pluginKey: 'tool1',
        description: 'Tool 1',
        // No authConfig means checkPluginAuth returns false
      };

      require('~/app/clients/tools').availableTools.push(mockPlugin);

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(null);

      // Mock loadAndFormatTools to return tool definitions including our tool
      loadAndFormatTools.mockReturnValue({
        tool1: {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      });

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
      const tool = responseData.find((t) => t.pluginKey === 'tool1');
      expect(tool).toBeDefined();
      // checkPluginAuth returns false, so authenticated property is not added
      expect(tool.authenticated).toBeUndefined();
    });

    it('should use getToolkitKey for toolkit validation', async () => {
      const mockToolkit = {
        name: 'Toolkit1',
        pluginKey: 'toolkit1',
        description: 'Toolkit 1',
        toolkit: true,
      };

      require('~/app/clients/tools').availableTools.push(mockToolkit);

      // Mock toolkits to have a mapping
      require('~/app/clients/tools').toolkits.push({
        name: 'Toolkit1',
        pluginKey: 'toolkit1',
        tools: ['toolkit1_function'],
      });

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(null);

      // Mock loadAndFormatTools to return tool definitions
      loadAndFormatTools.mockReturnValue({
        toolkit1_function: {
          type: 'function',
          function: {
            name: 'toolkit1_function',
            description: 'Toolkit function',
            parameters: {},
          },
        },
      });

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
      const toolkit = responseData.find((t) => t.pluginKey === 'toolkit1');
      expect(toolkit).toBeDefined();
    });
  });

  describe('plugin.icon behavior', () => {
    const callGetAvailableToolsWithMCPServer = async (mcpServers) => {
      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue({ mcpServers });

      const functionTools = {
        [`test-tool${Constants.mcp_delimiter}test-server`]: {
          type: 'function',
          function: {
            name: `test-tool${Constants.mcp_delimiter}test-server`,
            description: 'A test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      // Mock the MCP manager to return tools
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue(functionTools),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      getCachedTools.mockResolvedValueOnce({});

      // Mock loadAndFormatTools to return empty object since these are MCP tools
      loadAndFormatTools.mockReturnValue({});

      getCachedTools.mockResolvedValueOnce(functionTools);

      await getAvailableTools(mockReq, mockRes);
      const responseData = mockRes.json.mock.calls[0][0];
      return responseData.find(
        (tool) => tool.pluginKey === `test-tool${Constants.mcp_delimiter}test-server`,
      );
    };

    it('should set plugin.icon when iconPath is defined', async () => {
      const mcpServers = {
        'test-server': {
          iconPath: '/path/to/icon.png',
        },
      };
      const testTool = await callGetAvailableToolsWithMCPServer(mcpServers);
      expect(testTool.icon).toBe('/path/to/icon.png');
    });

    it('should set plugin.icon to undefined when iconPath is not defined', async () => {
      const mcpServers = {
        'test-server': {},
      };
      const testTool = await callGetAvailableToolsWithMCPServer(mcpServers);
      expect(testTool.icon).toBeUndefined();
    });
  });

  describe('helper function integration', () => {
    it('should properly handle MCP tools with custom user variables', async () => {
      const customConfig = {
        mcpServers: {
          'test-server': {
            customUserVars: {
              API_KEY: { title: 'API Key', description: 'Your API key' },
            },
          },
        },
      };

      // Mock MCP tools returned by getAllToolFunctions
      const mcpToolFunctions = {
        [`tool1${Constants.mcp_delimiter}test-server`]: {
          type: 'function',
          function: {
            name: `tool1${Constants.mcp_delimiter}test-server`,
            description: 'Tool 1',
            parameters: {},
          },
        },
      };

      // Mock the MCP manager to return tools
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue(mcpToolFunctions),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(customConfig);

      // First call returns user tools (empty in this case)
      getCachedTools.mockResolvedValueOnce({});

      // Mock loadAndFormatTools to return empty object for MCP tools
      loadAndFormatTools.mockReturnValue({});

      // Second call returns tool definitions including our MCP tool
      getCachedTools.mockResolvedValueOnce(mcpToolFunctions);

      await getAvailableTools(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];

      // Find the MCP tool in the response
      const mcpTool = responseData.find(
        (tool) => tool.pluginKey === `tool1${Constants.mcp_delimiter}test-server`,
      );

      // The actual implementation adds authConfig and sets authenticated to false when customUserVars exist
      expect(mcpTool).toBeDefined();
      expect(mcpTool.authConfig).toEqual([
        { authField: 'API_KEY', label: 'API Key', description: 'Your API key' },
      ]);
      expect(mcpTool.authenticated).toBe(false);
    });

    it('should handle error cases gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Cache error' });
    });
  });

  describe('edge cases with undefined/null values', () => {
    it('should handle undefined cache gracefully', async () => {
      getLogStores.mockReturnValue(undefined);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle null cachedTools and cachedUserTools', async () => {
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(null);

      // Mock loadAndFormatTools to return empty object when getCachedTools returns null
      loadAndFormatTools.mockReturnValue({});

      await getAvailableTools(mockReq, mockRes);

      // Should handle null values gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle when getCachedTools returns undefined', async () => {
      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(null);

      // Mock loadAndFormatTools to return empty object when getCachedTools returns undefined
      loadAndFormatTools.mockReturnValue({});

      // Mock getCachedTools to return undefined for both calls
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      await getAvailableTools(mockReq, mockRes);

      // Should handle undefined values gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle cachedToolsArray and userPlugins both being defined', async () => {
      const cachedTools = [{ name: 'CachedTool', pluginKey: 'cached-tool', description: 'Cached' }];
      // Use MCP delimiter for the user tool so convertMCPToolsToPlugins works
      const userTools = {
        [`user-tool${Constants.mcp_delimiter}server1`]: {
          type: 'function',
          function: {
            name: `user-tool${Constants.mcp_delimiter}server1`,
            description: 'User tool',
            parameters: {},
          },
        },
      };

      mockCache.get.mockResolvedValue(cachedTools);
      getCachedTools.mockResolvedValue(userTools);
      getCustomConfig.mockResolvedValue(null);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      // Should have both cached and user tools
      expect(responseData.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty toolDefinitions object', async () => {
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce({});
      getCustomConfig.mockResolvedValue(null);

      await getAvailableTools(mockReq, mockRes);

      // With empty tool definitions, no tools should be in the final output
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle MCP tools without customUserVars', async () => {
      const customConfig = {
        mcpServers: {
          'test-server': {
            // No customUserVars defined
          },
        },
      };

      const mockUserTools = {
        [`tool1${Constants.mcp_delimiter}test-server`]: {
          function: { name: 'tool1', description: 'Tool 1' },
        },
      };

      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(customConfig);
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      getCachedTools.mockResolvedValueOnce({
        [`tool1${Constants.mcp_delimiter}test-server`]: true,
      });

      await getAvailableTools(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData[0].authenticated).toBe(true);
      // The actual implementation doesn't set authConfig on tools without customUserVars
      expect(responseData[0].authConfig).toEqual([]);
    });

    it('should handle req.app.locals with undefined filteredTools and includedTools', async () => {
      mockReq.app = { locals: {} };
      mockCache.get.mockResolvedValue(null);

      await getAvailablePluginsController(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle toolkit with undefined toolDefinitions keys', async () => {
      const mockToolkit = {
        name: 'Toolkit1',
        pluginKey: 'toolkit1',
        description: 'Toolkit 1',
        toolkit: true,
      };

      // Ensure req.app.locals is properly mocked
      mockReq.app = {
        locals: {
          filteredTools: [],
          includedTools: [],
          paths: { structuredTools: '/mock/path' },
        },
      };

      // Add the toolkit to availableTools
      require('~/app/clients/tools').availableTools.push(mockToolkit);

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue({});
      getCustomConfig.mockResolvedValue(null);

      // Mock loadAndFormatTools to return an empty object when toolDefinitions is null
      loadAndFormatTools.mockReturnValue({});

      // Mock getCachedTools second call to return null
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce(null);

      await getAvailableTools(mockReq, mockRes);

      // Should handle null toolDefinitions gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
