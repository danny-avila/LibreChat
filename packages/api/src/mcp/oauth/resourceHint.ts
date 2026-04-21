import { extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport';
import { mcpConfig } from '../mcpConfig';

export interface ResourceHintProbeResult {
  /** URL advertised via the `resource_metadata` parameter of a `WWW-Authenticate: Bearer` header, if any. */
  resourceMetadataUrl?: URL;
  /** Scope advertised via the `scope` parameter of a `WWW-Authenticate: Bearer` header, if any. */
  scope?: string;
  /** True when the server answered 401 with a `WWW-Authenticate: Bearer` challenge (with or without parameters). */
  bearerChallenge: boolean;
  /**
   * True when the server returned 401 or 403 to any probe request. Lets callers decide
   * whether the optional `MCP_OAUTH_ON_AUTH_ERROR` fallback applies without issuing a
   * second HEAD request for the same endpoint.
   */
  authChallenge: boolean;
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
 *
 * When `fetchFn` is supplied (for example, the OAuth-aware wrapper built by the handler)
 * it is used for both probes so that admin-configured `oauthHeaders` are attached — a
 * gateway that requires a static API key to reach the MCP endpoint would otherwise 401
 * us for the wrong reason and never surface the real Bearer challenge.
 */
/**
 * Probe outcomes:
 *  - `ResourceHintProbeResult`: at least one probe response was observed. `authChallenge`
 *    reflects whether any method saw a 401/403; `bearerChallenge` / `resourceMetadataUrl`
 *    describe what (if anything) was usable from the challenge.
 *  - `null`: the probe threw on every attempt (e.g. DNS failure, timeout). Callers should
 *    treat this as "status unknown" and decide whether to retry — the optional
 *    `MCP_OAUTH_ON_AUTH_ERROR` fallback still issues its own request in this case.
 */
export async function probeResourceMetadataHint(
  serverUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<ResourceHintProbeResult | null> {
  const headResult = await probeWithMethod(serverUrl, 'HEAD', fetchFn);
  if (headResult?.resourceMetadataUrl || headResult?.bearerChallenge) return headResult;

  const postResult = await probeWithMethod(serverUrl, 'POST', fetchFn);
  if (postResult?.resourceMetadataUrl || postResult?.bearerChallenge) return postResult;

  // No Bearer / hint — collapse to a single result capturing whichever observation(s) we got.
  if (headResult && postResult) return mergeProbes(headResult, postResult);
  return headResult ?? postResult ?? null;
}

function mergeProbes(
  a: ResourceHintProbeResult,
  b: ResourceHintProbeResult,
): ResourceHintProbeResult {
  return {
    resourceMetadataUrl: a.resourceMetadataUrl ?? b.resourceMetadataUrl,
    scope: a.scope ?? b.scope,
    bearerChallenge: a.bearerChallenge || b.bearerChallenge,
    authChallenge: a.authChallenge || b.authChallenge,
  };
}

async function probeWithMethod(
  serverUrl: string,
  method: 'HEAD' | 'POST',
  fetchFn: FetchLike,
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

    const response = await fetchFn(serverUrl, fetchOptions);
    const authChallenge = response.status === 401 || response.status === 403;
    if (response.status !== 401) {
      return { bearerChallenge: false, authChallenge };
    }

    const wwwAuth = response.headers.get('www-authenticate');
    if (!wwwAuth) return { bearerChallenge: false, authChallenge: true };

    const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response);
    const bearerChallenge = /bearer/i.test(wwwAuth);

    return { resourceMetadataUrl, scope, bearerChallenge, authChallenge: true };
  } catch {
    return null;
  }
}
