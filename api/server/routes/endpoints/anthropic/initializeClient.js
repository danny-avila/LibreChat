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
  let anthropicApiKey = isUserProvided ? key : ANTHROPIC_API_KEY;
  const client = new AnthropicClient(anthropicApiKey, { req, res });
  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
