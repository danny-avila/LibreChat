import { Dispatcher, ProxyAgent } from 'undici';
import { AnthropicClientOptions } from '@librechat/agents';
import { anthropicSettings, removeNullishValues, AuthKeys } from 'librechat-data-provider';
import type {
  AnthropicLLMConfigResult,
  AnthropicConfigOptions,
  AnthropicCredentials,
} from '~/types/anthropic';
import { checkPromptCacheSupport, getClaudeHeaders, configureReasoning } from './helpers';
import { createAnthropicVertexClient, isAnthropicVertexCredentials } from './vertex';

/**
 * Parses credentials from string or object format
 */
function parseCredentials(
  credentials: string | AnthropicCredentials | undefined,
): AnthropicCredentials {
  if (typeof credentials === 'string') {
    try {
      return JSON.parse(credentials);
    } catch (err: unknown) {
      throw new Error(
        `Error parsing string credentials: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }
  return credentials && typeof credentials === 'object' ? credentials : {};
}

/** Known Anthropic parameters that map directly to the client config */
export const knownAnthropicParams = new Set([
  'model',
  'temperature',
  'topP',
  'topK',
  'maxTokens',
  'maxOutputTokens',
  'stopSequences',
  'stop',
  'stream',
  'apiKey',
  'maxRetries',
  'timeout',
  'anthropicVersion',
  'anthropicApiUrl',
  'defaultHeaders',
]);

/**
 * Applies default parameters to the target object only if the field is undefined
 * @param target - The target object to apply defaults to
 * @param defaults - Record of default parameter values
 */
function applyDefaultParams(target: Record<string, unknown>, defaults: Record<string, unknown>) {
  for (const [key, value] of Object.entries(defaults)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

/**
 * Generates configuration options for creating an Anthropic language model (LLM) instance.
 * @param credentials - The API key for authentication with Anthropic, or credentials object for Vertex AI.
 * @param options={} - Additional options for configuring the LLM.
 * @returns Configuration options for creating an Anthropic LLM instance, with null and undefined values removed.
 */
function getLLMConfig(
  credentials: string | AnthropicCredentials | undefined,
  options: AnthropicConfigOptions = {},
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
    stream: true,
  };

  const mergedOptions = Object.assign(defaultOptions, options.modelOptions);

  let enableWebSearch = mergedOptions.web_search;

  let requestOptions: AnthropicClientOptions & { stream?: boolean } = {
    model: mergedOptions.model,
    stream: mergedOptions.stream,
    temperature: mergedOptions.temperature,
    stopSequences: mergedOptions.stop,
    maxTokens:
      mergedOptions.maxOutputTokens || anthropicSettings.maxOutputTokens.reset(mergedOptions.model),
    clientOptions: {},
    invocationKwargs: {
      metadata: {
        user_id: mergedOptions.user,
      },
    },
  };

  const creds = parseCredentials(credentials);
  const apiKey = creds[AuthKeys.ANTHROPIC_API_KEY] ?? null;

  if (isAnthropicVertexCredentials(creds)) {
    // Vertex AI configuration - use custom client
    requestOptions.createClient = () => createAnthropicVertexClient(creds);
  } else if (apiKey) {
    // Direct API configuration
    requestOptions.apiKey = apiKey;
  } else {
    throw new Error(
      'Invalid credentials provided. Please provide either a valid Anthropic API key or service account credentials for Vertex AI.',
    );
  }

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

  /** Handle defaultParams first - only process Anthropic-native params if undefined */
  if (options.defaultParams && typeof options.defaultParams === 'object') {
    for (const [key, value] of Object.entries(options.defaultParams)) {
      /** Handle web_search separately - don't add to config */
      if (key === 'web_search') {
        if (enableWebSearch === undefined && typeof value === 'boolean') {
          enableWebSearch = value;
        }
        continue;
      }

      if (knownAnthropicParams.has(key)) {
        /** Route known Anthropic params to requestOptions only if undefined */
        applyDefaultParams(requestOptions as Record<string, unknown>, { [key]: value });
      }
      /** Leave other params for transform to handle - they might be OpenAI params */
    }
  }

  /** Handle addParams - can override defaultParams */
  if (options.addParams && typeof options.addParams === 'object') {
    for (const [key, value] of Object.entries(options.addParams)) {
      /** Handle web_search separately - don't add to config */
      if (key === 'web_search') {
        if (typeof value === 'boolean') {
          enableWebSearch = value;
        }
        continue;
      }

      if (knownAnthropicParams.has(key)) {
        /** Route known Anthropic params to requestOptions */
        (requestOptions as Record<string, unknown>)[key] = value;
      }
      /** Leave other params for transform to handle - they might be OpenAI params */
    }
  }

  /** Handle dropParams - only drop from Anthropic config */
  if (options.dropParams && Array.isArray(options.dropParams)) {
    options.dropParams.forEach((param) => {
      if (param === 'web_search') {
        enableWebSearch = false;
        return;
      }

      if (param in requestOptions) {
        delete requestOptions[param as keyof AnthropicClientOptions];
      }
      if (requestOptions.invocationKwargs && param in requestOptions.invocationKwargs) {
        delete (requestOptions.invocationKwargs as Record<string, unknown>)[param];
      }
    });
  }

  const tools = [];

  if (enableWebSearch) {
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
