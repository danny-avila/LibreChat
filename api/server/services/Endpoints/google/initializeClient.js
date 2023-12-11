const { GoogleClient } = require('~/app');
const { EModelEndpoint } = require('~/server/services/Endpoints');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');

const initializeClient = async ({ req, res, endpointOption }) => {
  const { GOOGLE_KEY, GOOGLE_REVERSE_PROXY, PROXY } = process.env;
  const isUserProvided = GOOGLE_KEY === 'user_provided';
  const { key: expiresAt } = req.body;

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your Google key has expired. Please provide your JSON credentials again.',
    );
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
  }

  const apiKey = isUserProvided ? userKey : require('~/data/auth.json');

  const client = new GoogleClient(apiKey, {
    req,
    res,
    reverseProxyUrl: GOOGLE_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...endpointOption,
  });

  return {
    client,
    apiKey,
  };
};

module.exports = initializeClient;
