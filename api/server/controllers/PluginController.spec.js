const { Constants } = require('librechat-data-provider');
const { getCachedTools, getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn(),
  getAppConfig: jest.fn().mockResolvedValue({
    filteredTools: [],
    includedTools: [],
  }),
  setCachedTools: jest.fn(),
  mergeUserTools: jest.fn(),
}));

// loadAndFormatTools mock removed - no longer used in PluginController

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({
    getAllToolFunctions: jest.fn().mockResolvedValue({}),
    getRawConfig: jest.fn().mockReturnValue({}),
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

describe('PluginController', () => {
  let mockReq, mockRes, mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { id: 'test-user-id' },
      config: {
        filteredTools: [],
        includedTools: [],
      },
    };
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockCache = { get: jest.fn(), set: jest.fn() };
    getLogStores.mockReturnValue(mockCache);

    // Clear availableTools and toolkits arrays before each test
    require('~/app/clients/tools').availableTools.length = 0;
    require('~/app/clients/tools').toolkits.length = 0;

    // Reset getCachedTools mock to ensure clean state
    getCachedTools.mockReset();

    // Reset getAppConfig mock to ensure clean state with default values
    getAppConfig.mockReset();
    getAppConfig.mockResolvedValue({
      filteredTools: [],
      includedTools: [],
    });
  });

  describe('getAvailablePluginsController', () => {
    it('should use filterUniquePlugins to remove duplicate plugins', async () => {
      // Add plugins with duplicates to availableTools
      const mockPlugins = [
        { name: 'Plugin1', pluginKey: 'key1', description: 'First' },
        { name: 'Plugin1', pluginKey: 'key1', description: 'First duplicate' },
        { name: 'Plugin2', pluginKey: 'key2', description: 'Second' },
      ];

      require('~/app/clients/tools').availableTools.push(...mockPlugins);

      mockCache.get.mockResolvedValue(null);

      // Configure getAppConfig to return the expected config
      getAppConfig.mockResolvedValueOnce({
        filteredTools: [],
        includedTools: [],
      });

      await getAvailablePluginsController(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      // The real filterUniquePlugins should have removed the duplicate
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

      // Configure getAppConfig to return the expected config
      getAppConfig.mockResolvedValueOnce({
        filteredTools: [],
        includedTools: [],
      });

      await getAvailablePluginsController(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0];
      // The real checkPluginAuth returns false for plugins without authConfig, so authenticated property is not added
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
      mockCache.get.mockResolvedValue(null);

      // Configure getAppConfig to return config with includedTools
      getAppConfig.mockResolvedValueOnce({
        filteredTools: [],
        includedTools: ['key1'],
      });

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
      mockReq.config = {
        mcpConfig: {
          server1: {},
        },
        paths: { structuredTools: '/mock/path' },
      };

      // Mock MCP manager to return empty tools initially (since getAllToolFunctions is called)
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue({}),
        getRawConfig: jest.fn().mockReturnValue({}),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      // Mock second call to return tool definitions (includeGlobal: true)
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData).toBeDefined();
      expect(Array.isArray(responseData)).toBe(true);
      expect(responseData.length).toBeGreaterThan(0);
      const convertedTool = responseData.find(
        (tool) => tool.pluginKey === `tool1${Constants.mcp_delimiter}server1`,
      );
      expect(convertedTool).toBeDefined();
      // The real convertMCPToolsToPlugins extracts the name from the delimiter
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
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Mock second call to return tool definitions
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
      // The real filterUniquePlugins should have deduplicated tools with same pluginKey
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
      // First call returns null for user tools
      getCachedTools.mockResolvedValueOnce(null);
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Second call (with includeGlobal: true) returns the tool definitions
      getCachedTools.mockResolvedValueOnce({
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
      // The real checkPluginAuth returns false for plugins without authConfig, so authenticated property is not added
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
      // First call returns null for user tools
      getCachedTools.mockResolvedValueOnce(null);
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Second call (with includeGlobal: true) returns the tool definitions
      getCachedTools.mockResolvedValueOnce({
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
    const callGetAvailableToolsWithMCPServer = async (serverConfig) => {
      mockCache.get.mockResolvedValue(null);

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

      // Mock the MCP manager to return tools and server config
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue(functionTools),
        getRawConfig: jest.fn().mockReturnValue(serverConfig),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      // First call returns empty user tools
      getCachedTools.mockResolvedValueOnce({});

      // Mock getAppConfig to return the mcpConfig
      mockReq.config = {
        mcpConfig: {
          'test-server': serverConfig,
        },
      };

      // Second call (with includeGlobal: true) returns the tool definitions
      getCachedTools.mockResolvedValueOnce(functionTools);

      await getAvailableTools(mockReq, mockRes);
      const responseData = mockRes.json.mock.calls[0][0];
      return responseData.find(
        (tool) => tool.pluginKey === `test-tool${Constants.mcp_delimiter}test-server`,
      );
    };

    it('should set plugin.icon when iconPath is defined', async () => {
      const serverConfig = {
        iconPath: '/path/to/icon.png',
      };
      const testTool = await callGetAvailableToolsWithMCPServer(serverConfig);
      expect(testTool.icon).toBe('/path/to/icon.png');
    });

    it('should set plugin.icon to undefined when iconPath is not defined', async () => {
      const serverConfig = {};
      const testTool = await callGetAvailableToolsWithMCPServer(serverConfig);
      expect(testTool.icon).toBeUndefined();
    });
  });

  describe('helper function integration', () => {
    it('should properly handle MCP tools with custom user variables', async () => {
      const appConfig = {
        mcpConfig: {
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
        getRawConfig: jest.fn().mockReturnValue({
          customUserVars: {
            API_KEY: { title: 'API Key', description: 'Your API key' },
          },
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      mockCache.get.mockResolvedValue(null);
      mockReq.config = appConfig;

      // First call returns user tools (empty in this case)
      getCachedTools.mockResolvedValueOnce({});

      // Second call (with includeGlobal: true) returns tool definitions including our MCP tool
      getCachedTools.mockResolvedValueOnce(mcpToolFunctions);

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);

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
      // First call returns null for user tools
      getCachedTools.mockResolvedValueOnce(null);
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Mock MCP manager to return no tools
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue({}),
        getRawConfig: jest.fn().mockReturnValue({}),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      // Second call (with includeGlobal: true) returns empty object instead of null
      getCachedTools.mockResolvedValueOnce({});

      await getAvailableTools(mockReq, mockRes);

      // Should handle null values gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle when getCachedTools returns undefined', async () => {
      mockCache.get.mockResolvedValue(null);
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Mock getCachedTools to return undefined for both calls
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      await getAvailableTools(mockReq, mockRes);

      // Should handle undefined values gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle `cachedToolsArray` and `mcpPlugins` both being defined', async () => {
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
      getCachedTools.mockResolvedValueOnce(userTools);
      mockReq.config = {
        mcpConfig: {
          server1: {},
        },
        paths: { structuredTools: '/mock/path' },
      };

      // Mock MCP manager to return empty tools initially
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue({}),
        getRawConfig: jest.fn().mockReturnValue({}),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      // The controller expects a second call to getCachedTools
      getCachedTools.mockResolvedValueOnce({
        'cached-tool': { type: 'function', function: { name: 'cached-tool' } },
        [`user-tool${Constants.mcp_delimiter}server1`]:
          userTools[`user-tool${Constants.mcp_delimiter}server1`],
      });

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      // Should have both cached and user tools
      expect(responseData.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty toolDefinitions object', async () => {
      mockCache.get.mockResolvedValue(null);
      // Reset getCachedTools to ensure clean state
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValue({});
      mockReq.config = {}; // No mcpConfig at all

      // Ensure no plugins are available
      require('~/app/clients/tools').availableTools.length = 0;

      // Reset MCP manager to default state
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue({}),
        getRawConfig: jest.fn().mockReturnValue({}),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      await getAvailableTools(mockReq, mockRes);

      // With empty tool definitions, no tools should be in the final output
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle MCP tools without customUserVars', async () => {
      const appConfig = {
        mcpConfig: {
          'test-server': {
            // No customUserVars defined
          },
        },
      };

      const mockUserTools = {
        [`tool1${Constants.mcp_delimiter}test-server`]: {
          type: 'function',
          function: {
            name: `tool1${Constants.mcp_delimiter}test-server`,
            description: 'Tool 1',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      // Mock the MCP manager to return the tools
      const mockMCPManager = {
        getAllToolFunctions: jest.fn().mockResolvedValue(mockUserTools),
        getRawConfig: jest.fn().mockReturnValue({
          // No customUserVars defined
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMCPManager);

      mockCache.get.mockResolvedValue(null);
      mockReq.config = appConfig;
      // First call returns empty user tools
      getCachedTools.mockResolvedValueOnce({});

      // Second call (with includeGlobal: true) returns the tool definitions
      getCachedTools.mockResolvedValueOnce(mockUserTools);

      // Ensure no plugins in availableTools for clean test
      require('~/app/clients/tools').availableTools.length = 0;

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
      expect(responseData.length).toBeGreaterThan(0);

      const mcpTool = responseData.find(
        (tool) => tool.pluginKey === `tool1${Constants.mcp_delimiter}test-server`,
      );

      expect(mcpTool).toBeDefined();
      expect(mcpTool.authenticated).toBe(true);
      // The actual implementation sets authConfig to empty array when no customUserVars
      expect(mcpTool.authConfig).toEqual([]);
    });

    it('should handle undefined filteredTools and includedTools', async () => {
      mockReq.config = {};
      mockCache.get.mockResolvedValue(null);

      // Configure getAppConfig to return config with undefined properties
      // The controller will use default values [] for filteredTools and includedTools
      getAppConfig.mockResolvedValueOnce({});

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

      // No need to mock app.locals anymore as it's not used

      // Add the toolkit to availableTools
      require('~/app/clients/tools').availableTools.push(mockToolkit);

      mockCache.get.mockResolvedValue(null);
      // First call returns empty object
      getCachedTools.mockResolvedValueOnce({});
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // Second call (with includeGlobal: true) returns empty object to avoid null reference error
      getCachedTools.mockResolvedValueOnce({});

      await getAvailableTools(mockReq, mockRes);

      // Should handle null toolDefinitions gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle undefined toolDefinitions when checking isToolDefined (traversaal_search bug)', async () => {
      // This test reproduces the bug where toolDefinitions is undefined
      // and accessing toolDefinitions[plugin.pluginKey] causes a TypeError
      const mockPlugin = {
        name: 'Traversaal Search',
        pluginKey: 'traversaal_search',
        description: 'Search plugin',
      };

      // Add the plugin to availableTools
      require('~/app/clients/tools').availableTools.push(mockPlugin);

      mockCache.get.mockResolvedValue(null);

      // First call returns null for user tools
      getCachedTools.mockResolvedValueOnce(null);

      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // CRITICAL: Second call (with includeGlobal: true) returns undefined
      // This is what causes the bug when trying to access toolDefinitions[plugin.pluginKey]
      getCachedTools.mockResolvedValueOnce(undefined);

      // This should not throw an error with the optional chaining fix
      await getAvailableTools(mockReq, mockRes);

      // Should handle undefined toolDefinitions gracefully and return empty array
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should re-initialize tools from appConfig when cache returns null', async () => {
      // Setup: Initial state with tools in appConfig
      const mockAppTools = {
        tool1: {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
        tool2: {
          type: 'function',
          function: {
            name: 'tool2',
            description: 'Tool 2',
            parameters: {},
          },
        },
      };

      // Add matching plugins to availableTools
      require('~/app/clients/tools').availableTools.push(
        { name: 'Tool 1', pluginKey: 'tool1', description: 'Tool 1' },
        { name: 'Tool 2', pluginKey: 'tool2', description: 'Tool 2' },
      );

      // First call: Simulate cache cleared state (returns null for both global and user tools)
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce(null); // User tools
      getCachedTools.mockResolvedValueOnce(null); // Global tools (cache cleared)

      mockReq.config = {
        filteredTools: [],
        includedTools: [],
        availableTools: mockAppTools,
      };

      // Mock setCachedTools to verify it's called to re-initialize
      const { setCachedTools } = require('~/server/services/Config');

      await getAvailableTools(mockReq, mockRes);

      // Should have re-initialized the cache with tools from appConfig
      expect(setCachedTools).toHaveBeenCalledWith(mockAppTools, { isGlobal: true });

      // Should still return tools successfully
      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData).toHaveLength(2);
      expect(responseData.find((t) => t.pluginKey === 'tool1')).toBeDefined();
      expect(responseData.find((t) => t.pluginKey === 'tool2')).toBeDefined();
    });

    it('should handle cache clear without appConfig.availableTools gracefully', async () => {
      // Setup: appConfig without availableTools
      getAppConfig.mockResolvedValue({
        filteredTools: [],
        includedTools: [],
        // No availableTools property
      });

      // Clear availableTools array
      require('~/app/clients/tools').availableTools.length = 0;

      // Cache returns null (cleared state)
      mockCache.get.mockResolvedValue(null);
      getCachedTools.mockResolvedValueOnce(null); // User tools
      getCachedTools.mockResolvedValueOnce(null); // Global tools (cache cleared)

      mockReq.config = {
        filteredTools: [],
        includedTools: [],
        // No availableTools
      };

      await getAvailableTools(mockReq, mockRes);

      // Should handle gracefully without crashing
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });
});
