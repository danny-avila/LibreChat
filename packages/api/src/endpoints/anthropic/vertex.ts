import path from 'path';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { GoogleAuth } from 'google-auth-library';
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
 * Creates and configures a Vertex AI client for Anthropic
 */
export function createAnthropicVertexClient(credentials: AnthropicCredentials): AnthropicVertex {
  const serviceKey = credentials[AuthKeys.GOOGLE_SERVICE_KEY];
  const region = process.env.ANTHROPIC_VERTEX_REGION || 'global';

  try {
    const googleAuth = new GoogleAuth({
      credentials: serviceKey,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    return new AnthropicVertex({
      region: region,
      googleAuth: googleAuth,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create Vertex AI client: ${message}`);
  }
}
