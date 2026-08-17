const { createAgentTriggerService } = require('@librechat/api');

const service = createAgentTriggerService();

module.exports = {
  initializeAgentTriggerService: service.initialize,
  dispatchAgentTrigger: service.dispatch,
};
