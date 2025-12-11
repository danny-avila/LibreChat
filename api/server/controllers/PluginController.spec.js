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
}));

// loadAndFormatTools mock removed - no longer used in PluginController
// getMCPManager mock removed - no longer used in PluginController

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
      // getCachedTools returns the tool definitions
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
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

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
      // getCachedTools returns the tool definitions
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
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      await getAvailableTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
      const toolkit = responseData.find((t) => t.pluginKey === 'toolkit1');
      expect(toolkit).toBeDefined();
    });
  });

  describe('helper function integration', () => {
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
      // getCachedTools returns empty object instead of null
      getCachedTools.mockResolvedValueOnce({});
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

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

      // Mock getCachedTools to return undefined
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValueOnce(undefined);

      await getAvailableTools(mockReq, mockRes);

      // Should handle undefined values gracefully
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should handle empty toolDefinitions object', async () => {
      mockCache.get.mockResolvedValue(null);
      // Reset getCachedTools to ensure clean state
      getCachedTools.mockReset();
      getCachedTools.mockResolvedValue({});
      mockReq.config = {}; // No mcpConfig at all

      // Ensure no plugins are available
      require('~/app/clients/tools').availableTools.length = 0;

      await getAvailableTools(mockReq, mockRes);

      // With empty tool definitions, no tools should be in the final output
      expect(mockRes.json).toHaveBeenCalledWith([]);
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
      // getCachedTools returns empty object to avoid null reference error
      getCachedTools.mockResolvedValueOnce({});
      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

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

      mockReq.config = {
        mcpConfig: null,
        paths: { structuredTools: '/mock/path' },
      };

      // CRITICAL: getCachedTools returns undefined
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

      // Simulate cache cleared state (returns null)
      mockCache.get.mockResolvedValue(null);
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
      expect(setCachedTools).toHaveBeenCalledWith(mockAppTools);

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
