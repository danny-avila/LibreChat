const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint, defaultModels, CacheKeys } = require('librechat-data-provider');
const { extractBaseURL, inputSchema, processModelData, logAxiosError } = require('~/utils');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('~/config');

const { openAIApiKey, userProvidedOpenAI } = require('./Config/EndpointService').config;

/**
 * Extracts the base URL from the provided URL.
 * @param {string} fullURL - The full URL.
 * @returns {string} The base URL.
 */
function deriveBaseURL(fullURL) {
  try {
    const parsedUrl = new URL(fullURL);
    const protocol = parsedUrl.protocol;
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port;

    // Check if the parsed URL components are meaningful
    if (!protocol || !hostname) {
      return fullURL;
    }

    // Reconstruct the base URL
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  } catch (error) {
    logger.error('Failed to derive base URL', error);
    return fullURL; // Return the original URL in case of any exception
  }
}

/**
 * Fetches Ollama models from the specified base API path.
 * @param {string} baseURL
 * @returns {Promise<string[]>} The Ollama models.
 */
const fetchOllamaModels = async (baseURL) => {
  let models = [];
  if (!baseURL) {
    return models;
  }
  try {
    const ollamaEndpoint = deriveBaseURL(baseURL);
    /** @type {Promise<AxiosResponse<OllamaListResponse>>} */
    const response = await axios.get(`${ollamaEndpoint}/api/tags`);
    models = response.data.models.map((tag) => tag.name);
    return models;
  } catch (error) {
    const logMessage =
      'Failed to fetch models from Ollama API. If you are not using Ollama directly, and instead, through some aggregator or reverse proxy that handles fetching via OpenAI spec, ensure the name of the endpoint doesn\'t start with `ollama` (case-insensitive).';
    logger.error(logMessage, error);
    return [];
  }
};

/**
 * Fetches OpenAI models from the specified base API path or Azure, based on the provided configuration.
 *
 * @param {Object} params - The parameters for fetching the models.
 * @param {Object} params.user - The user ID to send to the API.
 * @param {string} params.apiKey - The API key for authentication with the API.
 * @param {string} params.baseURL - The base path URL for the API.
 * @param {string} [params.name='OpenAI'] - The name of the API; defaults to 'OpenAI'.
 * @param {boolean} [params.azure=false] - Whether to fetch models from Azure.
 * @param {boolean} [params.userIdQuery=false] - Whether to send the user ID as a query parameter.
 * @param {boolean} [params.createTokenConfig=true] - Whether to create a token configuration from the API response.
 * @param {string} [params.tokenKey] - The cache key to save the token configuration. Uses `name` if omitted.
 * @returns {Promise<string[]>} A promise that resolves to an array of model identifiers.
 * @async
 */
const fetchModels = async ({
  user,
  apiKey,
  baseURL,
  name = 'OpenAI',
  azure = false,
  userIdQuery = false,
  createTokenConfig = true,
  tokenKey,
}) => {
  let models = [];

  if (!baseURL && !azure) {
    return models;
  }

  if (!apiKey) {
    return models;
  }

  if (name && name.toLowerCase().startsWith('ollama')) {
    return await fetchOllamaModels(baseURL);
  }

  try {
    const options = {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    };

    if (process.env.PROXY) {
      options.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
    }

    if (process.env.OPENAI_ORGANIZATION && baseURL.includes('openai')) {
      options.headers['OpenAI-Organization'] = process.env.OPENAI_ORGANIZATION;
    }

    const url = new URL(`${baseURL}${azure ? '' : '/models'}`);
    if (user && userIdQuery) {
      url.searchParams.append('user', user);
    }
    const res = await axios.get(url.toString(), options);

    /** @type {z.infer<typeof inputSchema>} */
    const input = res.data;

    const validationResult = inputSchema.safeParse(input);
    if (validationResult.success && createTokenConfig) {
      const endpointTokenConfig = processModelData(input);
      const cache = getLogStores(CacheKeys.TOKEN_CONFIG);
      await cache.set(tokenKey ?? name, endpointTokenConfig);
    }
    models = input.data.map((item) => item.id);
  } catch (error) {
    const logMessage = `Failed to fetch models from ${azure ? 'Azure ' : ''}${name} API`;
    logAxiosError({ message: logMessage, error });
  }

  return models;
};

/**
 * Fetches models from the specified API path or Azure, based on the provided options.
 * @async
 * @function
 * @param {object} opts - The options for fetching the models.
 * @param {string} opts.user - The user ID to send to the API.
 * @param {boolean} [opts.azure=false] - Whether to fetch models from Azure.
 * @param {boolean} [opts.plugins=false] - Whether to fetch models from the plugins.
 * @param {string[]} [_models=[]] - The models to use as a fallback.
 */
const fetchOpenAIModels = async (opts, _models = []) => {
  let models = _models.slice() ?? [];
  let apiKey = openAIApiKey;
  const openaiBaseURL = 'https://api.openai.com/v1';
  let baseURL = openaiBaseURL;
  let reverseProxyUrl = process.env.OPENAI_REVERSE_PROXY;
  if (opts.azure) {
    return models;
    // const azure = getAzureCredentials();
    // baseURL = (genAzureChatCompletion(azure))
    //   .split('/deployments')[0]
    //   .concat(`/models?api-version=${azure.azureOpenAIApiVersion}`);
    // apiKey = azureOpenAIApiKey;
  } else if (process.env.OPENROUTER_API_KEY) {
    reverseProxyUrl = 'https://openrouter.ai/api/v1';
    apiKey = process.env.OPENROUTER_API_KEY;
  }

  if (reverseProxyUrl) {
    baseURL = extractBaseURL(reverseProxyUrl);
  }

  const modelsCache = getLogStores(CacheKeys.MODEL_QUERIES);

  const cachedModels = await modelsCache.get(baseURL);
  if (cachedModels) {
    return cachedModels;
  }

  if (baseURL || opts.azure) {
    models = await fetchModels({
      apiKey,
      baseURL,
      azure: opts.azure,
      user: opts.user,
    });
  }

  if (models.length === 0) {
    return _models;
  }

  if (baseURL === openaiBaseURL) {
    const regex = /(text-davinci-003|gpt-)/;
    models = models.filter((model) => regex.test(model));
    const instructModels = models.filter((model) => model.includes('instruct'));
    const otherModels = models.filter((model) => !model.includes('instruct'));
    models = otherModels.concat(instructModels);
  }

  await modelsCache.set(baseURL, models);
  return models;
};

/**
 * Loads the default models for the application.
 * @async
 * @function
 * @param {object} opts - The options for fetching the models.
 * @param {string} opts.user - The user ID to send to the API.
 * @param {boolean} [opts.azure=false] - Whether to fetch models from Azure.
 * @param {boolean} [opts.plugins=false] - Whether to fetch models from the plugins.
 */
const getOpenAIModels = async (opts) => {
  let models = defaultModels[EModelEndpoint.openAI];

  if (opts.assistants) {
    models = defaultModels[EModelEndpoint.assistants];
  }

  if (opts.plugins) {
    models = models.filter(
      (model) =>
        !model.includes('text-davinci') &&
        !model.includes('instruct') &&
        !model.includes('0613') &&
        !model.includes('0314') &&
        !model.includes('0301'),
    );
  }

  let key;
  if (opts.assistants) {
    key = 'ASSISTANTS_MODELS';
  } else if (opts.azure) {
    key = 'AZURE_OPENAI_MODELS';
  } else if (opts.plugins) {
    key = 'PLUGIN_MODELS';
  } else {
    key = 'OPENAI_MODELS';
  }

  if (process.env[key]) {
    models = String(process.env[key]).split(',');
    return models;
  }

  if (userProvidedOpenAI && !process.env.OPENROUTER_API_KEY) {
    return models;
  }

  if (opts.assistants) {
    return models;
  }

  return await fetchOpenAIModels(opts, models);
};

const getChatGPTBrowserModels = () => {
  let models = ['text-davinci-002-render-sha', 'gpt-4'];
  if (process.env.CHATGPT_MODELS) {
    models = String(process.env.CHATGPT_MODELS).split(',');
  }

  return models;
};

const getAnthropicModels = () => {
  let models = defaultModels[EModelEndpoint.anthropic];
  if (process.env.ANTHROPIC_MODELS) {
    models = String(process.env.ANTHROPIC_MODELS).split(',');
  }

  return models;
};

const getGoogleModels = () => {
  let models = defaultModels[EModelEndpoint.google];
  if (process.env.GOOGLE_MODELS) {
    models = String(process.env.GOOGLE_MODELS).split(',');
  }

  return models;
};

module.exports = {
  fetchModels,
  deriveBaseURL,
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
  getGoogleModels,
};
