const { HttpsProxyAgent } = require('https-proxy-agent');
const { anthropicSettings, removeNullishValues } = require('librechat-data-provider');

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
  const defaultOptions = {
    model: anthropicSettings.model.default,
    maxOutputTokens: anthropicSettings.maxOutputTokens.default,
    stream: true,
  };

  const mergedOptions = Object.assign(defaultOptions, options.modelOptions);

  /** @type {AnthropicClientOptions} */
  const requestOptions = {
    apiKey,
    model: mergedOptions.model,
    stream: mergedOptions.stream,
    temperature: mergedOptions.temperature,
    topP: mergedOptions.topP,
    topK: mergedOptions.topK,
    stopSequences: mergedOptions.stop,
    maxTokens:
      mergedOptions.maxOutputTokens || anthropicSettings.maxOutputTokens.reset(mergedOptions.model),
    clientOptions: {},
  };

  if (options.proxy) {
    requestOptions.clientOptions.httpAgent = new HttpsProxyAgent(options.proxy);
  }

  if (options.reverseProxyUrl) {
    requestOptions.clientOptions.baseURL = options.reverseProxyUrl;
  }

  return { llmConfig: removeNullishValues(requestOptions) };
}

module.exports = { getLLMConfig };
