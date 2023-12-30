const { EModelEndpoint } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { isEnabled } = require('~/server/utils');
const { OpenAIClient } = require('~/app');

const initializeClient = async ({ req, res, endpointOption }) => {
  const { PROXY, CUSTOM_API_KEY, CUSTOM_BASE_URL, CUSTOM_SUMMARIZE } = process.env;
  const { key: expiresAt, endpoint } = req.body;
  const contextStrategy = isEnabled(CUSTOM_SUMMARIZE) ? 'summarize' : null;
  const clientOptions = {
    contextStrategy,
    reverseProxyUrl: CUSTOM_BASE_URL ?? null,
    proxy: PROXY ?? null,
    req,
    res,
    ...endpointOption,
  };

  const credentials = {
    [EModelEndpoint.custom]: CUSTOM_API_KEY,
  };

  const isUserProvided = credentials[endpoint] === 'user_provided';

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, 'Your API key has expired. Please provide it again.');
    userKey = await getUserKey({ userId: req.user.id, name: endpoint });
  }

  let apiKey = isUserProvided ? userKey : credentials[endpoint];

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
