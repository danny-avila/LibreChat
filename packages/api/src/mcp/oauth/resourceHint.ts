import { extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport';
import { mcpConfig } from '../mcpConfig';

export interface ResourceHintProbeResult {
  /** URL advertised via the `resource_metadata` parameter of a `WWW-Authenticate: Bearer` header, if any. */
  resourceMetadataUrl?: URL;
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
 * Probes an MCP server for an OAuth 401 challenge and extracts the RFC 6750
 * `WWW-Authenticate` `resource_metadata` hint. Per RFC 9728 §5.1, clients SHOULD prefer
 * that URL over path-aware well-known discovery; the value returned here is meant to be
 * threaded into `discoverOAuthProtectedResourceMetadata` as `opts.resourceMetadataUrl`.
 *
 * Tries HEAD first (cheap). POST still runs unless HEAD already delivered the hint —
 * some servers surface their Bearer challenge parameters only on POST (e.g. StackOverflow),
 * so a HEAD-Bearer-without-hint is not enough to short-circuit discovery.
 *
 * When `fetchFn` is supplied (for example, the OAuth-aware wrapper built by the handler)
 * it is used for both probes so admin-configured `oauthHeaders` are attached — a gateway
 * that requires a static API key to reach the MCP endpoint would otherwise 401 us for the
 * wrong reason and never surface the real Bearer challenge.
 *
 * @returns A `ResourceHintProbeResult` when at least one probe response was observed, or
 * `null` when every attempt threw (DNS failure, timeout, etc.). Callers should treat
 * `null` as "status unknown" and can choose to retry.
 */
export async function probeResourceMetadataHint(
  serverUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<ResourceHintProbeResult | null> {
  const headResult = await probeWithMethod(serverUrl, 'HEAD', fetchFn);
  /**
   * Only short-circuit when HEAD already produced the authoritative hint. A Bearer
   * challenge without `resource_metadata` is not enough: some servers emit the
   * `resource_metadata` parameter only on POST responses, and we'd miss it by
   * bailing here.
   */
  if (headResult?.resourceMetadataUrl) return headResult;

  const postResult = await probeWithMethod(serverUrl, 'POST', fetchFn);
  if (postResult?.resourceMetadataUrl || postResult?.bearerChallenge) {
    // Carry HEAD's auth-challenge observation forward if we got one — the fallback
    // decision is HEAD-only, so POST must not overwrite it back to false.
    return { ...postResult, headAuthChallenge: !!headResult?.headAuthChallenge };
  }

  /**
   * Invariant for callers: a non-null return means the HEAD probe actually observed
   * the server. If HEAD threw (DNS, timeout, reset), signal "unknown" with `null` so
   * the `MCP_OAUTH_ON_AUTH_ERROR` fallback can still retry a fresh HEAD — otherwise a
   * transient HEAD failure plus a normal POST 200 would silently skip the fallback
   * and misclassify an OAuth-required server as open.
   */
  if (!headResult) return null;
  if (postResult) return mergeProbes(headResult, postResult);
  return headResult;
}

function mergeProbes(
  head: ResourceHintProbeResult,
  post: ResourceHintProbeResult,
): ResourceHintProbeResult {
  return {
    resourceMetadataUrl: head.resourceMetadataUrl ?? post.resourceMetadataUrl,
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
    if (!wwwAuth) return { bearerChallenge: false, headAuthChallenge };

    const bearerChallenge = /bearer/i.test(wwwAuth);

    /**
     * The SDK's `extractWWWAuthenticateParams` checks only the *first* token of the
     * header and returns `{}` for multi-scheme challenges like
     * `Basic realm="api", Bearer resource_metadata="..."`. Fall back to our own regex
     * across the whole header so those servers' authoritative hint isn't dropped.
     */
    const sdkParsed = extractWWWAuthenticateParams(response);
    const resourceMetadataUrl = sdkParsed.resourceMetadataUrl ?? extractHintFromHeader(wwwAuth);

    return { resourceMetadataUrl, bearerChallenge, headAuthChallenge };
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
