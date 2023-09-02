const { OpenAIClient } = require('../../../../app');
const { getAzureCredentials } = require('../../../../utils');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async (req, endpointOption) => {
  const { PROXY, OPENAI_API_KEY, OPENAI_REVERSE_PROXY } = process.env;
  const { key: expiresAt, endpoint } = req.body;
  const clientOptions = {
    // debug: true,
    // contextStrategy: 'refine',
    reverseProxyUrl: OPENAI_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...endpointOption,
  };

  let key = null;
  console.log('expiresAt', expiresAt);
  if (expiresAt) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    key = await getUserKey({ userId: req.user.id, name: endpoint });
  }

  const isUserProvided = OPENAI_API_KEY === 'user_provided';
  let openAIApiKey = isUserProvided ? key : OPENAI_API_KEY;

  if (process.env.AZURE_API_KEY && endpointOption.endpoint === 'azureOpenAI') {
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
