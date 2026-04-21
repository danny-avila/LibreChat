// ATTENTION: If you modify OAuth detection logic in this file, run the integration tests to verify:
// npx jest --testMatch="**/detectOAuth.integration.dev.ts" (from packages/api directory)
//
// These tests are excluded from CI because they make live HTTP requests to external services,
// which could cause flaky builds due to network issues or changes in third-party endpoints.
// Manual testing ensures the OAuth detection still works against real MCP servers.

import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
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

  const metadataResult = await checkProtectedResourceMetadata(serverUrl, hint?.resourceMetadataUrl);
  if (metadataResult) return metadataResult;

  if (hint?.bearerChallenge) {
    return {
      requiresOAuth: true,
      method: '401-challenge-metadata',
      metadata: null,
    };
  }

  const fallbackResult = await checkAuthErrorFallback(serverUrl);
  if (fallbackResult) return fallbackResult;

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

// Fallback method: treats any auth error as OAuth requirement if configured
async function checkAuthErrorFallback(serverUrl: string): Promise<OAuthDetectionResult | null> {
  try {
    if (!mcpConfig.OAUTH_ON_AUTH_ERROR) return null;

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
