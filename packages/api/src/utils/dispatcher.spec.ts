import { Agent, EnvHttpProxyAgent, ProxyAgent } from 'undici';
import type { LLMFetchDispatcherConnect } from './dispatcher';
import {
  createLLMFetchDispatcher,
  getLLMFetchTimeoutMs,
  parseHttpRequestTimeoutMs,
  resetLLMFetchDispatchers,
} from './dispatcher';

function getDispatcherTimeouts(dispatcher: object): {
  bodyTimeout?: number;
  headersTimeout?: number;
} {
  const seen = new Set<object>();

  const walk = (value: object): { bodyTimeout?: number; headersTimeout?: number } => {
    if (seen.has(value)) {
      return {};
    }
    seen.add(value);

    const optionsSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(options)',
    );
    if (optionsSym != null) {
      const options = (
        value as Record<symbol, { bodyTimeout?: number; headersTimeout?: number }>
      )[optionsSym];
      if (typeof options?.bodyTimeout === 'number' || typeof options?.headersTimeout === 'number') {
        return {
          bodyTimeout: options.bodyTimeout,
          headersTimeout: options.headersTimeout,
        };
      }
    }

    for (const symbol of Object.getOwnPropertySymbols(value)) {
      const nested = (value as Record<symbol, unknown>)[symbol];
      if (nested != null && typeof nested === 'object') {
        const nestedTimeouts = walk(nested);
        if (
          typeof nestedTimeouts.bodyTimeout === 'number' ||
          typeof nestedTimeouts.headersTimeout === 'number'
        ) {
          return nestedTimeouts;
        }
      }
    }

    return {};
  };

  return walk(dispatcher);
}

function collectBodyTimeouts(dispatcher: object): number[] {
  const seen = new Set<object>();
  const timeouts: number[] = [];

  const walk = (value: object): void => {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    const bodyTimeout = getDispatcherTimeouts(value).bodyTimeout;
    if (typeof bodyTimeout === 'number') {
      timeouts.push(bodyTimeout);
    }

    for (const symbol of Object.getOwnPropertySymbols(value)) {
      const nested = (value as Record<symbol, unknown>)[symbol];
      if (nested != null && typeof nested === 'object') {
        walk(nested);
      }
    }
  };

  walk(dispatcher);
  return timeouts;
}

describe('LLM fetch dispatcher timeouts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HTTP_REQUEST_TIMEOUT_MS;
    delete process.env.PROXY;
    delete process.env.proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    resetLLMFetchDispatchers();
  });

  afterAll(() => {
    resetLLMFetchDispatchers();
    process.env = originalEnv;
  });

  it('treats an unset HTTP_REQUEST_TIMEOUT_MS as a disabled undici idle timeout', () => {
    expect(parseHttpRequestTimeoutMs({})).toBeUndefined();
    expect(getLLMFetchTimeoutMs({})).toBe(0);
  });

  it('parses HTTP_REQUEST_TIMEOUT_MS including an explicit disable', () => {
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: '900000' })).toBe(900000);
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: '0' })).toBe(0);
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: ' 600000 ' })).toBe(600000);
  });

  it('ignores invalid HTTP_REQUEST_TIMEOUT_MS values rather than defaulting to 300s', () => {
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: 'nope' })).toBeUndefined();
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: '-1' })).toBeUndefined();
    expect(parseHttpRequestTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: '1.5' })).toBeUndefined();
    expect(getLLMFetchTimeoutMs({ HTTP_REQUEST_TIMEOUT_MS: 'nope' })).toBe(0);
  });

  it('creates a direct Agent that disables the 5-minute undici cap by default', () => {
    const dispatcher = createLLMFetchDispatcher();
    expect(dispatcher).toBeInstanceOf(Agent);
    expect(getDispatcherTimeouts(dispatcher)).toEqual({
      bodyTimeout: 0,
      headersTimeout: 0,
    });
  });

  it('aligns bodyTimeout and headersTimeout to HTTP_REQUEST_TIMEOUT_MS', () => {
    process.env.HTTP_REQUEST_TIMEOUT_MS = '900000';
    const dispatcher = createLLMFetchDispatcher();
    expect(getDispatcherTimeouts(dispatcher)).toEqual({
      bodyTimeout: 900000,
      headersTimeout: 900000,
    });
  });

  it('reuses a cached dispatcher for the same timeout and proxy', () => {
    const first = createLLMFetchDispatcher();
    const second = createLLMFetchDispatcher();
    expect(second).toBe(first);
  });

  it('does not reuse a dispatcher when the configured timeout changes', () => {
    const unset = createLLMFetchDispatcher();
    process.env.HTTP_REQUEST_TIMEOUT_MS = '900000';
    const configured = createLLMFetchDispatcher();
    expect(configured).not.toBe(unset);
    expect(getDispatcherTimeouts(configured).bodyTimeout).toBe(900000);
  });

  it('applies the timeout to an explicit ProxyAgent', () => {
    process.env.HTTP_REQUEST_TIMEOUT_MS = '900000';
    const dispatcher = createLLMFetchDispatcher({
      proxyUrl: 'http://proxy.example.com:8080',
    });
    expect(dispatcher).toBeInstanceOf(ProxyAgent);
    expect(getDispatcherTimeouts(dispatcher)).toEqual({
      bodyTimeout: 900000,
      headersTimeout: 900000,
    });
  });

  it('applies the timeout to env proxy dispatchers used by Agent initialize', () => {
    process.env.PROXY = 'http://corporate-proxy:8080';
    process.env.HTTP_REQUEST_TIMEOUT_MS = '900000';
    const dispatcher = createLLMFetchDispatcher({
      proxyUrl: 'http://corporate-proxy:8080',
    });
    expect(dispatcher).toBeInstanceOf(EnvHttpProxyAgent);
    expect(collectBodyTimeouts(dispatcher)).toContain(900000);
  });

  it('keeps SSRF connect agents uncached so lookup closures stay request-scoped', () => {
    const connect = { lookup: jest.fn() } as unknown as LLMFetchDispatcherConnect;
    const first = createLLMFetchDispatcher({ connect });
    const second = createLLMFetchDispatcher({ connect });
    expect(first).toBeInstanceOf(Agent);
    expect(second).not.toBe(first);
    expect(getDispatcherTimeouts(first)).toEqual({
      bodyTimeout: 0,
      headersTimeout: 0,
    });
  });
});
