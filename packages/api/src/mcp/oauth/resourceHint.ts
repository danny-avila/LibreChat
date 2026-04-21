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
   * True when the *HEAD* probe specifically returned 401 or 403. Matches the semantics
   * of the legacy `MCP_OAUTH_ON_AUTH_ERROR` HEAD-only fallback so the caller can skip a
   * redundant HEAD. POST-only 401/403 is intentionally excluded — servers commonly 403
   * a body-less JSON POST for WAF/CSRF reasons unrelated to OAuth, and those should not
   * flip the fallback.
   */
  headAuthChallenge: boolean;
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
  if (postResult?.resourceMetadataUrl || postResult?.bearerChallenge) {
    // Carry HEAD's auth-challenge observation forward if we got one — the fallback
    // decision is HEAD-only, so POST must not overwrite it back to false.
    return { ...postResult, headAuthChallenge: !!headResult?.headAuthChallenge };
  }

  if (headResult && postResult) return mergeProbes(headResult, postResult);
  return headResult ?? postResult ?? null;
}

function mergeProbes(
  head: ResourceHintProbeResult,
  post: ResourceHintProbeResult,
): ResourceHintProbeResult {
  return {
    resourceMetadataUrl: head.resourceMetadataUrl ?? post.resourceMetadataUrl,
    scope: head.scope ?? post.scope,
    bearerChallenge: head.bearerChallenge || post.bearerChallenge,
    /**
     * Only HEAD's observation feeds the fallback decision — POST-only 401/403 is too
     * noisy a signal (WAF/CSRF rules routinely 403 a body-less JSON POST on endpoints
     * that are not OAuth-protected at all).
     */
    headAuthChallenge: head.headAuthChallenge,
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
    const headAuthChallenge =
      method === 'HEAD' && (response.status === 401 || response.status === 403);

    if (response.status !== 401) {
      return { bearerChallenge: false, headAuthChallenge };
    }

    const wwwAuth = response.headers.get('www-authenticate');
    const bearerChallenge = !!wwwAuth && /bearer/i.test(wwwAuth);

    if (!wwwAuth) return { bearerChallenge: false, headAuthChallenge };

    /**
     * The SDK's `extractWWWAuthenticateParams` checks only the *first* token of the
     * header and returns `{}` for multi-scheme challenges like
     * `Basic realm="api", Bearer resource_metadata="..."`. Fall back to our own regex
     * across the whole header so those servers' authoritative hint isn't dropped.
     */
    const sdkParsed = extractWWWAuthenticateParams(response);
    const resourceMetadataUrl = sdkParsed.resourceMetadataUrl ?? extractHintFromHeader(wwwAuth);
    const scope = sdkParsed.scope ?? extractScopeFromHeader(wwwAuth);

    return { resourceMetadataUrl, scope, bearerChallenge, headAuthChallenge };
  } catch {
    return null;
  }
}

function extractHintFromHeader(header: string): URL | undefined {
  const match = /resource_metadata="([^"]+)"/.exec(header);
  if (!match?.[1]) return undefined;
  try {
    return new URL(match[1]);
  } catch {
    return undefined;
  }
}

function extractScopeFromHeader(header: string): string | undefined {
  const match = /\bscope="([^"]+)"/.exec(header);
  return match?.[1];
}
