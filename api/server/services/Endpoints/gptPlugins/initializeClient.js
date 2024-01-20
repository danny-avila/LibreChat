const { EModelEndpoint } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { getAzureCredentials } = require('~/utils');
const { isEnabled } = require('~/server/utils');
const { PluginsClient } = require('~/app');

const initializeClient = async ({ req, res, endpointOption }) => {
  const {
    PROXY,
    OPENAI_API_KEY,
    AZURE_API_KEY,
    PLUGINS_USE_AZURE,
    OPENAI_REVERSE_PROXY,
    AZURE_OPENAI_BASEURL,
    OPENAI_SUMMARIZE,
    DEBUG_PLUGINS,
  } = process.env;

  const { key: expiresAt } = req.body;
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;

  const useAzure = isEnabled(PLUGINS_USE_AZURE);
  const endpoint = useAzure ? EModelEndpoint.azureOpenAI : EModelEndpoint.openAI;

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const reverseProxyUrl = baseURLOptions[endpoint] ?? null;

  const clientOptions = {
    contextStrategy,
    debug: isEnabled(DEBUG_PLUGINS),
    reverseProxyUrl,
    proxy: PROXY ?? null,
    req,
    res,
    ...endpointOption,
  };

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  const isUserProvided = credentials[endpoint] === 'user_provided';

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    userKey = await getUserKey({
      userId: req.user.id,
      name: endpoint,
    });
  }

  let apiKey = isUserProvided ? userKey : credentials[endpoint];

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
