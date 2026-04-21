import { extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js';
import { mcpConfig } from '../mcpConfig';

export interface ResourceHintProbeResult {
  /** URL advertised via the `resource_metadata` parameter of a `WWW-Authenticate: Bearer` header, if any. */
  resourceMetadataUrl?: URL;
  /** Scope advertised via the `scope` parameter of a `WWW-Authenticate: Bearer` header, if any. */
  scope?: string;
  /** True when the server answered 401 with a `WWW-Authenticate: Bearer` challenge (with or without parameters). */
  bearerChallenge: boolean;
}

/**
 * Probes an MCP server for an OAuth 401 challenge and extracts RFC 6750 `WWW-Authenticate`
 * hints. Per RFC 9728 §5.1, clients SHOULD prefer the `resource_metadata` URL from the
 * challenge over path-aware well-known discovery; the value returned here is meant to be
 * threaded into `discoverOAuthProtectedResourceMetadata` as `opts.resourceMetadataUrl`.
 *
 * Tries `HEAD` first (cheap) then falls back to `POST` — some MCP servers only return 401
 * for methods that carry a body (e.g. StackOverflow's MCP). Returns `null` when no 401
 * challenge was observed or the probe itself failed.
 */
export async function probeResourceMetadataHint(
  serverUrl: string,
): Promise<ResourceHintProbeResult | null> {
  const headResult = await probeWithMethod(serverUrl, 'HEAD');
  if (headResult) return headResult;
  return probeWithMethod(serverUrl, 'POST');
}

async function probeWithMethod(
  serverUrl: string,
  method: 'HEAD' | 'POST',
): Promise<ResourceHintProbeResult | null> {
  try {
    const fetchOptions: RequestInit = {
      method,
      signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
    };

    if (method === 'POST') {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify({});
    }

    const response = await fetch(serverUrl, fetchOptions);
    if (response.status !== 401) return null;

    const wwwAuth = response.headers.get('www-authenticate');
    if (!wwwAuth) return null;

    const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
    const bearerChallenge = /bearer/i.test(wwwAuth);

    /**
     * Only treat a 401 as informative when it actually names Bearer auth or advertises a
     * `resource_metadata` hint. A non-Bearer challenge (e.g. `WWW-Authenticate: Basic`)
     * means the server does not speak OAuth on this method — let the caller retry with
     * POST, which some MCP servers require before they'll surface their Bearer challenge.
     */
    if (!bearerChallenge && !resourceMetadataUrl) return null;

    return { resourceMetadataUrl, scope, bearerChallenge };
  } catch {
    return null;
  }
}
