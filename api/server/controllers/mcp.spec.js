const { getMCPTools } = require('./mcp');
const { getAppConfig, getMCPServerTools } = require('~/server/services/Config');
const { getMCPManager } = require('~/config');
const { convertMCPToolToPlugin } = require('@librechat/api');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  Constants: {
    mcp_delimiter: '~~~',
  },
}));

jest.mock('@librechat/api', () => ({
  convertMCPToolToPlugin: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  getMCPServerTools: jest.fn(),
  cacheMCPServerTools: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
}));

describe('MCP Controller', () => {
  let mockReq, mockRes, mockMCPManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { id: 'test-user-id', role: 'user' },
      config: null,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockMCPManager = {
      getAllToolFunctions: jest.fn().mockResolvedValue({}),
    };

    getMCPManager.mockReturnValue(mockMCPManager);
    getAppConfig.mockResolvedValue({
      mcpConfig: {},
    });
    getMCPServerTools.mockResolvedValue(null);
  });

  describe('getMCPTools', () => {
    it('should return 401 when user ID is not found', async () => {
      mockReq.user = null;

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      const { logger } = require('@librechat/data-schemas');
      expect(logger.warn).toHaveBeenCalledWith('[getMCPTools] User ID not found in request');
    });

    it('should return empty array when no mcpConfig exists', async () => {
      getAppConfig.mockResolvedValue({
        // No mcpConfig
      });

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should use cached server tools when available', async () => {
      const cachedTools = {
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      };

      getMCPServerTools.mockResolvedValue(cachedTools);
      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      expect(getMCPServerTools).toHaveBeenCalledWith('server1');
      expect(mockMCPManager.getAllToolFunctions).not.toHaveBeenCalled();
      expect(convertMCPToolToPlugin).toHaveBeenCalledWith({
        toolKey: 'tool1~~~server1',
        toolData: cachedTools['tool1~~~server1'],
        mcpManager: mockMCPManager,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should fetch from MCP manager when cache is empty', async () => {
      getMCPServerTools.mockResolvedValue(null);

      const allTools = {
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
        'tool2~~~server2': {
          type: 'function',
          function: {
            name: 'tool2',
            description: 'Tool 2',
            parameters: {},
          },
        },
      };

      mockMCPManager.getAllToolFunctions.mockResolvedValue(allTools);

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      expect(getMCPServerTools).toHaveBeenCalledWith('server1');
      expect(mockMCPManager.getAllToolFunctions).toHaveBeenCalledWith('test-user-id');

      // Should cache the server tools
      const { cacheMCPServerTools } = require('~/server/services/Config');
      expect(cacheMCPServerTools).toHaveBeenCalledWith({
        serverName: 'server1',
        serverTools: {
          'tool1~~~server1': allTools['tool1~~~server1'],
        },
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should handle custom user variables in server config', async () => {
      getMCPServerTools.mockResolvedValue({
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      });

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {
            customUserVars: {
              API_KEY: {
                title: 'API Key',
                description: 'Your API key',
              },
              SECRET: {
                title: 'Secret Token',
                description: 'Your secret token',
              },
            },
          },
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [
            {
              authField: 'API_KEY',
              label: 'API Key',
              description: 'Your API key',
            },
            {
              authField: 'SECRET',
              label: 'Secret Token',
              description: 'Your secret token',
            },
          ],
          authenticated: false,
        },
      ]);
    });

    it('should handle empty custom user variables', async () => {
      getMCPServerTools.mockResolvedValue({
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      });

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {
            customUserVars: {},
          },
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should handle multiple servers', async () => {
      getMCPServerTools.mockResolvedValue(null);

      const allTools = {
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
        'tool2~~~server2': {
          type: 'function',
          function: {
            name: 'tool2',
            description: 'Tool 2',
            parameters: {},
          },
        },
      };

      mockMCPManager.getAllToolFunctions.mockResolvedValue(allTools);

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
          server2: {},
        },
      });

      const mockPlugin1 = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      const mockPlugin2 = {
        name: 'Tool 2',
        pluginKey: 'tool2~~~server2',
        description: 'Tool 2',
      };

      convertMCPToolToPlugin.mockReturnValueOnce(mockPlugin1).mockReturnValueOnce(mockPlugin2);

      await getMCPTools(mockReq, mockRes);

      expect(getMCPServerTools).toHaveBeenCalledWith('server1');
      expect(getMCPServerTools).toHaveBeenCalledWith('server2');
      expect(mockMCPManager.getAllToolFunctions).toHaveBeenCalledTimes(2);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin1,
          authConfig: [],
          authenticated: true,
        },
        {
          ...mockPlugin2,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should handle server-specific errors gracefully', async () => {
      getMCPServerTools.mockResolvedValue(null);
      mockMCPManager.getAllToolFunctions.mockRejectedValue(new Error('Server connection failed'));

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
          server2: {},
        },
      });

      await getMCPTools(mockReq, mockRes);

      const { logger } = require('@librechat/data-schemas');
      expect(logger.error).toHaveBeenCalledWith(
        '[getMCPTools] Error loading tools for server server1:',
        expect.any(Error),
      );
      expect(logger.error).toHaveBeenCalledWith(
        '[getMCPTools] Error loading tools for server server2:',
        expect.any(Error),
      );

      // Should still return 200 with empty array
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });

    it('should skip tools when convertMCPToolToPlugin returns null', async () => {
      getMCPServerTools.mockResolvedValue({
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
        'tool2~~~server1': {
          type: 'function',
          function: {
            name: 'tool2',
            description: 'Tool 2',
            parameters: {},
          },
        },
      });

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };

      // First tool returns plugin, second returns null
      convertMCPToolToPlugin.mockReturnValueOnce(mockPlugin).mockReturnValueOnce(null);

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should use req.config when available', async () => {
      const reqConfig = {
        mcpConfig: {
          server1: {},
        },
      };
      mockReq.config = reqConfig;

      getMCPServerTools.mockResolvedValue({
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      // Should not call getAppConfig when req.config is available
      expect(getAppConfig).not.toHaveBeenCalled();

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [],
          authenticated: true,
        },
      ]);
    });

    it('should handle general error in getMCPTools', async () => {
      const error = new Error('Unexpected error');
      getAppConfig.mockRejectedValue(error);

      await getMCPTools(mockReq, mockRes);

      const { logger } = require('@librechat/data-schemas');
      expect(logger.error).toHaveBeenCalledWith('[getMCPTools]', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Unexpected error' });
    });

    it('should handle custom user variables without title or description', async () => {
      getMCPServerTools.mockResolvedValue({
        'tool1~~~server1': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      });

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {
            customUserVars: {
              MY_VAR: {
                // No title or description
              },
            },
          },
        },
      });

      const mockPlugin = {
        name: 'Tool 1',
        pluginKey: 'tool1~~~server1',
        description: 'Tool 1',
      };
      convertMCPToolToPlugin.mockReturnValue(mockPlugin);

      await getMCPTools(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([
        {
          ...mockPlugin,
          authConfig: [
            {
              authField: 'MY_VAR',
              label: 'MY_VAR', // Falls back to key
              description: '', // Empty string
            },
          ],
          authenticated: false,
        },
      ]);
    });

    it('should not cache when no tools are found for a server', async () => {
      getMCPServerTools.mockResolvedValue(null);

      const allTools = {
        'tool1~~~otherserver': {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'Tool 1',
            parameters: {},
          },
        },
      };

      mockMCPManager.getAllToolFunctions.mockResolvedValue(allTools);

      getAppConfig.mockResolvedValue({
        mcpConfig: {
          server1: {},
        },
      });

      await getMCPTools(mockReq, mockRes);

      const { cacheMCPServerTools } = require('~/server/services/Config');
      expect(cacheMCPServerTools).not.toHaveBeenCalled();

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });
});
