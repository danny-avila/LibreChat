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
}));

jest.mock('~/server/services/ToolService', () => ({
  getToolkitKey: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    loadManifestTools: jest.fn().mockResolvedValue([]),
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

jest.mock('@librechat/api', () => ({
  getToolkitKey: jest.fn(),
  checkPluginAuth: jest.fn(),
  filterUniquePlugins: jest.fn(),
  convertMCPToolsToPlugins: jest.fn(),
}));

// Import the actual module with the function we want to test
const { getAvailableTools, getAvailablePluginsController } = require('./PluginController');
const {
  filterUniquePlugins,
  checkPluginAuth,
  convertMCPToolsToPlugins,
  getToolkitKey,
} = require('@librechat/api');

describe('PluginController', () => {
  let mockReq, mockRes, mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { user: { id: 'test-user-id' } };
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockCache = { get: jest.fn(), set: jest.fn() };
    getLogStores.mockReturnValue(mockCache);
  });

  describe('getAvailablePluginsController', () => {
    beforeEach(() => {
      mockReq.app = { locals: { filteredTools: [], includedTools: [] } };
    });

    it('should use filterUniquePlugins to remove duplicate plugins', async () => {
      const mockPlugins = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second' },
      ];

      mockCache.get.mockResolvedValue(null);
      filterUniquePlugins.mockReturnValue(mockPlugins);
      checkPluginAuth.mockReturnValue(true);

      await getAvailablePluginsController(mockReq, mockRes);

      expect(filterUniquePlugins).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      // The response includes authenticated: true for each plugin when checkPluginAuth returns true
      expect(mockRes.json).toHaveBeenCalledWith([
        { name: 'Plugin1', pluginKey: 'key1', description: 'First', authenticated: true },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second', authenticated: true },
      ]);
    });

    it('should use checkPluginAuth to verify plugin authentication', async () => {
      const mockPlugin = { name: 'Plugin1', pluginKey: 'key1', description: 'First' };

      mockCache.get.mockResolvedValue(null);
      filterUniquePlugins.mockReturnValue([mockPlugin]);
      checkPluginAuth.mockReturnValueOnce(true);

      await getAvailablePluginsController(mockReq, mockRes);

      expect(checkPluginAuth).toHaveBeenCalledWith(mockPlugin);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData[0].authenticated).toBe(true);
    });

    it('should return cached plugins when available', async () => {
      const cachedPlugins = [
        { name: 'CachedPlugin', pluginKey: 'cached', description: 'Cached plugin' },
      ];

      mockCache.get.mockResolvedValue(cachedPlugins);

      await getAvailablePluginsController(mockReq, mockRes);

      expect(filterUniquePlugins).not.toHaveBeenCalled();
      expect(checkPluginAuth).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(cachedPlugins);
    });

    it('should filter plugins based on includedTools', async () => {
      const mockPlugins = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second' },
      ];

      mockReq.app.locals.includedTools = ['key1'];
      mockCache.get.mockResolvedValue(null);
      filterUniquePlugins.mockReturnValue(mockPlugins);
      checkPluginAuth.mockReturnValue(false);

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
          function: { name: 'tool1', description: 'Tool 1' },
        },
      };
      const mockConvertedPlugins = [
        {
          name: 'tool1',
          pluginKey: `tool1${Constants.mcp_delimiter}server1`,
          description: 'Tool 1',
        },
      ];

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce(mockUserTools);
      convertMCPToolsToPlugins.mockReturnValue(mockConvertedPlugins);
      filterUniquePlugins.mockImplementation((plugins) => plugins);
      getCustomConfig.mockResolvedValue(null);

      await getAvailableTools(mockReq, mockRes);

      expect(convertMCPToolsToPlugins).toHaveBeenCalledWith({
        functionTools: mockUserTools,
        customConfig: null,
      });
    });

    it('should use filterUniquePlugins to deduplicate combined tools', async () => {
      const mockUserPlugins = [
        { name: 'UserTool', pluginKey: 'user-tool', description: 'User tool' },
      ];
      const mockManifestPlugins = [
        { name: 'ManifestTool', pluginKey: 'manifest-tool', description: 'Manifest tool' },
      ];

      mockCache.get.mockResolvedValue(mockManifestPlugins);
      getCachedTools.mockResolvedValueOnce({});
      convertMCPToolsToPlugins.mockReturnValue(mockUserPlugins);
      filterUniquePlugins.mockReturnValue([...mockUserPlugins, ...mockManifestPlugins]);
      getCustomConfig.mockResolvedValue(null);

      await getAvailableTools(mockReq, mockRes);

      // Should be called to deduplicate the combined array
      expect(filterUniquePlugins).toHaveBeenLastCalledWith([
        ...mockUserPlugins,
        ...mockManifestPlugins,
      ]);
    });

    it('should use checkPluginAuth to verify authentication status', async () => {
      const mockPlugin = { name: 'Tool1', pluginKey: 'tool1', description: 'Tool 1' };

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue({});
      convertMCPToolsToPlugins.mockReturnValue([]);
      filterUniquePlugins.mockReturnValue([mockPlugin]);
      checkPluginAuth.mockReturnValue(true);
      getCustomConfig.mockResolvedValue(null);

      // Mock getCachedTools second call to return tool definitions
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce({ tool1: true });

      await getAvailableTools(mockReq, mockRes);

      expect(checkPluginAuth).toHaveBeenCalledWith(mockPlugin);
    });

    it('should use getToolkitKey for toolkit validation', async () => {
      const mockToolkit = {
        name: 'Toolkit1',
        pluginKey: 'toolkit1',
        description: 'Toolkit 1',
        toolkit: true,
      };

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue({});
      convertMCPToolsToPlugins.mockReturnValue([]);
      filterUniquePlugins.mockReturnValue([mockToolkit]);
      checkPluginAuth.mockReturnValue(false);
      getToolkitKey.mockReturnValue('toolkit1');
      getCustomConfig.mockResolvedValue(null);

      // Mock getCachedTools second call to return tool definitions
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce({
        toolkit1_function: true,
      });

      await getAvailableTools(mockReq, mockRes);

      expect(getToolkitKey).toHaveBeenCalled();
    });
  });

  describe('plugin.icon behavior', () => {
    const callGetAvailableToolsWithMCPServer = async (mcpServers) => {
      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue({ mcpServers });

      const functionTools = {
        [`test-tool${Constants.mcp_delimiter}test-server`]: {
          function: { name: 'test-tool', description: 'A test tool' },
        },
      };

      const mockConvertedPlugin = {
        name: 'test-tool',
        pluginKey: `test-tool${Constants.mcp_delimiter}test-server`,
        description: 'A test tool',
        icon: mcpServers['test-server']?.iconPath,
        authenticated: true,
        authConfig: [],
      };

      getCachedTools.mockResolvedValueOnce(functionTools);
      convertMCPToolsToPlugins.mockReturnValue([mockConvertedPlugin]);
      filterUniquePlugins.mockImplementation((plugins) => plugins);
      checkPluginAuth.mockReturnValue(true);
      getToolkitKey.mockReturnValue(undefined);

      getCachedTools.mockResolvedValueOnce({
        [`test-tool${Constants.mcp_delimiter}test-server`]: true,
      });

      await getAvailableTools(mockReq, mockRes);
      const responseData = mockRes.json.mock.calls[0][0];
      return responseData.find((tool) => tool.name === 'test-tool');
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

      // We need to test the actual flow where MCP manager tools are included
      const mcpManagerTools = [
        {
          name: 'tool1',
          pluginKey: `tool1${Constants.mcp_delimiter}test-server`,
          description: 'Tool 1',
          authenticated: true,
        },
      ];

      // Mock the MCP manager to return tools
      const mockMCPManager = {
        loadManifestTools: jest.fn().mockResolvedValue(mcpManagerTools),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue(customConfig);

      // First call returns user tools (empty in this case)
      getCachedTools.mockResolvedValueOnce({});

      // Mock convertMCPToolsToPlugins to return empty array for user tools
      convertMCPToolsToPlugins.mockReturnValue([]);

      // Mock filterUniquePlugins to pass through
      filterUniquePlugins.mockImplementation((plugins) => plugins || []);

      // Mock checkPluginAuth
      checkPluginAuth.mockReturnValue(true);

      // Second call returns tool definitions
      getCachedTools.mockResolvedValueOnce({
        [`tool1${Constants.mcp_delimiter}test-server`]: true,
      });

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
      convertMCPToolsToPlugins.mockReturnValue(undefined);
      filterUniquePlugins.mockImplementation((plugins) => plugins || []);
      getCustomConfig.mockResolvedValue(null);

      await getAvailableTools(mockReq, mockRes);

      expect(convertMCPToolsToPlugins).toHaveBeenCalledWith({
        functionTools: null,
        customConfig: null,
      });
    });

    it('should handle when getCachedTools returns undefined', async () => {
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue(undefined);
      convertMCPToolsToPlugins.mockReturnValue(undefined);
      filterUniquePlugins.mockImplementation((plugins) => plugins || []);
      getCustomConfig.mockResolvedValue(null);
      checkPluginAuth.mockReturnValue(false);

      // Mock getCachedTools to return undefined for both calls
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      await getAvailableTools(mockReq, mockRes);

      expect(convertMCPToolsToPlugins).toHaveBeenCalledWith({
        functionTools: undefined,
        customConfig: null,
      });
    });

    it('should handle cachedToolsArray and userPlugins both being defined', async () => {
      const cachedTools = [{ name: 'CachedTool', pluginKey: 'cached-tool', description: 'Cached' }];
      const userTools = {
        'user-tool': { function: { name: 'user-tool', description: 'User tool' } },
      };
      const userPlugins = [{ name: 'UserTool', pluginKey: 'user-tool', description: 'User tool' }];

      mockCache.get.mockResolvedValue(cachedTools);
      getCachedTools.mockResolvedValue(userTools);
      convertMCPToolsToPlugins.mockReturnValue(userPlugins);
      filterUniquePlugins.mockReturnValue([...userPlugins, ...cachedTools]);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([...userPlugins, ...cachedTools]);
    });

    it('should handle empty toolDefinitions object', async () => {
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce({});
      convertMCPToolsToPlugins.mockReturnValue([]);
      filterUniquePlugins.mockImplementation((plugins) => plugins || []);
      getCustomConfig.mockResolvedValue(null);
      checkPluginAuth.mockReturnValue(true);

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

      const mockPlugin = {
        name: 'tool1',
        pluginKey: `tool1${Constants.mcp_delimiter}test-server`,
        description: 'Tool 1',
        authenticated: true,
        authConfig: [],
      };

      convertMCPToolsToPlugins.mockReturnValue([mockPlugin]);
      filterUniquePlugins.mockImplementation((plugins) => plugins);
      checkPluginAuth.mockReturnValue(true);

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
      filterUniquePlugins.mockReturnValue([]);
      checkPluginAuth.mockReturnValue(false);

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

      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValue({});
      convertMCPToolsToPlugins.mockReturnValue([]);
      filterUniquePlugins.mockReturnValue([mockToolkit]);
      checkPluginAuth.mockReturnValue(false);
      getToolkitKey.mockReturnValue(undefined);
      getCustomConfig.mockResolvedValue(null);

      // Mock getCachedTools second call to return null
      getCachedTools.mockResolvedValueOnce({}).mockResolvedValueOnce(null);

      await getAvailableTools(mockReq, mockRes);

      // Should handle null toolDefinitions gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
