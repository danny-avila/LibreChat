import { request } from 'librechat-data-provider';

export function getMCPSandboxUrl(): string {
  const configured = (import.meta.env as Record<string, string | undefined>).VITE_MCP_SANDBOX_URL;
  if (configured) return configured;
  return `${window.location.origin}/api/mcp/sandbox`;
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

export async function readMCPResource(serverName: string, uri: string, userId?: string) {
  const key = `${userId ?? ''}:${serverName}:${uri}`;
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

type ResourceUiMeta = {
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
  permissions?: {
    camera?: Record<string, never>;
    microphone?: Record<string, never>;
    geolocation?: Record<string, never>;
    clipboardWrite?: Record<string, never>;
  };
};

export async function fetchMCPResourceHtml(
  serverName: string,
  uri: string,
  userId?: string,
): Promise<{
  html: string;
  csp?: ResourceUiMeta['csp'];
  permissions?: ResourceUiMeta['permissions'];
}> {
  const result = (await readMCPResource(serverName, uri, userId)) as {
    contents?: Array<{ text?: string; _meta?: { ui?: ResourceUiMeta } }>;
  };
  const item = result?.contents?.[0];
  const uiMeta = item?._meta?.ui;
  return {
    html: item?.text ?? '',
    csp: uiMeta?.csp,
    permissions: uiMeta?.permissions,
  };
}
