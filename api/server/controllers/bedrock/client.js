const { EModelEndpoint } = require('librechat-data-provider');
const AgentClient = require('~/server/controllers/agents/client');
const { logger } = require('~/config');

class BedrockClient extends AgentClient {
  constructor(options = {}) {
    super(options);
    this.options.endpoint = EModelEndpoint.bedrock;
  }

  setOptions(options) {
    logger.info('[api/server/controllers/bedrock/client.js] setOptions', options);
  }
}

module.exports = BedrockClient;
