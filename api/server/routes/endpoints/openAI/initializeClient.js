const { OpenAIClient } = require('~/app');
const { isEnabled } = require('~/server/utils');
const { getAzureCredentials } = require('~/utils');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');

const initializeClient = async ({ req, res, endpointOption }) => {
  const {
    PROXY,
    OPENAI_API_KEY,
    AZURE_API_KEY,
    OPENAI_REVERSE_PROXY,
    OPENAI_SUMMARIZE,
    DEBUG_OPENAI,
  } = process.env;
  const { key: expiresAt, endpoint } = req.body;
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;
  const clientOptions = {
    debug: isEnabled(DEBUG_OPENAI),
    contextStrategy,
    reverseProxyUrl: OPENAI_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    req,
    res,
    ...endpointOption,
  };

  const credentials = {
    openAI: OPENAI_API_KEY,
    azureOpenAI: AZURE_API_KEY,
  };

  const isUserProvided = credentials[endpoint] === 'user_provided';

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    userKey = await getUserKey({ userId: req.user.id, name: endpoint });
  }

  let apiKey = isUserProvided ? userKey : credentials[endpoint];

  if (endpoint === 'azureOpenAI') {
    clientOptions.azure = isUserProvided ? JSON.parse(userKey) : getAzureCredentials();
    apiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (!apiKey) {
    throw new Error('API key not provided.');
  }

  const client = new OpenAIClient(apiKey, clientOptions);
  return {
    client,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
