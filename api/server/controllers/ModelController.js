const {
  getOpenAIModels,
  getChatGPTBrowserModels,
  getAnthropicModels,
} = require('../services/ModelService');

const { useAzurePlugins } = require('../services/EndpointService').config;

async function modelController(req, res) {
  const google = ['chat-bison', 'text-bison', 'codechat-bison'];
  const openAI = await getOpenAIModels();
  const azureOpenAI = await getOpenAIModels({ azure: true });
  const gptPlugins = await getOpenAIModels({ azure: useAzurePlugins, plugins: true });
  const bingAI = ['BingAI', 'Sydney'];
  const chatGPTBrowser = getChatGPTBrowserModels();
  const anthropic = getAnthropicModels();

  res.send(
    JSON.stringify({ azureOpenAI, openAI, google, bingAI, chatGPTBrowser, gptPlugins, anthropic }),
  );
}

module.exports = modelController;
