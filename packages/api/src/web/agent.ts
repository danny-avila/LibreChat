import type https from 'node:https';
import type http from 'node:http';
import { createSSRFSafeAgents } from '../auth';

export interface WebSearchSSRFAgents {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
}

/**
 * Every variable that can put a proxy in front of these requests. Axios resolves a proxy through
 * `proxy-from-env`, which reads `<protocol>_proxy` and then `all_proxy` in either case, so
 * `ALL_PROXY` alone is enough to proxy a request. `PROXY` is LibreChat's own setting, honored by
 * `applyAxiosProxyConfig` on the other egress paths.
 */
const PROXY_ENV_VARS = [
  'PROXY',
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const;

/**
 * For a plaintext http target Axios repoints the caller's agent at the proxy host, so the
 * connect-time check would resolve the proxy itself and reject a private one. Exempting the
 * proxy endpoint keeps that hop reachable while every direct and `NO_PROXY` destination stays
 * guarded. Https targets are unaffected either way: Axios swaps in its own CONNECT tunnel.
 */
function getProxyExemptions(): string[] {
  const entries = new Set<string>();
  for (const name of PROXY_ENV_VARS) {
    const proxyUrl = process.env[name]?.trim();
    if (!proxyUrl) {
      continue;
    }
    try {
      /** `hostname` keeps IPv6 brackets, which the exemption parser requires as `[ipv6]:port`. */
      const { hostname, port, protocol } = new URL(proxyUrl);
      if (hostname.length === 0) {
        continue;
      }
      entries.add(`${hostname}:${port || (protocol === 'https:' ? '443' : '80')}`);
    } catch {
      continue;
    }
  }
  return [...entries];
}

/** Keyed by exemption list so repeated tool loads reuse one pooled pair, as `oauth/tokens` does. */
const agentsByExemptions = new Map<string, WebSearchSSRFAgents>();

/**
 * Connect-time SSRF agents for the web-search tool, which issues its own requests and accepts
 * only a shared agent pair.
 *
 * Redirect hops traverse these agents, so `blockLiteralHosts` covers a redirect to a private
 * address whether it is named or a literal, which is what `maxRedirects` would otherwise be
 * needed for. When a proxy carries the request the proxy resolves the destination, so
 * enforcement there belongs to the proxy's own egress policy.
 */
export function resolveWebSearchSSRFAgents(
  allowedAddresses?: string[] | null,
): WebSearchSSRFAgents {
  const exemptions = [...(allowedAddresses ?? []), ...getProxyExemptions()];
  const cacheKey = exemptions.join('\n');

  const cached = agentsByExemptions.get(cacheKey);
  if (cached) {
    return cached;
  }

  const agents = createSSRFSafeAgents(exemptions, { keepAlive: true }, { blockLiteralHosts: true });
  agentsByExemptions.set(cacheKey, agents);
  return agents;
}
