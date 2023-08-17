const { AnthropicClient } = require('../../../../app');

const initializeClient = (req) => {
  let anthropicApiKey = req.body?.token ?? process.env.ANTHROPIC_API_KEY;
  const client = new AnthropicClient(anthropicApiKey);
  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
