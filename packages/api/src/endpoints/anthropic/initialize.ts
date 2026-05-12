import { EModelEndpoint, AuthKeys, ErrorTypes } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { BaseInitializeParams, InitializeResultBase, AnthropicConfigOptions } from '~/types';
import { checkUserKeyExpiry, isEnabled, loadServiceKey } from '~/utils';
import { loadAnthropicVertexCredentials, getVertexCredentialOptions } from './vertex';
import { getLLMConfig } from './llm';

/**
 * Initializes Anthropic endpoint configuration.
 * Supports both direct API key authentication and Google Cloud Vertex AI.
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to Anthropic configuration options
 * @throws Error if API key is not provided (when not using Vertex AI)
 */
export async function initializeAnthropic({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const { ANTHROPIC_API_KEY, ANTHROPIC_REVERSE_PROXY, PROXY, GOOGLE_KEY } = process.env;
  const { key: expiresAt } = req.body;

  let credentials: Record<string, unknown> = {};
  let vertexOptions: { region?: string; projectId?: string } | undefined;

  /** @type {undefined | import('librechat-data-provider').TVertexAIConfig} */
  const vertexConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig;

  // Check for Vertex AI configuration: YAML config takes priority over env var
  // When vertexConfig exists and enabled is not explicitly false, Vertex AI is enabled
  const useVertexAI =
    (vertexConfig && vertexConfig.enabled !== false) || isEnabled(process.env.ANTHROPIC_USE_VERTEX);

  if (useVertexAI) {
    /**
     * When Gemini is configured for per-user service-account keys (GOOGLE_KEY=user_provided),
     * reuse the user's stored Google SA JSON for Claude-via-Vertex too. This matches the
     * pattern Gemini already follows in `initializeGoogle` and lets a single per-user SA
     * back both Gemini and Claude on Vertex.
     *
     * Falls back to the file/env-based loader on miss, parse error, or any other failure
     * so the global config path keeps working when a user has not registered a key.
     */
    const userId = req.user?.id;
    const allowPerUserVertex = GOOGLE_KEY === 'user_provided' && !!userId;
    let userServiceKeyLoaded = false;

    if (allowPerUserVertex) {
      try {
        const stored = await db.getUserKey({
          userId: userId as string,
          name: EModelEndpoint.google,
        });

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(stored) as Record<string, unknown>;
        } catch (parseErr) {
          logger.warn(
            '[initializeAnthropic] Failed to parse stored Google key for per-user Vertex; falling back to global service key',
            parseErr,
          );
        }

        const sa = parsed?.[AuthKeys.GOOGLE_SERVICE_KEY];
        if (typeof sa === 'string' && sa.trim() !== '') {
          const loaded = await loadServiceKey(sa);
          if (loaded?.private_key && loaded?.project_id) {
            credentials[AuthKeys.GOOGLE_SERVICE_KEY] = loaded;
            userServiceKeyLoaded = true;
          } else {
            logger.warn(
              '[initializeAnthropic] Stored Google SA key for user missing private_key or project_id; falling back to global service key',
            );
          }
        }
      } catch (err) {
        // NO_USER_KEY: user has not registered a per-user SA; fall back silently.
        // Other errors: log but continue with the global service key so we degrade gracefully.
        const message = err instanceof Error ? err.message : String(err);
        let isNoUserKey = false;
        try {
          const parsed = JSON.parse(message) as { type?: string };
          isNoUserKey = parsed?.type === ErrorTypes.NO_USER_KEY;
        } catch {
          // not a structured error, ignore
        }
        if (!isNoUserKey) {
          logger.warn(
            '[initializeAnthropic] Per-user Vertex SA lookup failed; falling back to global service key',
            err,
          );
        }
      }
    }

    if (!userServiceKeyLoaded) {
      // Load credentials with optional YAML config overrides
      const credentialOptions = vertexConfig ? getVertexCredentialOptions(vertexConfig) : undefined;
      credentials = await loadAnthropicVertexCredentials(credentialOptions);
    }

    // Store vertex options for client creation
    if (vertexConfig) {
      vertexOptions = {
        region: vertexConfig.region,
        projectId: vertexConfig.projectId,
      };
    }
  } else {
    const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';

    const anthropicApiKey = isUserProvided
      ? await db.getUserKey({ userId: req.user?.id ?? '', name: EModelEndpoint.anthropic })
      : ANTHROPIC_API_KEY;

    if (!anthropicApiKey) {
      throw new Error('Anthropic API key not provided. Please provide it again.');
    }

    if (expiresAt && isUserProvided) {
      checkUserKeyExpiry(expiresAt, EModelEndpoint.anthropic);
    }

    credentials[AuthKeys.ANTHROPIC_API_KEY] = anthropicApiKey;
  }

  const clientOptions: AnthropicConfigOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: ANTHROPIC_REVERSE_PROXY ?? undefined,
    modelOptions: {
      ...(model_parameters ?? {}),
      user: req.user?.id,
    },
    // Pass Vertex AI options if configured
    ...(vertexOptions && { vertexOptions }),
    // Pass full Vertex AI config including model mappings
    ...(vertexConfig && { vertexConfig }),
  };

  const anthropicConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic];
  const allConfig = appConfig?.endpoints?.all;

  const result = getLLMConfig(credentials, clientOptions);

  if (anthropicConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = anthropicConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = allConfig.streamRate;
  }

  return result;
}
