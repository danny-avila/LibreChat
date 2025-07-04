const { ProxyAgent } = require('undici');
const { anthropicSettings, removeNullishValues } = require('librechat-data-provider');
const { checkPromptCacheSupport, getClaudeHeaders, configureReasoning } = require('./helpers');

/**
 * Generates configuration options for creating an Anthropic language model (LLM) instance.
 *
 * @param {string} apiKey - The API key for authentication with Anthropic.
 * @param {Object} [options={}] - Additional options for configuring the LLM.
 * @param {Object} [options.modelOptions] - Model-specific options.
 * @param {string} [options.modelOptions.model] - The name of the model to use.
 * @param {number} [options.modelOptions.maxOutputTokens] - The maximum number of tokens to generate.
 * @param {number} [options.modelOptions.temperature] - Controls randomness in output generation.
 * @param {number} [options.modelOptions.topP] - Controls diversity of output generation.
 * @param {number} [options.modelOptions.topK] - Controls the number of top tokens to consider.
 * @param {string[]} [options.modelOptions.stop] - Sequences where the API will stop generating further tokens.
 * @param {boolean} [options.modelOptions.stream] - Whether to stream the response.
 * @param {string} [options.proxy] - Proxy server URL.
 * @param {string} [options.reverseProxyUrl] - URL for a reverse proxy, if used.
 *
 * @returns {Object} Configuration options for creating an Anthropic LLM instance, with null and undefined values removed.
 */
function getLLMConfig(apiKey, options = {}) {
  const systemOptions = {
    thinking: options.modelOptions.thinking ?? anthropicSettings.thinking.default,
    promptCache: options.modelOptions.promptCache ?? anthropicSettings.promptCache.default,
    thinkingBudget: options.modelOptions.thinkingBudget ?? anthropicSettings.thinkingBudget.default,
  };
  for (let key in systemOptions) {
    delete options.modelOptions[key];
  }
  const defaultOptions = {
    model: anthropicSettings.model.default,
    maxOutputTokens: anthropicSettings.maxOutputTokens.default,
    stream: true,
  };

  const mergedOptions = Object.assign(defaultOptions, options.modelOptions);

  /** @type {AnthropicClientOptions} */
  let requestOptions = {
    apiKey,
    model: mergedOptions.model,
    stream: mergedOptions.stream,
    temperature: mergedOptions.temperature,
    stopSequences: mergedOptions.stop,
    maxTokens:
      mergedOptions.maxOutputTokens || anthropicSettings.maxOutputTokens.reset(mergedOptions.model),
    clientOptions: {},
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
    systemOptions.promptCache === true && checkPromptCacheSupport(requestOptions.model);
  const headers = getClaudeHeaders(requestOptions.model, supportsCacheControl);
  if (headers) {
    requestOptions.clientOptions.defaultHeaders = headers;
  }

  if (options.proxy) {
    const proxyAgent = new ProxyAgent(options.proxy);
    requestOptions.clientOptions.fetchOptions = {
      dispatcher: proxyAgent,
    };
  }

  if (options.reverseProxyUrl) {
    requestOptions.clientOptions.baseURL = options.reverseProxyUrl;
    requestOptions.anthropicApiUrl = options.reverseProxyUrl;
  }

  return {
    /** @type {AnthropicClientOptions} */
    llmConfig: removeNullishValues(requestOptions),
  };
}

module.exports = { getLLMConfig };
