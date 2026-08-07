import { resolveWebSearchSSRFAgents } from './agent';
import { isAddressAllowed } from '../auth';

/** `options` exists on a Node agent at runtime but is absent from the bundled type. */
interface AgentOptionsProbe {
  options: { keepAlive?: boolean };
}

function agentOptions(agent: object): AgentOptionsProbe['options'] {
  return (agent as AgentOptionsProbe).options;
}

describe('resolveWebSearchSSRFAgents', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      'PROXY',
      'proxy',
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'NO_PROXY',
      'no_proxy',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('always returns a pooled agent pair', () => {
    const { httpAgent, httpsAgent } = resolveWebSearchSSRFAgents();

    expect(httpAgent).toBeDefined();
    expect(httpsAgent).toBeDefined();
    expect(agentOptions(httpAgent).keepAlive).toBe(true);
    expect(agentOptions(httpsAgent).keepAlive).toBe(true);
  });

  it('still returns agents when a proxy is configured, so direct routes stay guarded', () => {
    process.env.HTTPS_PROXY = 'http://proxy.internal:3128';

    const { httpAgent, httpsAgent } = resolveWebSearchSSRFAgents();

    expect(httpAgent).toBeDefined();
    expect(httpsAgent).toBeDefined();
  });

  it('exempts the proxy endpoint so the proxy hop stays reachable', () => {
    process.env.HTTP_PROXY = 'http://proxy.internal:3128';

    resolveWebSearchSSRFAgents();

    expect(isAddressAllowed('proxy.internal', ['proxy.internal:3128'], '3128')).toBe(true);
  });

  it('scopes the proxy exemption to its port, so another private port stays blocked', () => {
    expect(isAddressAllowed('proxy.internal', ['proxy.internal:3128'], '9')).toBe(false);
  });

  it('derives the default proxy port from the proxy scheme', () => {
    process.env.HTTP_PROXY = 'http://proxy.internal';
    process.env.HTTPS_PROXY = 'https://secure-proxy.internal';

    const first = resolveWebSearchSSRFAgents();

    process.env.HTTP_PROXY = 'http://proxy.internal:80';
    process.env.HTTPS_PROXY = 'https://secure-proxy.internal:443';

    expect(resolveWebSearchSSRFAgents()).toBe(first);
  });

  it('reads the PROXY variable that other LibreChat egress paths honor', () => {
    process.env.PROXY = 'http://proxy.internal:3128';
    const viaProxyVar = resolveWebSearchSSRFAgents();

    delete process.env.PROXY;
    process.env.HTTP_PROXY = 'http://proxy.internal:3128';
    process.env.HTTPS_PROXY = 'http://proxy.internal:3128';

    expect(resolveWebSearchSSRFAgents()).toBe(viaProxyVar);
  });

  it('treats an empty proxy variable as unset, matching the value compose forwards', () => {
    const withoutProxy = resolveWebSearchSSRFAgents();

    process.env.HTTP_PROXY = '';
    process.env.HTTPS_PROXY = '   ';

    expect(resolveWebSearchSSRFAgents()).toBe(withoutProxy);
  });

  it('reuses one pair per exemption list and separates distinct lists', () => {
    const first = resolveWebSearchSSRFAgents(['searxng:8080']);
    const again = resolveWebSearchSSRFAgents(['searxng:8080']);
    const other = resolveWebSearchSSRFAgents(['firecrawl:3002']);

    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it('keeps admin allowedAddresses entries alongside the derived proxy exemption', () => {
    process.env.HTTP_PROXY = 'http://proxy.internal:3128';

    expect(resolveWebSearchSSRFAgents(['searxng:8080'])).not.toBe(resolveWebSearchSSRFAgents([]));
  });

  it('does not throw for a private destination, leaving enforcement at connect time', () => {
    expect(() => resolveWebSearchSSRFAgents(['127.0.0.1:8080'])).not.toThrow();
  });

  it('ignores an unparseable proxy value rather than throwing during tool load', () => {
    process.env.HTTP_PROXY = 'not a url';

    expect(() => resolveWebSearchSSRFAgents()).not.toThrow();
  });
});
