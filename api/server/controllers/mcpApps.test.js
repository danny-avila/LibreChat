jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  getUserMCPAuthMap: jest.fn(),
  readAppResource: jest.fn(),
  listAppResources: jest.fn(),
  listAppResourceTemplates: jest.fn(),
  callAppTool: jest.fn(),
}));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('~/server/services/MCP', () => ({ resolveConfigServers: jest.fn() }));
jest.mock('~/models', () => ({
  findPluginAuthsByKeys: jest.fn(),
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));
jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));

const { getUserMCPAuthMap, readAppResource } = require('@librechat/api');
const { resolveConfigServers } = require('~/server/services/MCP');
const { serveMCPSandbox, readMCPResource } = require('./mcpApps');

const makeRes = () => {
  const headers = {};
  return {
    headers,
    headersSent: false,
    setHeader: jest.fn((k, v) => {
      headers[k] = v;
    }),
    sendFile: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
};

describe('serveMCPSandbox frame-ancestors', () => {
  const original = process.env.MCP_SANDBOX_FRAME_ANCESTORS;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    } else {
      process.env.MCP_SANDBOX_FRAME_ANCESTORS = original;
    }
  });

  it('allows a valid host origin and marks the resource cross-origin', async () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://host.example.com';
    const res = makeRes();
    await serveMCPSandbox({}, res);
    expect(res.headers['Content-Security-Policy']).toBe(
      "frame-ancestors 'self' https://host.example.com",
    );
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
  });

  it('drops a token that tries to inject an extra directive', async () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://ok.com; script-src *';
    const res = makeRes();
    await serveMCPSandbox({}, res);
    const csp = res.headers['Content-Security-Policy'];
    expect(csp).not.toContain('script-src');
    // The ";"-bearing token is rejected wholesale, leaving no valid ancestors -> same-origin default.
    expect(csp).toBe("frame-ancestors 'self'");
    expect(res.headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('defaults to same-origin when no ancestors are configured', async () => {
    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    const res = makeRes();
    await serveMCPSandbox({}, res);
    expect(res.headers['Content-Security-Policy']).toBe("frame-ancestors 'self'");
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });
});

describe('resolveAppContext fail-closed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects the request and does not proxy when auth-value resolution fails', async () => {
    resolveConfigServers.mockResolvedValue({});
    getUserMCPAuthMap.mockRejectedValue(new Error('db down'));
    const req = { user: { id: 'user-1' }, body: { serverName: 'srv', uri: 'ui://x' } };
    const res = makeRes();

    await readMCPResource(req, res);

    expect(readAppResource).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
