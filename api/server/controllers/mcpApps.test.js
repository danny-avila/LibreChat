jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
// The sandbox response builder and the error mapping are exercised for real: they are the
// server half of the CSP contract this controller only adapts to Express.
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  resolveAppRequestContext: jest.fn(),
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

const fs = require('fs');
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { resolveAppRequestContext, readAppResource } = require('@librechat/api');
const { serveMCPSandbox, readMCPResource } = require('./mcpApps');

const SANDBOX_PATH = path.resolve(__dirname, '../../../client/public/mcp-sandbox.html');

const makeRes = () => {
  const headers = {};
  return {
    headers,
    headersSent: false,
    setHeader: jest.fn((k, v) => {
      headers[k] = v;
    }),
    send: jest.fn().mockReturnThis(),
    sendFile: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
};

/** The response carries two policies; frame-ancestors is always the first. */
const policies = (res) => res.headers['Content-Security-Policy'];
const ancestorsPolicy = (res) => policies(res)[0];
const resourcePolicy = (res) => policies(res)[1];

const serve = async (query) => {
  const res = makeRes();
  await serveMCPSandbox({ query }, res);
  return res;
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
    const res = await serve({});
    expect(ancestorsPolicy(res)).toBe("frame-ancestors 'self' https://host.example.com");
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
  });

  it('drops a token that tries to inject an extra directive', async () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://ok.com; script-src *';
    const res = await serve({});
    // The ";"-bearing token is rejected wholesale, leaving no valid ancestors -> same-origin default.
    expect(ancestorsPolicy(res)).toBe("frame-ancestors 'self'");
    expect(ancestorsPolicy(res)).not.toContain('script-src');
    expect(res.headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('defaults to same-origin when no ancestors are configured', async () => {
    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    const res = await serve({});
    expect(ancestorsPolicy(res)).toBe("frame-ancestors 'self'");
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });

  it('keeps frame-ancestors in its own policy so the resource policy cannot loosen it', async () => {
    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    const res = await serve({ csp: JSON.stringify({ frameDomains: ['https://a.example.com'] }) });
    expect(policies(res)).toHaveLength(2);
    expect(resourcePolicy(res)).not.toContain('frame-ancestors');
  });
});

describe('serveMCPSandbox resource policy', () => {
  it('allows the blob install with no csp declared and never emits a bare frame-src none', async () => {
    const res = await serve({});
    const policy = resourcePolicy(res);
    expect(policy).toContain('frame-src blob:');
    expect(policy).not.toContain("frame-src 'none'");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain('worker-src blob:');
  });

  it('widens frame-src to declared frameDomains only', async () => {
    const res = await serve({
      csp: JSON.stringify({ frameDomains: ['https://embed.example.com'] }),
    });
    expect(resourcePolicy(res)).toContain('frame-src blob: https://embed.example.com');
  });

  it('bounds form-action and connect-src to the declared egress allowlist', async () => {
    const res = await serve({
      csp: JSON.stringify({ connectDomains: ['https://api.example.com'] }),
    });
    const policy = resourcePolicy(res);
    expect(policy).toContain('connect-src https://api.example.com');
    expect(policy).toContain('form-action https://api.example.com');
  });

  it('keeps the proxy script and styles running in both modes', async () => {
    for (const query of [{}, { strictCsp: '1' }]) {
      const res = await serve(query);
      expect(policies(res)).toHaveLength(2);
      expect(resourcePolicy(res)).toContain("script-src 'unsafe-inline'");
      expect(resourcePolicy(res)).toContain("style-src 'unsafe-inline'");
    }
  });

  it('drops unsafe-eval, wasm, blob and data script sources under strictCsp', async () => {
    const relaxed = resourcePolicy(await serve({}));
    const strict = resourcePolicy(await serve({ strictCsp: '1' }));
    expect(relaxed).toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:",
    );
    expect(strict).toContain("script-src 'unsafe-inline'");
    expect(strict).not.toContain("'unsafe-eval'");
  });

  it('substitutes the fail-closed csp marker into the served document', async () => {
    const raw = fs.readFileSync(SANDBOX_PATH, 'utf8');
    const res = await serve({});
    const body = res.send.mock.calls[0][0];
    expect(body).toBe(
      raw.replace('/*__CSP_APPLIED__*/', 'window.__MCP_SANDBOX_CSP_APPLIED = true;'),
    );
    expect(body).not.toContain('/*__CSP_APPLIED__*/');
    expect(res.headers['Cache-Control']).toContain('no-store');
  });
});

describe('app proxy adapters', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects the request and does not proxy when context resolution fails', async () => {
    resolveAppRequestContext.mockRejectedValue(new Error('db down'));
    const req = { user: { id: 'user-1' }, body: { serverName: 'srv', uri: 'ui://x' } };
    const res = makeRes();

    await readMCPResource(req, res);

    expect(readAppResource).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rejects an unauthenticated request before resolving any context', async () => {
    const res = makeRes();

    await readMCPResource({ body: {} }, res);

    expect(resolveAppRequestContext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 without an error-level log when the read is denied', async () => {
    resolveAppRequestContext.mockResolvedValue({ userId: 'user-1', serverName: 'srv' });
    readAppResource.mockRejectedValue(
      Object.assign(new Error('Resource "file:///etc/passwd" is not permitted.'), { code: -32600 }),
    );
    const req = { user: { id: 'user-1' }, body: { serverName: 'srv', uri: 'file:///etc/passwd' } };
    const res = makeRes();

    await readMCPResource(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Resource "file:///etc/passwd" is not permitted.',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
