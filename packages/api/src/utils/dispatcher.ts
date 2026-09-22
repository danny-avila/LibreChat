import { Agent, EnvHttpProxyAgent, ProxyAgent } from 'undici';
import type { LookupFunction } from 'node:net';
import type { Dispatcher } from 'undici';
import { getProxyEnvConfig } from './proxy';

export type LLMFetchDispatcherConnect = {
  lookup: LookupFunction;
};

export type LLMFetchDispatcherOptions = {
  proxyUrl?: string | null;
  connect?: LLMFetchDispatcherConnect;
  environment?: NodeJS.ProcessEnv;
};

const dispatcherCache = new Map<string, Dispatcher>();

function timeoutOptions(timeoutMs: number): { bodyTimeout: number; headersTimeout: number } {
  return { bodyTimeout: timeoutMs, headersTimeout: timeoutMs };
}

function getCachedDispatcher(key: string, create: () => Dispatcher): Dispatcher {
  const cached = dispatcherCache.get(key);
  if (cached) {
    return cached;
  }

  const dispatcher = create();
  dispatcherCache.set(key, dispatcher);
  return dispatcher;
}

function getProxyConfigKey(config: {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
}): string {
  return [config.httpProxy ?? '', config.httpsProxy ?? '', config.noProxy ?? ''].join('|');
}

/**
 * Parses `HTTP_REQUEST_TIMEOUT_MS`. `0` disables the timeout; invalid values
 * are ignored so a typo cannot silently cap Agent runs.
 */
export function parseHttpRequestTimeoutMs(
  environment: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = environment.HTTP_REQUEST_TIMEOUT_MS;
  if (raw == null || raw.trim() === '') {
    return undefined;
  }

  const timeout = Number(raw);
  return Number.isSafeInteger(timeout) && timeout >= 0 ? timeout : undefined;
}

/**
 * Idle timeout for outbound LLM HTTP headers/body. `0` disables undici's 300s
 * default so long-running Agent streams are not cut off. When
 * `HTTP_REQUEST_TIMEOUT_MS` is set (including `0`), that value is used.
 */
export function getLLMFetchTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  return parseHttpRequestTimeoutMs(environment) ?? 0;
}

/**
 * Returns an undici dispatcher whose body/header idle timeouts follow
 * `HTTP_REQUEST_TIMEOUT_MS` (or `0` when unset). Direct agents are cached;
 * SSRF `connect` dispatchers are not, matching the per-call agents those
 * paths already created.
 */
export function createLLMFetchDispatcher(options: LLMFetchDispatcherOptions = {}): Dispatcher {
  const environment = options.environment ?? process.env;
  const timeoutMs = getLLMFetchTimeoutMs(environment);
  const timeouts = timeoutOptions(timeoutMs);

  if (options.connect != null) {
    return new Agent({
      ...timeouts,
      connect: options.connect,
    });
  }

  const trimmedProxy = options.proxyUrl?.trim();
  const proxyConfig = getProxyEnvConfig();

  if (trimmedProxy) {
    if (proxyConfig?.httpProxy === trimmedProxy && proxyConfig?.httpsProxy === trimmedProxy) {
      const key = `env:${timeoutMs}:${getProxyConfigKey(proxyConfig)}`;
      return getCachedDispatcher(
        key,
        () =>
          new EnvHttpProxyAgent({
            ...proxyConfig,
            ...timeouts,
          }),
      );
    }

    const key = `proxy:${timeoutMs}:${trimmedProxy}`;
    return getCachedDispatcher(
      key,
      () =>
        new ProxyAgent({
          uri: trimmedProxy,
          ...timeouts,
        }),
    );
  }

  if (proxyConfig) {
    const key = `env:${timeoutMs}:${getProxyConfigKey(proxyConfig)}`;
    return getCachedDispatcher(
      key,
      () =>
        new EnvHttpProxyAgent({
          ...proxyConfig,
          ...timeouts,
        }),
    );
  }

  return getCachedDispatcher(`direct:${timeoutMs}`, () => new Agent(timeouts));
}

export function resetLLMFetchDispatchers(): void {
  for (const dispatcher of dispatcherCache.values()) {
    dispatcher.destroy();
  }
  dispatcherCache.clear();
}
