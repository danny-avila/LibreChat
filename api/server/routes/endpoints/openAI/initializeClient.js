const { OpenAIClient } = require('../../../../app');
const { getAzureCredentials } = require('../../../../utils');

const initializeClient = (req, endpointOption) => {
  const clientOptions = {
    // debug: true,
    // contextStrategy: 'refine',
    reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
    proxy: process.env.PROXY || null,
    ...endpointOption,
  };

  let openAIApiKey = req.body?.token ?? process.env.OPENAI_API_KEY;

  if (process.env.AZURE_API_KEY && endpointOption.endpoint === 'azureOpenAI') {
    clientOptions.azure = JSON.parse(req.body?.token) ?? getAzureCredentials();
    openAIApiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  const client = new OpenAIClient(openAIApiKey, clientOptions);
  return {
    client,
    openAIApiKey,
  };
};

module.exports = initializeClient;
