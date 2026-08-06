import type { TWebSearchConfig } from 'librechat-data-provider';
import type { AxiosRequestConfig } from 'axios';
import type https from 'node:https';
import type http from 'node:http';
import { applySSRFSafeAgentIfDirect, createSSRFSafeAgents } from '../auth';
import { applyAxiosProxyConfig } from '../utils/proxy';

/** Resolved web-search fields that carry an outbound destination. */
const WEB_SEARCH_URL_KEYS = [
  'searxngInstanceUrl',
  'firecrawlApiUrl',
  'jinaApiUrl',
  'tavilySearchUrl',
  'tavilyExtractUrl',
] as const;

export interface WebSearchSSRFAgents {
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}

/**
 * Extends the `applySSRFSafeAgentIfDirect` contract to the web-search tool, which
 * owns its own axios calls and accepts agents rather than a request config.
 *
 * Each configured destination is run through that helper so an IP-literal private
 * target (which Node's connect-time `lookup` never sees) throws before any request
 * is made. Agents are withheld when a proxy owns egress for any destination: one
 * agent pair is shared by every provider, so attaching a direct-connect agent to a
 * proxied connection would both break the request and assert protection the proxy's
 * network context cannot provide.
 */
export function resolveWebSearchSSRFAgents(
  authResult: Partial<TWebSearchConfig>,
  allowedAddresses?: string[] | null,
): WebSearchSSRFAgents {
  let proxied = false;

  for (const key of WEB_SEARCH_URL_KEYS) {
    const url = authResult[key];
    if (typeof url !== 'string' || url.length === 0) {
      continue;
    }

    const probe: AxiosRequestConfig = {};
    applyAxiosProxyConfig(probe, url);
    if (probe.proxy || probe.httpsAgent) {
      proxied = true;
    }

    /** Called for its validation side effect: throws `ESSRF` on a blocked literal target. */
    applySSRFSafeAgentIfDirect({}, url, allowedAddresses);
  }

  if (proxied) {
    return {};
  }

  return createSSRFSafeAgents(allowedAddresses);
}
