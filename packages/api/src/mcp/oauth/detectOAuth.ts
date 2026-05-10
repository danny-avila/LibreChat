// ATTENTION: If you modify OAuth detection logic in this file, run the integration tests to verify:
// npx jest --testMatch="**/detectOAuth.integration.dev.ts" (from packages/api directory)
//
// These tests are excluded from CI because they make live HTTP requests to external services,
// which could cause flaky builds due to network issues or changes in third-party endpoints.
// Manual testing ensures the OAuth detection still works against real MCP servers.

import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { isSSRFTarget, resolveHostnameSSRF } from '~/auth';
import { probeResourceMetadataHint } from './resourceHint';
import { mcpConfig } from '../mcpConfig';

export interface OAuthDetectionResult {
  requiresOAuth: boolean;
  method: 'protected-resource-metadata' | '401-challenge-metadata' | 'no-metadata-found';
  metadata?: Record<string, unknown> | null;
}

/**
 * Detects if an MCP server requires OAuth authentication using proactive discovery methods.
 *
 * Strategy (RFC 9728 §5.1 aligned):
 * 1. Probe the server for a 401 challenge and extract the `resource_metadata` URL from
 *    the `WWW-Authenticate` header, if any.
 * 2. Call the SDK's Protected Resource Metadata discovery. When the hint is present it
 *    overrides the path-aware well-known endpoint, matching the behavior of Claude
 *    Desktop / MCP Inspector / Copilot and avoiding stale path-aware metadata.
 * 3. If no metadata was found but the server advertised `Bearer`, report OAuth-required
 *    without metadata (legacy servers without `.well-known` still need auth).
 * 4. Optional fallback: treat any 401/403 as an OAuth requirement when
 *    `MCP_OAUTH_ON_AUTH_ERROR=true`.
 *
 * @param serverUrl - The MCP server URL to check for OAuth requirements
 */
export async function detectOAuthRequirement(serverUrl: string): Promise<OAuthDetectionResult> {
  const hint = await probeResourceMetadataHint(serverUrl);

  /**
   * The `resource_metadata` URL is attacker-controlled (it's echoed from the MCP
   * server's own 401 challenge). Reject hints pointing at private/loopback/metadata
   * addresses before the SDK fetches them, so a malicious server cannot weaponize
   * detection as an SSRF vector against the LibreChat host or its internal network.
   */
  const safeHintUrl = hint?.resourceMetadataUrl
    ? await validateHintUrl(hint.resourceMetadataUrl)
    : undefined;

  const metadataResult = await checkProtectedResourceMetadata(serverUrl, safeHintUrl);
  if (metadataResult) return metadataResult;

  if (hint?.bearerChallenge) {
    return {
      requiresOAuth: true,
      method: '401-challenge-metadata',
      metadata: null,
    };
  }

  /**
   * `MCP_OAUTH_ON_AUTH_ERROR` fallback: honor a 401/403 already observed by the HEAD
   * probe instead of issuing a duplicate HEAD. POST-only 401/403 is intentionally
   * excluded — WAF/CSRF rules commonly 403 a body-less JSON POST on endpoints that
   * have nothing to do with OAuth, and those must not flip detection. A `null` probe
   * means every attempt threw (transient network error); retry once via HEAD so a
   * blip doesn't flip detection to "no OAuth required" for a server that needs it.
   */
  if (mcpConfig.OAUTH_ON_AUTH_ERROR) {
    if (hint?.headAuthChallenge) {
      return {
        requiresOAuth: true,
        method: 'no-metadata-found',
        metadata: null,
      };
    }
    if (hint === null) {
      const fallbackResult = await checkAuthErrorFallback(serverUrl);
      if (fallbackResult) return fallbackResult;
    }
  }

  return {
    requiresOAuth: false,
    method: 'no-metadata-found',
    metadata: null,
  };
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// ------------------------ Private helper functions for OAuth detection -------------------------//
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Fetches RFC 9728 Protected Resource Metadata. When `resourceMetadataUrl` is provided
 * (extracted from the server's `WWW-Authenticate` 401 challenge), the SDK fetches that
 * URL directly; otherwise it falls back to path-aware `/.well-known/oauth-protected-resource`
 * discovery. The `method` reflects which source actually produced the metadata.
 */
async function checkProtectedResourceMetadata(
  serverUrl: string,
  resourceMetadataUrl?: URL,
): Promise<OAuthDetectionResult | null> {
  try {
    const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, {
      resourceMetadataUrl,
    });

    if (!resourceMetadata?.authorization_servers?.length) return null;

    return {
      requiresOAuth: true,
      method: resourceMetadataUrl ? '401-challenge-metadata' : 'protected-resource-metadata',
      metadata: resourceMetadata,
    };
  } catch {
    return null;
  }
}

/**
 * SSRF-guards an attacker-controlled `resource_metadata` hint before the SDK follows it.
 * `detectOAuthRequirement` runs without admin-scoped `allowedDomains`, so the rejection
 * policy here is stricter than the handler's: any private/loopback/metadata-service
 * target is dropped, regardless of origin relative to the MCP server. On rejection the
 * caller continues with path-aware discovery (safe, since it targets the server itself).
 */
async function validateHintUrl(hintUrl: URL): Promise<URL | undefined> {
  try {
    if (isSSRFTarget(hintUrl.hostname)) return undefined;
    if (await resolveHostnameSSRF(hintUrl.hostname)) return undefined;
    return hintUrl;
  } catch {
    // If validation itself fails (e.g. DNS lookup threw), be conservative and drop the hint.
    return undefined;
  }
}

// Fallback: only called when probing threw. Caller already gates on `OAUTH_ON_AUTH_ERROR`.
async function checkAuthErrorFallback(serverUrl: string): Promise<OAuthDetectionResult | null> {
  try {
    const response = await fetch(serverUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
    });

    if (response.status !== 401 && response.status !== 403) return null;

    return {
      requiresOAuth: true,
      method: 'no-metadata-found',
      metadata: null,
    };
  } catch {
    return null;
  }
}
