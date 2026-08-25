const {
  createAgentTriggerService,
  createAgentEventContinueResolver,
  createSubagentCompletionWakeupResolver,
  GenerationJobManager,
  isEnabled,
} = require('@librechat/api');
const methods = require('~/models');

const completionResolver = createSubagentCompletionWakeupResolver({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
});

const service = createAgentTriggerService({
  methods,
  isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  prepareContinue: createAgentEventContinueResolver({
    methods,
    getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
    fallback: completionResolver,
    enabled: () => isEnabled(process.env.ENABLE_AGENT_EVENT_CHILD_TURNS),
  }),
});

module.exports = {
  initializeAgentTriggerService: service.initialize,
  stopAgentTriggerService: service.stop,
  dispatchAgentTrigger: service.dispatch,
  enqueueAgentTrigger: service.enqueue,
  getAgentTriggerDelivery: service.getDelivery,
  getAgentTriggerDeliveryStatus: service.getDeliveryStatus,
  getAgentTriggerDeadLetters: service.getDeadLetters,
  requeueAgentTrigger: service.requeue,
  drainAgentTriggerDeliveriesForUser: service.drainUser,
  prepareAgentTriggerUserPurge: service.prepareUserPurge,
  cancelAgentTriggerUserPurge: service.cancelUserPurge,
  purgeAgentTriggerDeliveriesForUser: service.purgeUser,
};
