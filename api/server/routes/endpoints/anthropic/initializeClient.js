const { AnthropicClient } = require('../../../../app');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async ({ req, res }) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const expiresAt = req.body.key;
  const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';

  let anthropicApiKey = isUserProvided ? await getAnthropicUserKey(req.user.id) : ANTHROPIC_API_KEY;
  let reverseProxy = process.env.ANTHROPIC_REVERSE_PROXY || undefined;
  console.log('ANTHROPIC_REVERSE_PROXY', reverseProxy);

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your ANTHROPIC_API_KEY has expired. Please provide your API key again.',
    );
  }

  const client = new AnthropicClient(anthropicApiKey, { req, res }, {}, reverseProxy);

  return {
    client,
    anthropicApiKey,
  };
};

const getAnthropicUserKey = async (userId) => {
  return await getUserKey({ userId, name: 'anthropic' });
};

module.exports = initializeClient;
