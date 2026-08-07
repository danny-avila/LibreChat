import { getProxyForUrl } from 'proxy-from-env';
import type https from 'node:https';
import type http from 'node:http';
import { createSSRFSafeAgents } from '../auth';

export interface WebSearchSSRFAgents {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
}

/**
 * Probe hosts used only to ask which proxy would carry an http and an https request. A public
 * placeholder keeps the answer independent of any real destination.
 */
const HTTP_PROBE_URL = 'http://proxy-probe.example.com/';
const HTTPS_PROBE_URL = 'https://proxy-probe.example.com/';

/**
 * For a plaintext http target Axios repoints the caller's agent at the proxy host, so the
 * connect-time check would resolve the proxy itself and reject a private one. Exempting the
 * proxy endpoint keeps that hop reachable while every direct destination stays guarded.
 * Https targets are unaffected either way: Axios swaps in its own CONNECT tunnel.
 *
 * Resolution goes through `getProxyForUrl`, the same `proxy-from-env` entry point Axios uses, so
 * variable precedence (`<protocol>_proxy` before `all_proxy`, lowercase before uppercase),
 * scheme-less normalization, and `NO_PROXY` all match exactly. Deriving the endpoints any other
 * way risks exempting an address that never carries a request, which grants a bypass.
 */
function getProxyExemptions(): string[] {
  const entries = new Set<string>();
  for (const probeUrl of [HTTP_PROBE_URL, HTTPS_PROBE_URL]) {
    const proxyUrl = getProxyForUrl(probeUrl);
    if (!proxyUrl) {
      continue;
    }
    try {
      /** `hostname` keeps IPv6 brackets, which the exemption parser requires as `[ipv6]:port`. */
      const { hostname, port, protocol } = new URL(proxyUrl);
      /** Axios proxies over http(s) only, so a socks endpoint never carries these requests. */
      if (hostname.length === 0 || (protocol !== 'http:' && protocol !== 'https:')) {
        continue;
      }
      entries.add(`${hostname}:${port || (protocol === 'https:' ? '443' : '80')}`);
    } catch {
      continue;
    }
  }
  return [...entries];
}

/** Keyed by exemption list so repeated tool loads reuse one pooled pair. */
const agentsByExemptions = new Map<string, WebSearchSSRFAgents>();

/** Distinct exemption lists are bounded by admin configuration; the cap only guards a leak. */
const MAX_CACHED_AGENT_PAIRS = 32;

/**
 * Connect-time SSRF agents for the web-search tool, which issues its own requests and accepts
 * only a shared agent pair.
 *
 * Redirect hops traverse these agents, so `blockLiteralHosts` covers a redirect to a private
 * address whether it is named or a literal, which is what `maxRedirects` would otherwise be
 * needed for. A blocked redirect surfaces as `ERR_FR_REDIRECTION_FAILURE` with the `ESSRF`
 * message attached, because `follow-redirects` wraps the agent's error.
 *
 * When a proxy carries the request the proxy resolves the destination, so enforcement there
 * belongs to the proxy's egress policy. The proxy endpoint is exempted for the whole pair rather
 * than per destination, since one shared pair cannot discriminate: a destination that `NO_PROXY`
 * sends direct therefore also carries that exemption.
 */
export function resolveWebSearchSSRFAgents(
  allowedAddresses?: string[] | null,
): WebSearchSSRFAgents {
  const configured = Array.isArray(allowedAddresses) ? allowedAddresses : [];
  const exemptions = [...configured, ...getProxyExemptions()];
  const cacheKey = exemptions.join('\0');

  const cached = agentsByExemptions.get(cacheKey);
  if (cached) {
    return cached;
  }

  const agents = createSSRFSafeAgents(
    exemptions,
    { keepAlive: true, timeout: 5000 },
    { blockLiteralHosts: true },
  );
  if (agentsByExemptions.size >= MAX_CACHED_AGENT_PAIRS) {
    agentsByExemptions.clear();
  }
  agentsByExemptions.set(cacheKey, agents);
  return agents;
}
