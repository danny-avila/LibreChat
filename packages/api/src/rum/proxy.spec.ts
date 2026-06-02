import {
  getRumProxyBodyLimit,
  getRumProxyClientUrl,
  getRumProxyTimeoutMs,
  getRumProxyTargetBaseUrl,
  isRumProxyEnabled,
  proxyRumRequest,
  resolveRumProxyTarget,
} from './proxy';

const makeResponse = () => {
  const res = {
    set: jest.fn(),
    send: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('RUM proxy configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the fixed LibreChat RUM proxy URL and default body limit', () => {
    delete process.env.RUM_PROXY_BODY_LIMIT;
    delete process.env.RUM_PROXY_TIMEOUT_MS;

    expect(getRumProxyClientUrl()).toBe('/api/rum');
    expect(getRumProxyBodyLimit()).toBe('3mb');
    expect(getRumProxyTimeoutMs()).toBe(10000);
  });

  it('uses a positive custom collector timeout', () => {
    process.env.RUM_PROXY_TIMEOUT_MS = '2500';
    expect(getRumProxyTimeoutMs()).toBe(2500);

    process.env.RUM_PROXY_TIMEOUT_MS = '-1';
    expect(getRumProxyTimeoutMs()).toBe(10000);
  });

  it('resolves OTLP paths against the configured collector base URL', () => {
    process.env.RUM_AUTH_MODE = 'proxy';
    process.env.RUM_PROXY_TARGET_URL = 'http://otel-collector:4318';

    expect(isRumProxyEnabled()).toBe(true);
    expect(resolveRumProxyTarget('/v1/traces')).toBe('http://otel-collector:4318/v1/traces');
    expect(resolveRumProxyTarget('/v1/logs')).toBe('http://otel-collector:4318/v1/logs');
    expect(resolveRumProxyTarget('/v1/metrics')).toBeUndefined();
  });

  it('rejects unsafe collector target URLs', () => {
    process.env.RUM_PROXY_TARGET_URL = 'https://user:pass@collector.example.com';
    expect(getRumProxyTargetBaseUrl()).toBeUndefined();

    process.env.RUM_PROXY_TARGET_URL = 'file:///tmp/collector';
    expect(getRumProxyTargetBaseUrl()).toBeUndefined();
  });

  it('forwards OTLP requests without forwarding app authorization', async () => {
    process.env.RUM_AUTH_MODE = 'proxy';
    process.env.RUM_PROXY_TARGET_URL = 'http://otel-collector:4318';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('ok', {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = makeResponse();

    await proxyRumRequest(
      {
        path: '/v1/traces',
        body: { resourceSpans: [] },
        headers: {
          accept: 'application/json',
          authorization: 'Bearer app-token',
          'content-type': 'application/json',
        },
      } as never,
      res as never,
    );

    expect(fetchMock).toHaveBeenCalledWith('http://otel-collector:4318/v1/traces', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ resourceSpans: [] }),
      signal: expect.any(AbortSignal),
    });
    expect(res.set).toHaveBeenCalledWith('content-type', 'application/json');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('ok'));

    fetchMock.mockRestore();
  });

  it('returns 400 for missing payloads and 404 for unsupported OTLP paths', async () => {
    process.env.RUM_AUTH_MODE = 'proxy';
    process.env.RUM_PROXY_TARGET_URL = 'http://otel-collector:4318';
    const missingBodyRes = makeResponse();
    const unsupportedPathRes = makeResponse();

    await proxyRumRequest({ path: '/v1/traces', headers: {} } as never, missingBodyRes as never);
    await proxyRumRequest(
      { path: '/v1/metrics', body: Buffer.from('payload'), headers: {} } as never,
      unsupportedPathRes as never,
    );

    expect(missingBodyRes.status).toHaveBeenCalledWith(400);
    expect(unsupportedPathRes.status).toHaveBeenCalledWith(404);
  });

  it('returns 502 when the collector request fails', async () => {
    process.env.RUM_AUTH_MODE = 'proxy';
    process.env.RUM_PROXY_TARGET_URL = 'http://otel-collector:4318';
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('collector down'));
    const res = makeResponse();

    await proxyRumRequest(
      { path: '/v1/traces', body: Buffer.from('payload'), headers: {} } as never,
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(502);
    fetchMock.mockRestore();
  });
});
