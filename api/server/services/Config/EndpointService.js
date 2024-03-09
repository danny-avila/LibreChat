const { EModelEndpoint } = require('librechat-data-provider');
const { isUserProvided, generateConfig } = require('~/server/utils');

const {
  OPENAI_API_KEY: openAIApiKey,
  ASSISTANTS_API_KEY: assistantsApiKey,
  AZURE_API_KEY: azureOpenAIApiKey,
  ANTHROPIC_API_KEY: anthropicApiKey,
  CHATGPT_TOKEN: chatGPTToken,
  BINGAI_TOKEN: bingToken,
  PLUGINS_USE_AZURE,
  GOOGLE_KEY: googleKey,
  OPENAI_REVERSE_PROXY,
  AZURE_OPENAI_BASEURL,
  ASSISTANTS_BASE_URL,
} = process.env ?? {};

const useAzurePlugins = !!PLUGINS_USE_AZURE;

const userProvidedOpenAI = useAzurePlugins
  ? isUserProvided(azureOpenAIApiKey)
  : isUserProvided(openAIApiKey);

module.exports = {
  config: {
    openAIApiKey,
    azureOpenAIApiKey,
    useAzurePlugins,
    userProvidedOpenAI,
    googleKey,
    [EModelEndpoint.openAI]: generateConfig(openAIApiKey, OPENAI_REVERSE_PROXY),
    [EModelEndpoint.assistants]: generateConfig(assistantsApiKey, ASSISTANTS_BASE_URL),
    [EModelEndpoint.azureOpenAI]: generateConfig(azureOpenAIApiKey, AZURE_OPENAI_BASEURL),
    [EModelEndpoint.chatGPTBrowser]: generateConfig(chatGPTToken),
    [EModelEndpoint.anthropic]: generateConfig(anthropicApiKey),
    [EModelEndpoint.bingAI]: generateConfig(bingToken),
  },
};
