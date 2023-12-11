const {
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
} = require('~/server/services/ModelService');
const { EModelEndpoint } = require('librechat-data-provider');
const { useAzurePlugins } = require('~/server/services/Config/EndpointService').config;

const fitlerAssistantModels = (str) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

async function loadDefaultModels() {
  const openAI = await getOpenAIModels();
  const anthropic = getAnthropicModels();
  const chatGPTBrowser = getChatGPTBrowserModels();
  const azureOpenAI = await getOpenAIModels({ azure: true });
  const gptPlugins = await getOpenAIModels({ azure: useAzurePlugins, plugins: true });

  return {
    [EModelEndpoint.openAI]: openAI,
    [EModelEndpoint.azureOpenAI]: azureOpenAI,
    [EModelEndpoint.assistant]: openAI.filter(fitlerAssistantModels),
    [EModelEndpoint.google]: [
      'chat-bison',
      'chat-bison-32k',
      'codechat-bison',
      'codechat-bison-32k',
      'text-bison',
      'text-bison-32k',
      'text-unicorn',
      'code-gecko',
      'code-bison',
      'code-bison-32k',
    ],
    [EModelEndpoint.bingAI]: ['BingAI', 'Sydney'],
    [EModelEndpoint.chatGPTBrowser]: chatGPTBrowser,
    [EModelEndpoint.gptPlugins]: gptPlugins,
    [EModelEndpoint.anthropic]: anthropic,
  };
}

module.exports = loadDefaultModels;
