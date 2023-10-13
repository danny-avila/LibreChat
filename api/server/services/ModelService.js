const Keyv = require('keyv');
const axios = require('axios');
const { isEnabled } = require('../utils');
const keyvRedis = require('../../cache/keyvRedis');
// const { getAzureCredentials, genAzureChatCompletion } = require('../../utils/');
const { openAIApiKey, userProvidedOpenAI } = require('./EndpointService').config;

const modelsCache = isEnabled(process.env.USE_REDIS)
  ? new Keyv({ store: keyvRedis })
  : new Keyv({ namespace: 'models' });

const { OPENROUTER_API_KEY, OPENAI_REVERSE_PROXY, CHATGPT_MODELS, ANTHROPIC_MODELS } =
  process.env ?? {};

const fetchOpenAIModels = async (opts = { azure: false, plugins: false }, _models = []) => {
  let models = _models.slice() ?? [];
  let apiKey = openAIApiKey;
  let basePath = 'https://api.openai.com/v1';
  if (opts.azure) {
    return models;
    // const azure = getAzureCredentials();
    // basePath = (genAzureChatCompletion(azure))
    //   .split('/deployments')[0]
    //   .concat(`/models?api-version=${azure.azureOpenAIApiVersion}`);
    // apiKey = azureOpenAIApiKey;
  }

  let reverseProxyUrl = OPENAI_REVERSE_PROXY;

  if (OPENROUTER_API_KEY) {
    reverseProxyUrl = 'https://openrouter.ai/api/v1';
  }

  if (reverseProxyUrl) {
    basePath = reverseProxyUrl.match(/.*v1/)?.[0];
  }

  const cachedModels = await modelsCache.get(basePath);
  if (cachedModels) {
    return cachedModels;
  }

  if (basePath.includes('v1') || opts.azure) {
    try {
      const res = await axios.get(`${basePath}${opts.azure ? '' : '/models'}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      models = res.data.data.map((item) => item.id);
      // console.log(`Fetched ${models.length} models from ${opts.azure ? 'Azure ' : ''}OpenAI API`);
    } catch (err) {
      console.log(`Failed to fetch models from ${opts.azure ? 'Azure ' : ''}OpenAI API`);
    }
  }

  if (!reverseProxyUrl) {
    const regex = /(text-davinci-003|gpt-)/;
    models = models.filter((model) => regex.test(model));
  }

  await modelsCache.set(basePath, models);
  return models;
};

const getOpenAIModels = async (opts = { azure: false, plugins: false }) => {
  let models = [
    'gpt-4',
    'gpt-4-0613',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo-0613',
    'gpt-3.5-turbo-0301',
  ];

  if (!opts.plugins) {
    models.push('text-davinci-003');
  }

  let key;
  if (opts.azure) {
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

  if (userProvidedOpenAI && !OPENROUTER_API_KEY) {
    return models;
  }

  return await fetchOpenAIModels(opts, models);
};

const getChatGPTBrowserModels = () => {
  let models = ['text-davinci-002-render-sha', 'gpt-4'];
  if (CHATGPT_MODELS) {
    models = String(CHATGPT_MODELS).split(',');
  }

  return models;
};

const getAnthropicModels = () => {
  let models = [
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1-100k',
    'claude-2',
  ];
  if (ANTHROPIC_MODELS) {
    models = String(ANTHROPIC_MODELS).split(',');
  }

  return models;
};

module.exports = {
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
};
