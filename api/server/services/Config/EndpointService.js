const { EModelEndpoint } = require('librechat-data-provider');
const { isUserProvided, generateConfig } = require('~/server/utils');

const {
  OPENAI_API_KEY: openAIApiKey,
  AZURE_ASSISTANTS_API_KEY: azureAssistantsApiKey,
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
  AZURE_ASSISTANTS_BASE_URL,
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
    [EModelEndpoint.bingAI]: generateConfig(bingToken),
    [EModelEndpoint.anthropic]: generateConfig(anthropicApiKey),
    [EModelEndpoint.chatGPTBrowser]: generateConfig(chatGPTToken),
    [EModelEndpoint.openAI]: generateConfig(openAIApiKey, OPENAI_REVERSE_PROXY),
    [EModelEndpoint.azureOpenAI]: generateConfig(azureOpenAIApiKey, AZURE_OPENAI_BASEURL),
    [EModelEndpoint.assistants]: generateConfig(
      assistantsApiKey,
      ASSISTANTS_BASE_URL,
      EModelEndpoint.assistants,
    ),
    [EModelEndpoint.azureAssistants]: generateConfig(
      azureAssistantsApiKey,
      AZURE_ASSISTANTS_BASE_URL,
      EModelEndpoint.azureAssistants,
    ),
    [EModelEndpoint.bedrock]: generateConfig(process.env.BEDROCK_AWS_SECRET_ACCESS_KEY),
    /* key will be part of separate config */
    [EModelEndpoint.agents]: generateConfig(process.env.I_AM_A_TEAPOT),
  },
};
