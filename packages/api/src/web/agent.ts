import type https from 'node:https';
import type http from 'node:http';
import { getProxyEnvConfig } from '../utils/proxy';
import { createSSRFSafeAgents } from '../auth';

export interface WebSearchSSRFAgents {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
}

/**
 * For a plaintext http target Axios repoints the caller's agent at the proxy host, so the
 * connect-time check would resolve the proxy itself and reject a private one. Exempting the
 * proxy endpoint keeps that hop reachable while every direct and `NO_PROXY` destination stays
 * guarded. Https targets are unaffected either way: Axios swaps in its own CONNECT tunnel.
 */
function getProxyExemptions(): string[] {
  const config = getProxyEnvConfig();
  if (!config) {
    return [];
  }

  const entries = new Set<string>();
  for (const proxyUrl of [config.httpProxy, config.httpsProxy]) {
    if (!proxyUrl) {
      continue;
    }
    try {
      const { hostname, port, protocol } = new URL(proxyUrl);
      const host = hostname.replace(/^\[|\]$/g, '');
      if (host.length === 0) {
        continue;
      }
      entries.add(`${host}:${port || (protocol === 'https:' ? '443' : '80')}`);
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
