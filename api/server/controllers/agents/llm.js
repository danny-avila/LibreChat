const { HttpsProxyAgent } = require('https-proxy-agent');
const { resolveHeaders } = require('librechat-data-provider');
const { createLLM } = require('~/app/clients/llm');

/**
 * Initializes and returns a Language Learning Model (LLM) instance.
 *
 * @param {Object} options - Configuration options for the LLM.
 * @param {string} options.model - The model identifier.
 * @param {string} options.modelName - The specific name of the model.
 * @param {number} options.temperature - The temperature setting for the model.
 * @param {number} options.presence_penalty - The presence penalty for the model.
 * @param {number} options.frequency_penalty - The frequency penalty for the model.
 * @param {number} options.max_tokens - The maximum number of tokens for the model output.
 * @param {boolean} options.streaming - Whether to use streaming for the model output.
 * @param {Object} options.context - The context for the conversation.
 * @param {number} options.tokenBuffer - The token buffer size.
 * @param {number} options.initialMessageCount - The initial message count.
 * @param {string} options.conversationId - The ID of the conversation.
 * @param {string} options.user - The user identifier.
 * @param {string} options.langchainProxy - The langchain proxy URL.
 * @param {boolean} options.useOpenRouter - Whether to use OpenRouter.
 * @param {boolean} options.useNovita - Whether to use Novita.
 * @param {Object} options.options - Additional options.
 * @param {Object} options.options.headers - Custom headers for the request.
 * @param {string} options.options.proxy - Proxy URL.
 * @param {Object} options.options.req - The request object.
 * @param {Object} options.options.res - The response object.
 * @param {boolean} options.options.debug - Whether to enable debug mode.
 * @param {string} options.apiKey - The API key for authentication.
 * @param {Object} options.azure - Azure-specific configuration.
 * @param {Object} options.abortController - The AbortController instance.
 * @returns {Object} The initialized LLM instance.
 */
function initializeLLM(options) {
  const {
    model,
    modelName,
    temperature,
    presence_penalty,
    frequency_penalty,
    max_tokens,
    streaming,
    user,
    langchainProxy,
    useOpenRouter,
    useNovita,
    options: { headers, proxy },
    apiKey,
    azure,
  } = options;

  const modelOptions = {
    modelName: modelName || model,
    temperature,
    presence_penalty,
    frequency_penalty,
    user,
  };

  if (max_tokens) {
    modelOptions.max_tokens = max_tokens;
  }

  const configOptions = {};

  if (langchainProxy) {
    configOptions.basePath = langchainProxy;
  }

  if (useOpenRouter) {
    configOptions.basePath = 'https://openrouter.ai/api/v1';
    configOptions.baseOptions = {
      headers: {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
    };
  }

  if (useNovita) {
    configOptions.basePath = 'https://api.novita.ai/v3/openai';
    configOptions.baseOptions = {
      headers: {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
    };
  }

  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    configOptions.baseOptions = {
      headers: resolveHeaders({
        ...headers,
        ...configOptions?.baseOptions?.headers,
      }),
    };
  }

  if (proxy) {
    configOptions.httpAgent = new HttpsProxyAgent(proxy);
    configOptions.httpsAgent = new HttpsProxyAgent(proxy);
  }

  const llm = createLLM({
    modelOptions,
    configOptions,
    openAIApiKey: apiKey,
    azure,
    streaming,
  });

  return llm;
}

module.exports = {
  initializeLLM,
};
