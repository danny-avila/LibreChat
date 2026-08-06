import { resolveWebSearchSSRFAgents } from './agent';

describe('resolveWebSearchSSRFAgents', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('attaches both agents for direct public destinations', () => {
    const agents = resolveWebSearchSSRFAgents({
      searxngInstanceUrl: 'https://searx.example.com',
      firecrawlApiUrl: 'https://api.firecrawl.dev/v2/scrape',
    });

    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();
  });

  it('attaches agents when no destination URL is configured', () => {
    const agents = resolveWebSearchSSRFAgents({});

    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();
  });

  it('rejects an IP-literal private destination that the connect-time lookup never sees', () => {
    expect(() =>
      resolveWebSearchSSRFAgents({ searxngInstanceUrl: 'http://169.254.169.254' }),
    ).toThrow(expect.objectContaining({ code: 'ESSRF' }));
  });

  it('rejects an IP-literal private destination on any scraper URL key', () => {
    expect(() => resolveWebSearchSSRFAgents({ firecrawlApiUrl: 'http://127.0.0.1:8080' })).toThrow(
      expect.objectContaining({ code: 'ESSRF' }),
    );
  });

  it('exempts an IP-literal destination listed in allowedAddresses', () => {
    const agents = resolveWebSearchSSRFAgents({ searxngInstanceUrl: 'http://127.0.0.1:8888' }, [
      '127.0.0.1:8888',
    ]);

    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();
  });

  it('throws on a non-http(s) destination scheme', () => {
    expect(() =>
      resolveWebSearchSSRFAgents({ searxngInstanceUrl: 'file:///etc/passwd' }),
    ).toThrow();
  });

  it('withholds agents when a proxy owns egress for a destination', () => {
    process.env.HTTPS_PROXY = 'http://proxy.internal:3128';

    const agents = resolveWebSearchSSRFAgents({
      searxngInstanceUrl: 'https://searx.example.com',
    });

    expect(agents.httpAgent).toBeUndefined();
    expect(agents.httpsAgent).toBeUndefined();
  });

  it('still validates an IP-literal destination when a proxy is configured', () => {
    process.env.HTTP_PROXY = 'http://proxy.internal:3128';

    expect(() =>
      resolveWebSearchSSRFAgents({ searxngInstanceUrl: 'http://169.254.169.254' }),
    ).toThrow(expect.objectContaining({ code: 'ESSRF' }));
  });

  it('attaches agents when NO_PROXY bypasses the proxy for the destination', () => {
    process.env.HTTPS_PROXY = 'http://proxy.internal:3128';
    process.env.NO_PROXY = 'searx.example.com';

    const agents = resolveWebSearchSSRFAgents({
      searxngInstanceUrl: 'https://searx.example.com',
    });

    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();
  });
});
