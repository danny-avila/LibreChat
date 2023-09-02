const { PluginsClient } = require('../../../../app');
const { getAzureCredentials } = require('../../../../utils');
const { checkExpiry } = require('../../../utils');
const { getUserKey } = require('../../../services/UserService');

const initializeClient = async (req, endpointOption) => {
  const { PROXY, OPENAI_API_KEY, PLUGINS_USE_AZURE, OPENAI_REVERSE_PROXY } = process.env;
  const { key: expiresAt, endpoint } = req.body;
  const clientOptions = {
    debug: true,
    reverseProxyUrl: OPENAI_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...endpointOption,
  };

  let key = null;
  if (expiresAt) {
    checkExpiry(expiresAt, 'Your OPENAI_API_KEY has expired. Please provide your API key again.');
    key = await getUserKey({ userId: req.user.id, key: endpoint });
  }

  const isUserProvided = OPENAI_API_KEY === 'user_provided';
  let openAIApiKey = isUserProvided ? key : OPENAI_API_KEY;

  if (PLUGINS_USE_AZURE) {
    clientOptions.azure = getAzureCredentials();
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
