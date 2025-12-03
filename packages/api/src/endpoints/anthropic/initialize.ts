import { EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams, InitializeResultBase, AnthropicConfigOptions } from '~/types';
import { checkUserKeyExpiry } from '~/utils';
import { getLLMConfig } from './llm';

/**
 * Initializes Anthropic endpoint configuration.
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to Anthropic configuration options
 * @throws Error if API key is not provided
 */
export async function initializeAnthropic({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const { ANTHROPIC_API_KEY, ANTHROPIC_REVERSE_PROXY, PROXY } = process.env;
  const { key: expiresAt } = req.body;
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

  let clientOptions: AnthropicConfigOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const anthropicConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic];

  if (anthropicConfig) {
    clientOptions = {
      ...clientOptions,
      // Note: _lc_stream_delay is set on modelOptions in the result
    };
  }

  const allConfig = appConfig?.endpoints?.all;

  clientOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: ANTHROPIC_REVERSE_PROXY ?? undefined,
    modelOptions: {
      ...(model_parameters ?? {}),
      user: req.user?.id,
    },
    ...clientOptions,
  };

  const result = getLLMConfig(anthropicApiKey, clientOptions);

  // Apply stream rate delay
  if (anthropicConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = anthropicConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = allConfig.streamRate;
  }

  return result;
}
