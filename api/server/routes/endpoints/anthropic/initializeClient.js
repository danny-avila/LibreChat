const { AnthropicClient } = require('../../../../app');
const { checkExpiry } = require('../../../utils');
const { getUserKey } = require('../../../services/UserService');

const initializeClient = async (req) => {
  const { ANTHROPIC_API_KEY } = process.env;
  const { key: expiresAt } = req.body;
  let key = null;
  if (expiresAt) {
    checkExpiry(
      expiresAt,
      'Your ANTHROPIC_API_KEY has expired. Please provide your API key again.',
    );
    key = await getUserKey({ userId: req.user.id, key: 'anthropic' });
  }
  let anthropicApiKey = ANTHROPIC_API_KEY === 'user_provided' ? key : ANTHROPIC_API_KEY;
  const client = new AnthropicClient(anthropicApiKey);
  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
