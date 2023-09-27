const { PluginsClient } = require('../../../../app');
const { isEnabled } = require('../../../utils');
const { getAzureCredentials } = require('../../../../utils');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async (req, endpointOption) => {
  const {
    PROXY,
    OPENAI_API_KEY,
    AZURE_API_KEY,
    PLUGINS_USE_AZURE,
    OPENAI_REVERSE_PROXY,
    OPENAI_SUMMARIZE,
    DEBUG_PLUGINS,
  } = process.env;
  const { key: expiresAt } = req.body;
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;
  const clientOptions = {
    contextStrategy,
    debug: isEnabled(DEBUG_PLUGINS),
    reverseProxyUrl: OPENAI_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...endpointOption,
  };

  const isUserProvided = PLUGINS_USE_AZURE
    ? AZURE_API_KEY === 'user_provided'
    : OPENAI_API_KEY === 'user_provided';

  let key = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    key = await getUserKey({
      userId: req.user.id,
      name: PLUGINS_USE_AZURE ? 'azureOpenAI' : 'openAI',
    });
  }

  let openAIApiKey = isUserProvided ? key : OPENAI_API_KEY;

  if (PLUGINS_USE_AZURE) {
    clientOptions.azure = isUserProvided ? JSON.parse(key) : getAzureCredentials();
    openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (openAIApiKey && openAIApiKey.includes('azure') && !clientOptions.azure) {
    clientOptions.azure = isUserProvided ? JSON.parse(key) : getAzureCredentials();
    openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
  }
  const client = new PluginsClient(openAIApiKey, clientOptions);
  return {
    client,
    azure: clientOptions.azure,
    openAIApiKey,
  };
};

module.exports = initializeClient;
