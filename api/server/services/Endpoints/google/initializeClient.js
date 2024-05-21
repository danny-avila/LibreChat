const { EModelEndpoint, AuthKeys } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { GoogleClient } = require('~/app');

const initializeClient = async ({ req, res, endpointOption }) => {
  const { GOOGLE_KEY, GOOGLE_REVERSE_PROXY, PROXY } = process.env;
  const isUserProvided = GOOGLE_KEY === 'user_provided';
  const { key: expiresAt } = req.body;

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.google);
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
  }

  let serviceKey = {};
  try {
    serviceKey = require('~/data/auth.json');
  } catch (e) {
    // Do nothing
  }

  const credentials = isUserProvided
    ? userKey
    : {
      [AuthKeys.GOOGLE_SERVICE_KEY]: serviceKey,
      [AuthKeys.GOOGLE_API_KEY]: GOOGLE_KEY,
    };

  const client = new GoogleClient(credentials, {
    req,
    res,
    reverseProxyUrl: GOOGLE_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...endpointOption,
  });

  return {
    client,
    credentials,
  };
};

module.exports = initializeClient;
