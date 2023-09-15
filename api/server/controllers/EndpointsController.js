const { availableTools } = require('../../app/clients/tools');
const { addOpenAPISpecs } = require('../../app/clients/tools/util/addOpenAPISpecs');
const {
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
  config,
} = require('../services/EndpointsService');

const { openAIApiKey, azureOpenAIApiKey, useAzurePlugins, userProvidedOpenAI } = config;

let i = 0;
async function endpointsController(req, res) {
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
        azure: useAzurePlugins,
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
}

module.exports = endpointsController;
