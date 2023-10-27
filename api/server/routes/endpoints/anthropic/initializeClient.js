const { AnthropicClient } = require('../../../../app');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async ({ req, res }) => {
  const { ANTHROPIC_API_KEY } = process.env;
  const { key: expiresAt } = req.body;
  const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';

  let key = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your ANTHROPIC_API_KEY has expired. Please provide your API key again.',
    );
    key = await getUserKey({ userId: req.user.id, name: 'anthropic' });
  }
  let ANTHROPIC_REVERSE_PROXY = process.env.ANTHROPIC_REVERSE_PROXY
  let anthropicApiKey = isUserProvided ? key : ANTHROPIC_API_KEY;
  if (typeof ANTHROPIC_REVERSE_PROXY === 'undefined') {
    Reverse_Proxy = undefined;
  } else {
    Reverse_Proxy = ANTHROPIC_REVERSE_PROXY;
  }
  const client = new AnthropicClient(anthropicApiKey, { req, res},{},Reverse_Proxy);
  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
