import { request } from 'librechat-data-provider';

let sandboxUrl: URL | null = null;

export function getMCPSandboxConfig() {
  if (!sandboxUrl) {
    sandboxUrl = new URL('/api/mcp/sandbox', window.location.origin);
  }
  return { url: sandboxUrl };
}

export async function callMCPAppTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  return request.post('/api/mcp/app-tool-call', {
    serverName,
    toolName,
    arguments: args,
  });
}

const CACHE_MAX_SIZE = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { promise: Promise<unknown>; ts: number };
const resourceCache = new Map<string, CacheEntry>();

export async function readMCPResource(serverName: string, uri: string) {
  const key = `${serverName}:${uri}`;
  const now = Date.now();

  const existing = resourceCache.get(key);
  if (existing && now - existing.ts < CACHE_TTL_MS) {
    return existing.promise;
  }

  if (resourceCache.size >= CACHE_MAX_SIZE) {
    const oldest = resourceCache.keys().next().value;
    if (oldest) {
      resourceCache.delete(oldest);
    }
  }

  const promise = request.post('/api/mcp/resources/read', { serverName, uri });
  resourceCache.set(key, { promise, ts: now });
  promise.catch(() => resourceCache.delete(key));
  return promise;
}
