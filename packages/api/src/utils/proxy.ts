import { HttpsProxyAgent } from 'https-proxy-agent';
import { EnvHttpProxyAgent, ProxyAgent } from 'undici';
import type { AxiosRequestConfig } from 'axios';
import type { Dispatcher } from 'undici';

export type ProxyEnvConfig = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
};

type HttpsProxyAgentInstance = InstanceType<typeof HttpsProxyAgent>;

let envProxyDispatcher: EnvHttpProxyAgent | undefined;
let envProxyDispatcherKey: string | undefined;
const explicitDispatchers = new Map<string, ProxyAgent>();
const httpsProxyAgents = new Map<string, HttpsProxyAgentInstance>();

function getTrimmedEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getProxyEnvConfig(): ProxyEnvConfig | undefined {
  const proxy = getTrimmedEnv('PROXY', 'proxy');
  const noProxy = getTrimmedEnv('no_proxy', 'NO_PROXY');

  if (proxy) {
    return { httpProxy: proxy, httpsProxy: proxy, noProxy };
  }

  const httpProxy = getTrimmedEnv('http_proxy', 'HTTP_PROXY');
  const httpsProxy = getTrimmedEnv('https_proxy', 'HTTPS_PROXY');
  if (!httpProxy && !httpsProxy) return undefined;

  return { httpProxy, httpsProxy, noProxy };
}

function getProxyConfigKey(config: ProxyEnvConfig): string {
  return [config.httpProxy ?? '', config.httpsProxy ?? '', config.noProxy ?? ''].join('|');
}

export function getEnvProxyDispatcher(): Dispatcher | undefined {
  const proxyConfig = getProxyEnvConfig();
  if (!proxyConfig) return undefined;

  const key = getProxyConfigKey(proxyConfig);
  if (!envProxyDispatcher || envProxyDispatcherKey !== key) {
    envProxyDispatcher = new EnvHttpProxyAgent(proxyConfig);
    envProxyDispatcherKey = key;
  }

  return envProxyDispatcher;
}

function getExplicitProxyDispatcher(proxyUrl: string): Dispatcher {
  const cached = explicitDispatchers.get(proxyUrl);
  if (cached) return cached;

  const dispatcher = new ProxyAgent(proxyUrl);
  explicitDispatchers.set(proxyUrl, dispatcher);
  return dispatcher;
}

export function getProxyDispatcher(proxyUrl?: string | null): Dispatcher | undefined {
  const trimmedProxy = proxyUrl?.trim();
  if (!trimmedProxy) return getEnvProxyDispatcher();

  const proxyConfig = getProxyEnvConfig();
  if (proxyConfig?.httpProxy === trimmedProxy && proxyConfig?.httpsProxy === trimmedProxy) {
    return getEnvProxyDispatcher();
  }

  return getExplicitProxyDispatcher(trimmedProxy);
}

function parseUrl(value: string | URL | undefined): URL | undefined {
  if (!value) return undefined;
  if (value instanceof URL) return value;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function getDefaultPort(protocol: string): number {
  if (protocol === 'http:' || protocol === 'ws:') return 80;
  if (protocol === 'https:' || protocol === 'wss:') return 443;
  return 0;
}

function getNoProxyEntry(entry: string): { host: string; port: number } {
  const trimmed = entry.trim();
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return {
      host: normalizeHostname(bracketed[1]),
      port: bracketed[2] ? Number.parseInt(bracketed[2], 10) : 0,
    };
  }

  const parsed = (trimmed.match(/:/g) ?? []).length === 1 ? trimmed.match(/^(.+):(\d+)$/) : null;
  return {
    host: normalizeHostname(parsed ? parsed[1] : trimmed).replace(/^\*\./, '.'),
    port: parsed ? Number.parseInt(parsed[2], 10) : 0,
  };
}

function hostMatchesNoProxy(hostname: string, entryHost: string): boolean {
  if (!entryHost) return false;
  if (entryHost === '*') return true;

  const normalizedEntry = entryHost.startsWith('.') ? entryHost.slice(1) : entryHost;
  return hostname === normalizedEntry || hostname.endsWith(`.${normalizedEntry}`);
}

export function shouldBypassProxy(targetUrl: string | URL, noProxy?: string): boolean {
  if (!noProxy?.trim()) return false;

  const url = parseUrl(targetUrl);
  if (!url) return false;

  const hostname = normalizeHostname(url.hostname);
  const port = Number.parseInt(url.port, 10) || getDefaultPort(url.protocol);

  return noProxy
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((entry) => {
      const parsed = getNoProxyEntry(entry);
      return parsed.port > 0 && parsed.port !== port
        ? false
        : hostMatchesNoProxy(hostname, parsed.host);
    });
}

export function getProxyUrlForUrl(targetUrl?: string | URL): string | undefined {
  const proxyConfig = getProxyEnvConfig();
  if (!proxyConfig) return undefined;

  const url = parseUrl(targetUrl);
  if (url && shouldBypassProxy(url, proxyConfig.noProxy)) return undefined;

  if (!url) return proxyConfig.httpsProxy ?? proxyConfig.httpProxy;
  if (url.protocol === 'http:' || url.protocol === 'ws:') return proxyConfig.httpProxy;
  if (url.protocol === 'https:' || url.protocol === 'wss:') return proxyConfig.httpsProxy;
  return undefined;
}

export function getHttpsProxyAgent(targetUrl?: string | URL): HttpsProxyAgentInstance | undefined {
  const url = parseUrl(targetUrl);
  if (url && url.protocol !== 'https:' && url.protocol !== 'wss:') return undefined;

  const proxyUrl = getProxyUrlForUrl(targetUrl);
  if (!proxyUrl) return undefined;

  const cached = httpsProxyAgents.get(proxyUrl);
  if (cached) return cached;

  const agent = new HttpsProxyAgent(proxyUrl);
  httpsProxyAgents.set(proxyUrl, agent);
  return agent;
}

export function applyAxiosProxyConfig(
  config: AxiosRequestConfig,
  targetUrl?: string | URL,
): AxiosRequestConfig {
  const agent = getHttpsProxyAgent(targetUrl);
  if (!agent) return config;

  config.httpsAgent = agent;
  config.proxy = false;
  return config;
}

export const getOpenIdProxyDispatcher: () => Dispatcher | undefined = getEnvProxyDispatcher;
