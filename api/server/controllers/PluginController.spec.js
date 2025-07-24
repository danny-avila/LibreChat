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
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

// Import the actual module with the function we want to test
const { getAvailableTools } = require('./PluginController');

describe('PluginController', () => {
  describe('plugin.icon behavior', () => {
    let mockReq, mockRes, mockCache;

    const callGetAvailableToolsWithMCPServer = async (mcpServers) => {
      mockCache.get.mockResolvedValue(null);
      getCustomConfig.mockResolvedValue({ mcpServers });

      const functionTools = {
        [`test-tool${Constants.mcp_delimiter}test-server`]: {
          function: { name: 'test-tool', description: 'A test tool' },
        },
      };
      getCachedTools.mockResolvedValueOnce(functionTools);
      getCachedTools.mockResolvedValueOnce({
        [`test-tool${Constants.mcp_delimiter}test-server`]: true,
      });

      await getAvailableTools(mockReq, mockRes);
      const responseData = mockRes.json.mock.calls[0][0];
      return responseData.find((tool) => tool.name === 'test-tool');
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockReq = { user: { id: 'test-user-id' } };
      mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      mockCache = { get: jest.fn(), set: jest.fn() };
      getLogStores.mockReturnValue(mockCache);
    });

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
});
