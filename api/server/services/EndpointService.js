const { EModelEndpoint } = require('../routes/endpoints/schemas');

const {
  OPENAI_API_KEY: openAIApiKey,
  AZURE_API_KEY: azureOpenAIApiKey,
  ANTHROPIC_API_KEY: anthropicApiKey,
  CHATGPT_TOKEN: chatGPTToken,
  BINGAI_TOKEN: bingToken,
  PLUGINS_USE_AZURE,
  PALM_KEY: palmKey,
} = process.env ?? {};

const useAzurePlugins = !!PLUGINS_USE_AZURE;

const userProvidedOpenAI = useAzurePlugins
  ? azureOpenAIApiKey === 'user_provided'
  : openAIApiKey === 'user_provided';

function isUserProvided(key) {
  return key ? { userProvide: key === 'user_provided' } : false;
}

module.exports = {
  config: {
    openAIApiKey,
    azureOpenAIApiKey,
    useAzurePlugins,
    userProvidedOpenAI,
    palmKey,
    [EModelEndpoint.openAI]: isUserProvided(openAIApiKey),
    [EModelEndpoint.assistant]: isUserProvided(openAIApiKey),
    [EModelEndpoint.azureOpenAI]: isUserProvided(azureOpenAIApiKey),
    [EModelEndpoint.chatGPTBrowser]: isUserProvided(chatGPTToken),
    [EModelEndpoint.anthropic]: isUserProvided(anthropicApiKey),
    [EModelEndpoint.bingAI]: isUserProvided(bingToken),
  },
};
