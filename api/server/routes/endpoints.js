const axios = require('axios');
const express = require('express');
const router = express.Router();
const { availableTools } = require('../../app/clients/tools');
const { addOpenAPISpecs } = require('../../app/clients/tools/util/addOpenAPISpecs');
// const { getAzureCredentials, genAzureChatCompletion } = require('../../utils/');

const openAIApiKey = process.env.OPENAI_API_KEY;
const azureOpenAIApiKey = process.env.AZURE_API_KEY;
const useAzurePlugins = !!process.env.PLUGINS_USE_AZURE;
const userProvidedOpenAI = openAIApiKey
  ? openAIApiKey === 'user_provided'
  : azureOpenAIApiKey === 'user_provided';

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

  const reverseProxyUrl = process.env.OPENAI_REVERSE_PROXY;
  if (reverseProxyUrl) {
    basePath = reverseProxyUrl.match(/.*v1/)[0];
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

  if (userProvidedOpenAI) {
    console.warn(
      `When setting OPENAI_API_KEY to 'user_provided', ${key} must be set manually or default values will be used`,
    );
    return models;
  }

  models = await fetchOpenAIModels(opts, models);
  return models;
};

const getChatGPTBrowserModels = () => {
  let models = ['text-davinci-002-render-sha', 'gpt-4'];
  if (process.env.CHATGPT_MODELS) {
    models = String(process.env.CHATGPT_MODELS).split(',');
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
  if (process.env.ANTHROPIC_MODELS) {
    models = String(process.env.ANTHROPIC_MODELS).split(',');
  }

  return models;
};

let i = 0;
router.get('/', async function (req, res) {
  let key, palmUser;
  try {
    key = require('../../data/auth.json');
  } catch (e) {
    if (i === 0) {
      i++;
    }
  }

  if (process.env.PALM_KEY === 'user_provided') {
    palmUser = true;
    if (i <= 1) {
      i++;
    }
  }

  const tools = await addOpenAPISpecs(availableTools);
  function transformToolsToMap(tools) {
    return tools.reduce((map, obj) => {
      map[obj.pluginKey] = obj.name;
      return map;
    }, {});
  }
  const plugins = transformToolsToMap(tools);

  const google =
    key || palmUser
      ? { userProvide: palmUser, availableModels: ['chat-bison', 'text-bison', 'codechat-bison'] }
      : false;
  const openAI = openAIApiKey
    ? { availableModels: await getOpenAIModels(), userProvide: openAIApiKey === 'user_provided' }
    : false;
  const azureOpenAI = azureOpenAIApiKey
    ? {
      availableModels: await getOpenAIModels({ azure: true }),
      userProvide: azureOpenAIApiKey === 'user_provided',
    }
    : false;
  const gptPlugins =
    openAIApiKey || azureOpenAIApiKey
      ? {
        availableModels: await getOpenAIModels({ azure: useAzurePlugins, plugins: true }),
        plugins,
        availableAgents: ['classic', 'functions'],
        userProvide: userProvidedOpenAI,
      }
      : false;
  const bingAI = process.env.BINGAI_TOKEN
    ? {
      availableModels: ['BingAI', 'Sydney'],
      userProvide: process.env.BINGAI_TOKEN == 'user_provided',
    }
    : false;
  const chatGPTBrowser = process.env.CHATGPT_TOKEN
    ? {
      userProvide: process.env.CHATGPT_TOKEN == 'user_provided',
      availableModels: getChatGPTBrowserModels(),
    }
    : false;
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? {
      userProvide: process.env.ANTHROPIC_API_KEY == 'user_provided',
      availableModels: getAnthropicModels(),
    }
    : false;

  res.send(
    JSON.stringify({ azureOpenAI, openAI, google, bingAI, chatGPTBrowser, gptPlugins, anthropic }),
  );
});

module.exports = { router, getOpenAIModels, getChatGPTBrowserModels };
