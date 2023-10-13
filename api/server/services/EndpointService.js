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

const openAI = isUserProvided(openAIApiKey);
const azureOpenAI = isUserProvided(azureOpenAIApiKey);
const bingAI = isUserProvided(bingToken);
const chatGPTBrowser = isUserProvided(chatGPTToken);
const anthropic = isUserProvided(anthropicApiKey);

module.exports = {
  config: {
    openAIApiKey,
    azureOpenAIApiKey,
    useAzurePlugins,
    userProvidedOpenAI,
    palmKey,
    openAI,
    azureOpenAI,
    chatGPTBrowser,
    anthropic,
    bingAI,
  },
};
