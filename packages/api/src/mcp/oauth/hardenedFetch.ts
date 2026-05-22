import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport';
import { createSSRFSafeUndiciConnect, isOAuthUrlAllowed } from '~/auth';

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: Dispatcher;
};

const oauthDispatchers = new Map<string, Agent>();

function getOAuthUrlPort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === 'http:') return '80';
  if (url.protocol === 'https:') return '443';
  return '';
}

function shouldBypassSSRFDispatcher(url: string | URL, allowedDomains?: string[] | null): boolean {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }

  return isOAuthUrlAllowed(url.toString(), allowedDomains, null);
}

function getDispatcherCacheKey(port: string, allowedAddresses?: string[] | null): string {
  return `${port}\0${Array.isArray(allowedAddresses) ? allowedAddresses.join('\n') : ''}`;
}

function getOAuthDispatcher(
  url: string | URL,
  allowedDomains?: string[] | null,
  allowedAddresses?: string[] | null,
): Agent | undefined {
  if (shouldBypassSSRFDispatcher(url, allowedDomains)) {
    return undefined;
  }

  const parsedUrl = url instanceof URL ? url : new URL(url);
  const port = getOAuthUrlPort(parsedUrl);
  const effectiveAddresses =
    Array.isArray(allowedDomains) && allowedDomains.length > 0 ? null : allowedAddresses;
  const cacheKey = getDispatcherCacheKey(port, effectiveAddresses);
  const cached = oauthDispatchers.get(cacheKey);
  if (cached) {
    return cached;
  }

  const dispatcher = new Agent({
    connect: createSSRFSafeUndiciConnect(effectiveAddresses, port),
  });
  oauthDispatchers.set(cacheKey, dispatcher);
  return dispatcher;
}

export function createHardenedOAuthFetch({
  allowedDomains,
  allowedAddresses,
}: {
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
} = {}): FetchLike {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const dispatcher = getOAuthDispatcher(url, allowedDomains, allowedAddresses);
    const fetchInit: FetchInitWithDispatcher =
      dispatcher != null ? { ...init, dispatcher } : { ...init };
    return fetch(url, fetchInit);
  };
}
