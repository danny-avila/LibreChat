const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint, defaultModels, CacheKeys } = require('librechat-data-provider');
const { extractBaseURL, inputSchema, processModelData } = require('~/utils');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('~/config');

// const { getAzureCredentials, genAzureChatCompletion } = require('~/utils/');

const { openAIApiKey, userProvidedOpenAI } = require('./Config/EndpointService').config;

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
}) => {
  let models = [];

  if (!baseURL && !azure) {
    return models;
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
      await cache.set(name, endpointTokenConfig);
    }
    models = input.data.map((item) => item.id);
  } catch (error) {
    const logMessage = `Failed to fetch models from ${azure ? 'Azure ' : ''}${name} API`;
    if (error.response) {
      logger.error(
        `${logMessage} The request was made and the server responded with a status code that falls out of the range of 2xx: ${
          error.message ? error.message : ''
        }`,
        {
          headers: error.response.headers,
          status: error.response.status,
          data: error.response.data,
        },
      );
    } else if (error.request) {
      logger.error(
        `${logMessage} The request was made but no response was received: ${
          error.message ? error.message : ''
        }`,
        {
          request: error.request,
        },
      );
    } else {
      logger.error(`${logMessage} Something happened in setting up the request`, {
        message: error.message ? error.message : '',
      });
    }
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
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
  getGoogleModels,
};
