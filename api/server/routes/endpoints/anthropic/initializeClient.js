const { AnthropicClient } = require('../../../../app');
const { getUserKey, checkUserKeyExpiry } = require('../../../services/UserService');

const initializeClient = async (req) => {
  const { ANTHROPIC_API_KEY } = process.env;
  const { key: expiresAt } = req.body;
  let key = null;
  if (expiresAt) {
    checkUserKeyExpiry(
      expiresAt,
      'Your ANTHROPIC_API_KEY has expired. Please provide your API key again.',
    );
    key = await getUserKey({ userId: req.user.id, name: 'anthropic' });
  }
  let anthropicApiKey = ANTHROPIC_API_KEY === 'user_provided' ? key : ANTHROPIC_API_KEY;
  const client = new AnthropicClient(anthropicApiKey);
  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
