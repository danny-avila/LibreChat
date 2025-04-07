const axios = require('axios');
const { Providers } = require('@librechat/agents');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint, defaultModels, CacheKeys } = require('librechat-data-provider');
const { inputSchema, logAxiosError, extractBaseURL, processModelData } = require('~/utils');
const { OllamaClient } = require('~/app/clients/OllamaClient');
const { isUserProvided } = require('~/server/utils');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('~/config');

/**
 * Splits a string by commas and trims each resulting value.
 * @param {string} input - The input string to split.
 * @returns {string[]} An array of trimmed values.
 */
const splitAndTrim = (input) => {
  if (!input || typeof input !== 'string') {
    return [];
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

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
 * @param {string} [params.tokenKey] - The cache key to save the token configuration. Uses `name` if omitted.
 * @returns {Promise<string[]>} A promise that resolves to an array of model identifiers.
 * @async
 */
const fetchModels = async ({
  user,
  apiKey,
  baseURL,
  name = EModelEndpoint.openAI,
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

  if (name && name.toLowerCase().startsWith(Providers.OLLAMA)) {
    return await OllamaClient.fetchModels(baseURL);
  }

  try {
    const options = {
      headers: {},
      timeout: 5000,
    };

    if (name === EModelEndpoint.anthropic) {
      options.headers = {
        'x-api-key': apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
      };
    } else {
      options.headers.Authorization = `Bearer ${apiKey}`;
    }

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



const getAnthropicModels = async (opts = {}) => {
  return [];
  // let models = defaultModels[EModelEndpoint.anthropic];
  // if (process.env.ANTHROPIC_MODELS) {
  //   models = splitAndTrim(process.env.ANTHROPIC_MODELS);
  //   return models;
  // }

  // if (isUserProvided(process.env.ANTHROPIC_API_KEY)) {
  //   return models;
  // }

  // try {
  //   return await fetchAnthropicModels(opts, models);
  // } catch (error) {
  //   logger.error('Error fetching Anthropic models:', error);
  //   return models;
  // }
};

const getGoogleModels = () => {
  return [];
  // let models = defaultModels[EModelEndpoint.google];
  // if (process.env.GOOGLE_MODELS) {
  //   models = splitAndTrim(process.env.GOOGLE_MODELS);
  // }

  // return models;
};

const getBedrockModels = () => {
  return [];
  // let models = defaultModels[EModelEndpoint.bedrock];
  // if (process.env.BEDROCK_AWS_MODELS) {
  //   models = splitAndTrim(process.env.BEDROCK_AWS_MODELS);
  // }

  // return models;
};

module.exports = {
  fetchModels,
  splitAndTrim,
  getBedrockModels,
  getAnthropicModels,
  getGoogleModels,
};
