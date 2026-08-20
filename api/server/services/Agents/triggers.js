const {
  createAgentTriggerService,
  createSubagentCompletionWakeupResolver,
  GenerationJobManager,
} = require('@librechat/api');
const methods = require('~/models');

const service = createAgentTriggerService({
  methods,
  isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  prepareContinue: createSubagentCompletionWakeupResolver({
    methods,
    getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
  }),
});

module.exports = {
  initializeAgentTriggerService: service.initialize,
  stopAgentTriggerService: service.stop,
  dispatchAgentTrigger: service.dispatch,
  enqueueAgentTrigger: service.enqueue,
  getAgentTriggerDelivery: service.getDelivery,
  getAgentTriggerDeadLetters: service.getDeadLetters,
  requeueAgentTrigger: service.requeue,
  drainAgentTriggerDeliveriesForUser: service.drainUser,
  prepareAgentTriggerUserPurge: service.prepareUserPurge,
  cancelAgentTriggerUserPurge: service.cancelUserPurge,
  purgeAgentTriggerDeliveriesForUser: service.purgeUser,
};
