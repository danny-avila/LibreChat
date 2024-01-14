const { PluginsClient } = require('~/app');
const { isEnabled } = require('~/server/utils');
const { getAzureCredentials } = require('~/utils');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');

const initializeClient = async ({ req, res, endpointOption }) => {
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
    req,
    res,
    ...endpointOption,
  };

  const useAzure = isEnabled(PLUGINS_USE_AZURE);

  const isUserProvided = useAzure
    ? AZURE_API_KEY === 'user_provided'
    : OPENAI_API_KEY === 'user_provided';

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    userKey = await getUserKey({
      userId: req.user.id,
      name: useAzure ? 'azureOpenAI' : 'openAI',
    });
  }

  let apiKey = isUserProvided ? userKey : OPENAI_API_KEY;

  if (useAzure || (apiKey && apiKey.includes('azure') && !clientOptions.azure)) {
    clientOptions.azure = isUserProvided ? JSON.parse(userKey) : getAzureCredentials();
    apiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (!apiKey) {
    throw new Error('API key not provided.');
  }

  const client = new PluginsClient(apiKey, clientOptions);
  return {
    client,
    azure: clientOptions.azure,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
