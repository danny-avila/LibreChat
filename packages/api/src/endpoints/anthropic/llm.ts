import { Dispatcher, ProxyAgent } from 'undici';
import { AnthropicClientOptions } from '@librechat/agents';
import { anthropicSettings, removeNullishValues } from 'librechat-data-provider';
import type {
  AnthropicConfigOptions,
  AnthropicLLMConfigResult,
  AnthropicParameters,
} from '~/types/anthropic';
import { checkPromptCacheSupport, getClaudeHeaders, configureReasoning } from './helpers';

/**
 * Generates configuration options for creating an Anthropic language model (LLM) instance.
 *
 * @param apiKey - The API key for authentication with Anthropic.
 * @param options={} - Additional options for configuring the LLM.
 * @param options.modelOptions - Model-specific options.
 * @param options.modelOptions.model - The name of the model to use.
 * @param options.modelOptions.maxOutputTokens - The maximum number of tokens to generate.
 * @param options.modelOptions.temperature - Controls randomness in output generation.
 * @param options.modelOptions.topP - Controls diversity of output generation.
 * @param options.modelOptions.topK - Controls the number of top tokens to consider.
 * @param options.modelOptions.stop - Sequences where the API will stop generating further tokens.
 * @param options.modelOptions.stream - Whether to stream the response.
 * @param options.userId - The user ID for tracking and personalization.
 * @param options.proxy - Proxy server URL.
 * @param options.reverseProxyUrl - URL for a reverse proxy, if used.
 *
 * @returns Configuration options for creating an Anthropic LLM instance, with null and undefined values removed.
 */
function getLLMConfig(
  apiKey?: string,
  options: AnthropicConfigOptions = {} as AnthropicConfigOptions,
): AnthropicLLMConfigResult {
  const systemOptions = {
    thinking: options.modelOptions?.thinking ?? anthropicSettings.thinking.default,
    promptCache: options.modelOptions?.promptCache ?? anthropicSettings.promptCache.default,
    thinkingBudget:
      options.modelOptions?.thinkingBudget ?? anthropicSettings.thinkingBudget.default,
  };

  /** Couldn't figure out a way to still loop through the object while deleting the overlapping keys when porting this
   * over from javascript, so for now they are being deleted manually until a better way presents itself.
   */
  if (options.modelOptions) {
    delete options.modelOptions.thinking;
    delete options.modelOptions.promptCache;
    delete options.modelOptions.thinkingBudget;
  } else {
    throw new Error('No modelOptions provided');
  }

  const defaultOptions = {
    model: anthropicSettings.model.default,
    maxOutputTokens: anthropicSettings.maxOutputTokens.default,
    stream: true,
  };

  const mergedOptions = Object.assign(
    defaultOptions,
    options.modelOptions,
  ) as typeof defaultOptions &
    Partial<AnthropicParameters> & { stop?: string[]; web_search?: boolean };

  let requestOptions: AnthropicClientOptions & { stream?: boolean } = {
    apiKey,
    model: mergedOptions.model,
    stream: mergedOptions.stream,
    temperature: mergedOptions.temperature,
    stopSequences: mergedOptions.stop,
    maxTokens:
      mergedOptions.maxOutputTokens || anthropicSettings.maxOutputTokens.reset(mergedOptions.model),
    clientOptions: {},
    invocationKwargs: {
      metadata: {
        user_id: options.userId,
      },
    },
  };

  requestOptions = configureReasoning(requestOptions, systemOptions);

  if (!/claude-3[-.]7/.test(mergedOptions.model)) {
    requestOptions.topP = mergedOptions.topP;
    requestOptions.topK = mergedOptions.topK;
  } else if (requestOptions.thinking == null) {
    requestOptions.topP = mergedOptions.topP;
    requestOptions.topK = mergedOptions.topK;
  }

  const supportsCacheControl =
    systemOptions.promptCache === true && checkPromptCacheSupport(requestOptions.model ?? '');
  const headers = getClaudeHeaders(requestOptions.model ?? '', supportsCacheControl);
  if (headers && requestOptions.clientOptions) {
    requestOptions.clientOptions.defaultHeaders = headers;
  }

  if (options.proxy && requestOptions.clientOptions) {
    const proxyAgent = new ProxyAgent(options.proxy);
    requestOptions.clientOptions.fetchOptions = {
      dispatcher: proxyAgent,
    };
  }

  if (options.reverseProxyUrl && requestOptions.clientOptions) {
    requestOptions.clientOptions.baseURL = options.reverseProxyUrl;
    requestOptions.anthropicApiUrl = options.reverseProxyUrl;
  }

  const tools = [];

  if (mergedOptions.web_search) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
    });
  }

  return {
    tools,
    llmConfig: removeNullishValues(
      requestOptions as Record<string, unknown>,
    ) as AnthropicClientOptions & { clientOptions?: { fetchOptions?: { dispatcher: Dispatcher } } },
  };
}

export { getLLMConfig };
