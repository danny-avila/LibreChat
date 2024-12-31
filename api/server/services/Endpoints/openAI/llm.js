const { HttpsProxyAgent } = require('https-proxy-agent');
const { sanitizeModelName, constructAzureURL } = require('~/utils');
const { isEnabled } = require('~/server/utils');

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param {string} apiKey - The API key for authentication.
 * @param {Object} options - Additional options for configuring the LLM.
 * @param {Object} [options.modelOptions] - Model-specific options.
 * @param {string} [options.modelOptions.model] - The name of the model to use.
 * @param {number} [options.modelOptions.temperature] - Controls randomness in output generation (0-2).
 * @param {number} [options.modelOptions.top_p] - Controls diversity via nucleus sampling (0-1).
 * @param {number} [options.modelOptions.frequency_penalty] - Reduces repetition of token sequences (-2 to 2).
 * @param {number} [options.modelOptions.presence_penalty] - Encourages discussing new topics (-2 to 2).
 * @param {number} [options.modelOptions.max_tokens] - The maximum number of tokens to generate.
 * @param {string[]} [options.modelOptions.stop] - Sequences where the API will stop generating further tokens.
 * @param {string} [options.reverseProxyUrl] - URL for a reverse proxy, if used.
 * @param {boolean} [options.useOpenRouter] - Flag to use OpenRouter API.
 * @param {Object} [options.headers] - Additional headers for API requests.
 * @param {string} [options.proxy] - Proxy server URL.
 * @param {Object} [options.azure] - Azure-specific configurations.
 * @param {boolean} [options.streaming] - Whether to use streaming mode.
 * @param {Object} [options.addParams] - Additional parameters to add to the model options.
 * @param {string[]} [options.dropParams] - Parameters to remove from the model options.
 * @returns {Object} Configuration options for creating an LLM instance.
 */
function getLLMConfig(apiKey, options = {}) {
  const {
    modelOptions = {},
    reverseProxyUrl,
    useOpenRouter,
    defaultQuery,
    headers,
    proxy,
    azure,
    streaming = true,
    addParams,
    dropParams,
  } = options;

  /** @type {OpenAIClientOptions} */
  let llmConfig = {
    streaming,
  };

  Object.assign(llmConfig, modelOptions);

  if (addParams && typeof addParams === 'object') {
    Object.assign(llmConfig, addParams);
  }

  if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      delete llmConfig[param];
    });
  }

  /** @type {OpenAIClientOptions['configuration']} */
  const configOptions = {};

  // Handle OpenRouter or custom reverse proxy
  if (useOpenRouter || reverseProxyUrl === 'https://openrouter.ai/api/v1') {
    configOptions.baseURL = 'https://openrouter.ai/api/v1';
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
      headers,
    );
  } else if (reverseProxyUrl) {
    configOptions.baseURL = reverseProxyUrl;
    if (headers) {
      configOptions.defaultHeaders = headers;
    }
  }

  if (defaultQuery) {
    configOptions.defaultQuery = defaultQuery;
  }

  if (proxy) {
    const proxyAgent = new HttpsProxyAgent(proxy);
    Object.assign(configOptions, {
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
    });
  }

  if (azure) {
    const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);
    azure.azureOpenAIApiDeploymentName = useModelName
      ? sanitizeModelName(llmConfig.model)
      : azure.azureOpenAIApiDeploymentName;

    if (process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      llmConfig.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    }

    if (configOptions.baseURL) {
      const azureURL = constructAzureURL({
        baseURL: configOptions.baseURL,
        azureOptions: azure,
      });
      azure.azureOpenAIBasePath = azureURL.split(`/${azure.azureOpenAIApiDeploymentName}`)[0];
    }

    Object.assign(llmConfig, azure);
    llmConfig.model = llmConfig.azureOpenAIApiDeploymentName;
  } else {
    llmConfig.openAIApiKey = apiKey;
    // Object.assign(llmConfig, {
    //   configuration: { apiKey },
    // });
  }

  if (process.env.OPENAI_ORGANIZATION && this.azure) {
    llmConfig.organization = process.env.OPENAI_ORGANIZATION;
  }

  return {
    /** @type {OpenAIClientOptions} */
    llmConfig,
    /** @type {OpenAIClientOptions['configuration']} */
    configOptions,
  };
}

module.exports = { getLLMConfig };
