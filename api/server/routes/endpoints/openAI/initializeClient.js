const { OpenAIClient } = require('../../../../app');
const { isEnabled } = require('../../../utils');
const { getAzureCredentials } = require('../../../../utils');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async (req, endpointOption) => {
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
    ...endpointOption,
  };

  const isUserProvided =
    endpoint === 'openAI' ? OPENAI_API_KEY === 'user_provided' : AZURE_API_KEY === 'user_provided';

  let key = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    key = await getUserKey({ userId: req.user.id, name: endpoint });
  }

  let openAIApiKey = isUserProvided ? key : OPENAI_API_KEY;

  if (process.env.AZURE_API_KEY && endpoint === 'azureOpenAI') {
    clientOptions.azure = isUserProvided ? JSON.parse(key) : getAzureCredentials();
    openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  const client = new OpenAIClient(openAIApiKey, clientOptions);
  return {
    client,
    openAIApiKey,
  };
};

module.exports = initializeClient;
