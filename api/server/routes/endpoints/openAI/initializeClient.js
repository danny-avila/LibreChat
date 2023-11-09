const { OpenAIClient } = require('../../../../app');
const { isEnabled } = require('../../../utils');
const { getAzureCredentials, sanitizeModelName } = require('../../../../utils');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

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

    // Make sure the deployment name is taken from the environment variables or configuration
    // Ensure that AZURE_OPENAI_API_DEPLOYMENT_NAME is set in your environment variables
    clientOptions.azure.azureOpenAIApiDeploymentName = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;

    if (!clientOptions.azure.azureOpenAIApiDeploymentName) {
      throw new Error('Azure OpenAI API deployment name not provided.');
    }

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
