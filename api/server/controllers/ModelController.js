const { EModelEndpoint } = require('../routes/endpoints/schemas');
const {
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
} = require('../services/ModelService');

const { useAzurePlugins } = require('../services/EndpointService').config;

const fitlerAssistantModels = (str) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

async function modelController(req, res) {
  const openAI = await getOpenAIModels();
  const azureOpenAI = await getOpenAIModels({ azure: true });
  const gptPlugins = await getOpenAIModels({ azure: useAzurePlugins, plugins: true });
  const chatGPTBrowser = getChatGPTBrowserModels();
  const anthropic = getAnthropicModels();

  res.send(
    JSON.stringify({
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.azureOpenAI]: azureOpenAI,
      [EModelEndpoint.assistant]: openAI.filter(fitlerAssistantModels),
      [EModelEndpoint.google]: ['chat-bison', 'text-bison', 'codechat-bison'],
      [EModelEndpoint.bingAI]: ['BingAI', 'Sydney'],
      [EModelEndpoint.chatGPTBrowser]: chatGPTBrowser,
      [EModelEndpoint.gptPlugins]: gptPlugins,
      [EModelEndpoint.anthropic]: anthropic,
    }),
  );
}

module.exports = modelController;
