const { Constants } = require('librechat-data-provider');
const { getAppConfig } = require('~/server/services/Config');
const { getMCPManager } = require('~/config');
const { readMCPResource, appToolCall, serveMCPSandbox } = require('./mcpApps');

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

function createResponse() {
  return {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    sendFile: jest.fn((_filePath, callback) => callback?.()),
  };
}

describe('MCP Apps Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readMCPResource', () => {
    it('returns 403 when MCP apps are disabled', async () => {
      getAppConfig.mockResolvedValue({
        mcpSettings: {
          apps: false,
        },
      });

      const req = {
        user: { id: 'user-1', role: 'USER' },
        body: { serverName: 'calendar', uri: 'ui://calendar/app' },
      };
      const res = createResponse();

      await readMCPResource(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'MCP Apps are disabled' });
    });

    it('applies MCP app settings to returned ui resource metadata', async () => {
      getAppConfig.mockResolvedValue({
        mcpSettings: {
          apps: true,
          appSettings: {
            allowedConnectDomains: ['https://api.allowed.com'],
            blockedDomains: ['blocked.com', '*.blocked.com', '*.danger.example'],
            maxHeight: 1200,
            allowFullscreen: false,
          },
        },
      });

      const mockResult = {
        contents: [
          {
            uri: 'ui://calendar/app',
            mimeType: 'text/html',
            text: '<html></html>',
            _meta: {
              ui: {
                csp: {
                  connectDomains: ['https://api.blocked.com', 'https://api.keep.com'],
                  resourceDomains: ['https://assets.blocked.com', 'https://assets.keep.com'],
                  frameDomains: ['https://frame.danger.example', 'https://frame.keep.com'],
                  baseUriDomains: ['https://base.danger.example', 'https://base.keep.com'],
                },
              },
            },
          },
        ],
      };

      const mockManager = {
        readResource: jest.fn().mockResolvedValue(mockResult),
      };
      getMCPManager.mockReturnValue(mockManager);

      const req = {
        user: { id: 'user-1', role: 'USER' },
        body: { serverName: 'calendar', uri: 'ui://calendar/app' },
      };
      const res = createResponse();

      await readMCPResource(req, res);

      expect(mockManager.readResource).toHaveBeenCalledWith('user-1', 'calendar', 'ui://calendar/app');
      expect(res.json).toHaveBeenCalledTimes(1);

      const payload = res.json.mock.calls[0][0];
      const uiMeta = payload.contents[0]._meta.ui;

      expect(uiMeta.maxHeight).toBe(1200);
      expect(uiMeta.allowFullscreen).toBe(false);
      expect(uiMeta.csp.connectDomains).toEqual(
        expect.arrayContaining(['https://api.allowed.com', 'https://api.keep.com']),
      );
      expect(uiMeta.csp.connectDomains).not.toEqual(expect.arrayContaining(['https://api.blocked.com']));
      expect(uiMeta.csp.resourceDomains).not.toEqual(
        expect.arrayContaining(['https://assets.blocked.com']),
      );
      expect(uiMeta.csp.frameDomains).not.toEqual(
        expect.arrayContaining(['https://frame.danger.example']),
      );
      expect(uiMeta.csp.baseUriDomains).not.toEqual(
        expect.arrayContaining(['https://base.danger.example']),
      );
    });
  });

  describe('appToolCall', () => {
    it('returns 403 for model-only tools', async () => {
      getAppConfig.mockResolvedValue({
        mcpSettings: {
          apps: true,
        },
      });

      const toolKey = `counter${Constants.mcp_delimiter}calendar`;
      const mockManager = {
        getAllToolsForServer: jest.fn().mockResolvedValue({
          [toolKey]: {
            _meta: { ui: { visibility: ['model'] } },
          },
        }),
        appToolCall: jest.fn(),
      };
      getMCPManager.mockReturnValue(mockManager);

      const req = {
        user: { id: 'user-1', role: 'USER' },
        body: { serverName: 'calendar', toolName: 'counter', arguments: { id: '123' } },
      };
      const res = createResponse();

      await appToolCall(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tool "counter" is not callable by apps' });
      expect(mockManager.appToolCall).not.toHaveBeenCalled();
    });
  });

  describe('serveMCPSandbox', () => {
    it('returns 403 when apps are disabled', async () => {
      getAppConfig.mockResolvedValue({
        mcpSettings: {
          apps: false,
        },
      });

      const req = {
        user: { id: 'user-1', role: 'USER' },
      };
      const res = createResponse();

      await serveMCPSandbox(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'MCP Apps are disabled' });
      expect(res.sendFile).not.toHaveBeenCalled();
    });

    it('serves sandbox html with hardened response headers', async () => {
      getAppConfig.mockResolvedValue({
        mcpSettings: {
          apps: true,
        },
      });

      const req = {
        user: { id: 'user-1', role: 'USER' },
      };
      const res = createResponse();

      await serveMCPSandbox(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.sendFile).toHaveBeenCalledTimes(1);
      expect(res.sendFile.mock.calls[0][0]).toContain('mcp-sandbox.html');
    });
  });
});
