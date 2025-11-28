import path from 'path';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { GoogleAuth } from 'google-auth-library';
import { ClientOptions } from '@anthropic-ai/sdk';
import { AuthKeys } from 'librechat-data-provider';
import { loadServiceKey } from '~/utils/key';
import type { AnthropicCredentials } from '~/types/anthropic';

/**
 * Loads Google service account configuration for Vertex AI
 */
export async function loadAnthropicVertexCredentials(): Promise<AnthropicCredentials> {
  /** Path from environment variable or default location */
  const serviceKeyPath =
    process.env.GOOGLE_SERVICE_KEY_FILE ||
    path.join(__dirname, '..', '..', '..', 'api', 'data', 'auth.json');

  const serviceKey = await loadServiceKey(serviceKeyPath);

  if (!serviceKey) {
    throw new Error(
      `Google service account not found or could not be loaded from ${serviceKeyPath}`,
    );
  }

  return {
    [AuthKeys.GOOGLE_SERVICE_KEY]: serviceKey,
  };
}

/**
 * Checks if credentials are for Vertex AI (has service account key but no API key)
 */
export function isAnthropicVertexCredentials(credentials: AnthropicCredentials): boolean {
  return !!credentials[AuthKeys.GOOGLE_SERVICE_KEY] && !credentials[AuthKeys.ANTHROPIC_API_KEY];
}

/**
 * Filters anthropic-beta header values to only include those supported by Vertex AI.
 * Vertex AI rejects prompt-caching-2024-07-31 but we use 'prompt-caching-vertex' as a
 * marker to trigger cache_control application in the agents package.
 */
function filterVertexHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const filteredHeaders = { ...headers };
  const anthropicBeta = filteredHeaders['anthropic-beta'];

  if (anthropicBeta) {
    // Filter out unsupported beta values for Vertex AI
    const supportedValues = anthropicBeta
      .split(',')
      .map((v) => v.trim())
      .filter((v) => {
        // Remove prompt-caching headers (Vertex handles caching via cache_control in body)
        if (v.includes('prompt-caching')) {
          return false;
        }
        // Remove max-tokens headers (Vertex has its own limits)
        if (v.includes('max-tokens')) {
          return false;
        }
        // Remove output-128k headers
        if (v.includes('output-128k')) {
          return false;
        }
        // Remove token-efficient-tools headers
        if (v.includes('token-efficient-tools')) {
          return false;
        }
        // Remove context-1m headers
        if (v.includes('context-1m')) {
          return false;
        }
        return true;
      });

    if (supportedValues.length > 0) {
      filteredHeaders['anthropic-beta'] = supportedValues.join(',');
    } else {
      delete filteredHeaders['anthropic-beta'];
    }
  }

  return Object.keys(filteredHeaders).length > 0 ? filteredHeaders : undefined;
}

/**
 * Creates and configures a Vertex AI client for Anthropic
 */
export function createAnthropicVertexClient(
  credentials: AnthropicCredentials,
  options?: ClientOptions,
): AnthropicVertex {
  const serviceKey = credentials[AuthKeys.GOOGLE_SERVICE_KEY];
  const region = process.env.ANTHROPIC_VERTEX_REGION || 'global';

  try {
    const googleAuth = new GoogleAuth({
      credentials: serviceKey,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    // Filter out unsupported anthropic-beta header values for Vertex AI
    const filteredOptions = options
      ? {
          ...options,
          defaultHeaders: filterVertexHeaders(
            options.defaultHeaders as Record<string, string> | undefined,
          ),
        }
      : undefined;

    return new AnthropicVertex({
      region: region,
      googleAuth: googleAuth,
      ...filteredOptions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create Vertex AI client: ${message}`);
  }
}
