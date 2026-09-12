import fs from 'fs';
import path from 'path';
import { MAX_CSP_PARAM_LENGTH, buildSandboxResponse } from '../sandbox';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const SANDBOX_PATH = path.resolve(__dirname, '../../../../../client/public/mcp-sandbox.html');

const serve = (query: { csp?: string | string[]; strictCsp?: string | string[] } = {}) =>
  buildSandboxResponse({ sandboxPath: SANDBOX_PATH, ...query });

const policies = (query?: Parameters<typeof serve>[0]): string[] =>
  serve(query).headers['Content-Security-Policy'] as string[];
const resourcePolicy = (query?: Parameters<typeof serve>[0]): string => policies(query)[1];

describe('buildSandboxResponse frame-ancestors', () => {
  const original = process.env.MCP_SANDBOX_FRAME_ANCESTORS;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    } else {
      process.env.MCP_SANDBOX_FRAME_ANCESTORS = original;
    }
  });

  it('keeps frame-ancestors as its own policy, first, so the resource policy cannot loosen it', () => {
    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    const emitted = policies({ csp: JSON.stringify({ frameDomains: ['https://a.example.com'] }) });
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toBe("frame-ancestors 'self'");
    expect(emitted[1]).not.toContain('frame-ancestors');
  });

  it('reads the configured ancestors per call rather than at module load', () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://host.example.com';
    expect(policies()[0]).toBe("frame-ancestors 'self' https://host.example.com");
    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    expect(policies()[0]).toBe("frame-ancestors 'self'");
  });

  it('omits X-Frame-Options only when a cross-origin ancestor is configured', () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://host.example.com';
    const crossOrigin = serve().headers;
    expect(crossOrigin['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect('X-Frame-Options' in crossOrigin).toBe(false);

    delete process.env.MCP_SANDBOX_FRAME_ANCESTORS;
    const sameOrigin = serve().headers;
    expect(sameOrigin['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(sameOrigin['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('drops a token that tries to inject an extra directive', () => {
    process.env.MCP_SANDBOX_FRAME_ANCESTORS = 'https://ok.com; script-src *';
    expect(policies()[0]).toBe("frame-ancestors 'self'");
  });
});

describe('buildSandboxResponse resource policy', () => {
  it('allows the blob install with no csp declared and never emits a bare frame-src none', () => {
    const policy = resourcePolicy();
    expect(policy).toContain('frame-src blob:');
    expect(policy).not.toContain("frame-src 'none'");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain('worker-src blob:');
    expect(policy).toContain("base-uri 'self'");
  });

  it('widens frame-src to declared frameDomains only', () => {
    expect(
      resourcePolicy({ csp: JSON.stringify({ frameDomains: ['https://embed.example.com'] }) }),
    ).toContain('frame-src blob: https://embed.example.com');
  });

  it('bounds form-action and connect-src to the declared egress allowlist', () => {
    const policy = resourcePolicy({
      csp: JSON.stringify({ connectDomains: ['https://api.example.com'] }),
    });
    expect(policy).toContain('connect-src https://api.example.com');
    expect(policy).toContain('form-action https://api.example.com');
  });

  it('keeps the proxy script and styles running in both modes', () => {
    for (const query of [{}, { strictCsp: '1' }]) {
      expect(resourcePolicy(query)).toContain("script-src 'unsafe-inline'");
      expect(resourcePolicy(query)).toContain("style-src 'unsafe-inline'");
    }
  });

  it('drops unsafe-eval, wasm, blob and data script sources under strictCsp', () => {
    expect(resourcePolicy()).toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:",
    );
    expect(resourcePolicy({ strictCsp: '1' })).not.toContain("'unsafe-eval'");
  });

  it('only treats the literal "1" as strict mode', () => {
    expect(resourcePolicy({ strictCsp: 'true' })).toContain("'unsafe-eval'");
    expect(resourcePolicy({ strictCsp: ['1', '1'] })).toContain("'unsafe-eval'");
  });

  it.each([
    'javascript:alert(1)',
    'data:',
    'blob:',
    '*',
    'http://*',
    'https://*',
    'evil.com; script-src *',
    "'self'",
    "'unsafe-eval'",
    "'nonce-abc123'",
    'a\nb.com',
    'a\rb.com',
    'under_score.com',
    '[::1]',
    'https://a.com?x=1',
    'https://a.com#f',
  ])('drops the illegal declared domain %j', (domain) => {
    expect(resourcePolicy({ csp: JSON.stringify({ connectDomains: [domain] }) })).toContain(
      "connect-src 'none'",
    );
  });

  it.each([
    'https://api.example.com',
    'https://*.example.com',
    'https://a.example.com:8443',
    'https://a.example.com:*',
    'HTTPS://API.EXAMPLE.COM',
    'wss://socket.example.com',
    'api.example.com',
    'https://api.example.com/path',
  ])('emits the legal declared domain %j', (domain) => {
    expect(resourcePolicy({ csp: JSON.stringify({ connectDomains: [domain] }) })).toContain(
      `connect-src ${domain}`,
    );
  });

  it('emits declared domains trimmed', () => {
    expect(
      resourcePolicy({ csp: JSON.stringify({ connectDomains: ['\n  https://a.com  '] }) }),
    ).toContain('connect-src https://a.com;');
  });

  it('caps the number of declared domains', () => {
    const domains = Array.from({ length: 40 }, (_, i) => `https://d${i}.example.com`);
    const emitted = resourcePolicy({ csp: JSON.stringify({ connectDomains: domains }) })
      .split('; ')
      .find((directive) => directive.startsWith('connect-src '));
    expect(emitted?.split(' ')).toHaveLength(33);
    expect(emitted).not.toContain('d32.example.com');
  });

  it.each([
    ['oversized', `{"connectDomains":["https://a.com"],"pad":"${'x'.repeat(4200)}"}`],
    ['unparseable', '{not json'],
    ['an array', '["https://a.com"]'],
    ['null', 'null'],
    ['repeated', ['{"connectDomains":["https://a.com"]}', '{"connectDomains":["https://b.com"]}']],
  ])('falls back to the restrictive default for %s csp', (_name, csp) => {
    const policy = resourcePolicy({ csp });
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain('frame-src blob:');
  });

  it('accepts a declaration exactly at the length the client mirrors', () => {
    const pad = 'a'.repeat(
      MAX_CSP_PARAM_LENGTH - '{"connectDomains":["https://a.com"],"pad":""}'.length,
    );
    const csp = `{"connectDomains":["https://a.com"],"pad":"${pad}"}`;
    expect(csp).toHaveLength(MAX_CSP_PARAM_LENGTH);
    expect(resourcePolicy({ csp })).toContain('connect-src https://a.com');
  });
});

describe('buildSandboxResponse document', () => {
  it('substitutes the fail-closed csp marker on every response and never caches', () => {
    const raw = fs.readFileSync(SANDBOX_PATH, 'utf8');
    const expected = raw.replace('/*__CSP_APPLIED__*/', 'window.__MCP_SANDBOX_CSP_APPLIED = true;');
    expect(raw).toContain('/*__CSP_APPLIED__*/');

    for (const query of [{}, { strictCsp: '1' }]) {
      const { headers, body } = serve(query);
      expect(body).toBe(expected);
      expect(body).not.toContain('/*__CSP_APPLIED__*/');
      expect(headers['Cache-Control']).toContain('no-store');
      expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Referrer-Policy']).toBe('same-origin');
    }
  });
});
