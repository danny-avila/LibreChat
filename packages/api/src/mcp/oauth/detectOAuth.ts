// ATTENTION: If you modify OAuth detection logic in this file, run the integration tests to verify:
// npx jest --testMatch="**/detectOAuth.integration.dev.ts" (from packages/api directory)
//
// These tests are excluded from CI because they make live HTTP requests to external services,
// which could cause flaky builds due to network issues or changes in third-party endpoints.
// Manual testing ensures the OAuth detection still works against real MCP servers.

import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import { mcpConfig } from '../mcpConfig';

export interface OAuthDetectionResult {
  requiresOAuth: boolean;
  method: 'protected-resource-metadata' | '401-challenge-metadata' | 'no-metadata-found';
  metadata?: Record<string, unknown> | null;
}

/**
 * Detects if an MCP server requires OAuth authentication using proactive discovery methods.
 *
 * This function implements a comprehensive OAuth detection strategy:
 * 1. Standard Protected Resource Metadata (RFC 9728) - checks /.well-known/oauth-protected-resource
 * 2. 401 Challenge Method - checks WWW-Authenticate header for resource_metadata URL
 * 3. Optional fallback: treat any 401/403 response as OAuth requirement (if MCP_OAUTH_ON_AUTH_ERROR=true)
 *
 * @param serverUrl - The MCP server URL to check for OAuth requirements
 * @returns Promise<OAuthDetectionResult> - OAuth requirement details
 */
export async function detectOAuthRequirement(serverUrl: string): Promise<OAuthDetectionResult> {
  const protectedResourceResult = await checkProtectedResourceMetadata(serverUrl);
  if (protectedResourceResult) return protectedResourceResult;

  const challengeResult = await check401ChallengeMetadata(serverUrl);
  if (challengeResult) return challengeResult;

  const fallbackResult = await checkAuthErrorFallback(serverUrl);
  if (fallbackResult) return fallbackResult;

  // No OAuth detected
  return {
    requiresOAuth: false,
    method: 'no-metadata-found',
    metadata: null,
  };
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// ------------------------ Private helper functions for OAuth detection -------------------------//
////////////////////////////////////////////////////////////////////////////////////////////////////

// Checks for OAuth using standard protected resource metadata (RFC 9728)
async function checkProtectedResourceMetadata(
  serverUrl: string,
): Promise<OAuthDetectionResult | null> {
  try {
    const resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);

    if (!resourceMetadata?.authorization_servers?.length) return null;

    return {
      requiresOAuth: true,
      method: 'protected-resource-metadata',
      metadata: resourceMetadata,
    };
  } catch {
    return null;
  }
}

// Checks for OAuth using 401 challenge with resource metadata URL
async function check401ChallengeMetadata(serverUrl: string): Promise<OAuthDetectionResult | null> {
  try {
    const response = await fetch(serverUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
    });

    if (response.status !== 401) return null;

    const wwwAuth = response.headers.get('www-authenticate');
    const metadataUrl = wwwAuth?.match(/resource_metadata="([^"]+)"/)?.[1];
    if (!metadataUrl) return null;

    const metadataResponse = await fetch(metadataUrl, {
      signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
    });
    const metadata = await metadataResponse.json();

    if (!metadata?.authorization_servers?.length) return null;

    return {
      requiresOAuth: true,
      method: '401-challenge-metadata',
      metadata,
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
