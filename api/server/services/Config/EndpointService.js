const { isUserProvided, shouldUseEntraId } = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const { generateConfig } = require('~/server/utils/handleText');

const {
  OPENAI_API_KEY: openAIApiKey,
  AZURE_ASSISTANTS_API_KEY: azureAssistantsApiKey,
  ASSISTANTS_API_KEY: assistantsApiKey,
  AZURE_API_KEY: azureOpenAIApiKey,
  ANTHROPIC_API_KEY: anthropicApiKey,
  GOOGLE_KEY: googleKey,
  OPENAI_REVERSE_PROXY,
  AZURE_OPENAI_BASEURL,
  ASSISTANTS_BASE_URL,
  AZURE_ASSISTANTS_BASE_URL,
} = process.env ?? {};

// Note: For Entra ID, we can't determine the actual token here since this is synchronous
// The actual token will be obtained in the initialize functions.
// Still we need to set a placeholder token to avoid errors.
const finalAzureOpenAIApiKey = shouldUseEntraId() ? 'entra-id-placeholder' : azureOpenAIApiKey;

const useAzurePlugins = !!PLUGINS_USE_AZURE;

const userProvidedOpenAI = useAzurePlugins
  ? isUserProvided(finalAzureOpenAIApiKey)
  : isUserProvided(openAIApiKey);

module.exports = {
  config: {
    googleKey,
    openAIApiKey,
    azureOpenAIApiKey: finalAzureOpenAIApiKey,
    userProvidedOpenAI,
    [EModelEndpoint.anthropic]: generateConfig(anthropicApiKey),
    [EModelEndpoint.openAI]: generateConfig(openAIApiKey, OPENAI_REVERSE_PROXY),
    [EModelEndpoint.azureOpenAI]: generateConfig(finalAzureOpenAIApiKey, AZURE_OPENAI_BASEURL),
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
    [EModelEndpoint.bedrock]: generateConfig(
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY ?? process.env.BEDROCK_AWS_DEFAULT_REGION,
    ),
    /* key will be part of separate config */
    [EModelEndpoint.agents]: generateConfig('true', undefined, EModelEndpoint.agents),
  },
};
