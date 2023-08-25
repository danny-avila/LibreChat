const { PluginsClient } = require('../../../../app');
const { getAzureCredentials } = require('../../../../utils');

const initializeClient = (req, endpointOption) => {
  const clientOptions = {
    // debug: true,
    reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
    proxy: process.env.PROXY || null,
    ...endpointOption,
  };

  let openAIApiKey = req.body?.token ?? process.env.OPENAI_API_KEY;
  if (process.env.PLUGINS_USE_AZURE) {
    clientOptions.azure = getAzureCredentials();
    openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (openAIApiKey && openAIApiKey.includes('azure') && !clientOptions.azure) {
    clientOptions.azure = JSON.parse(req.body?.token) ?? getAzureCredentials();
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
