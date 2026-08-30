const {
  createAgentTriggerService,
  createAgentContinuationResolver,
  createAgentEventContinueResolver,
  createSubagentCompletionWakeupResolver,
  SUBAGENT_COMPLETION_SOURCE,
  createBackgroundToolCompletionWakeupResolver,
  BACKGROUND_TOOL_COMPLETION_SOURCE,
  GenerationJobManager,
} = require('@librechat/api');
const methods = require('~/models');

const subagentCompletionAdapter = createSubagentCompletionWakeupResolver({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
});
const backgroundToolCompletionAdapter = createBackgroundToolCompletionWakeupResolver({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
});
const eventActorAdapter = createAgentEventContinueResolver({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
});

const service = createAgentTriggerService({
  methods,
  isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  supportsDetachedActionCompletion: () => GenerationJobManager.supportsDetachedAgentEventActions,
  prepareContinue: createAgentContinuationResolver({
    eventActor: eventActorAdapter,
    internalSources: new Map([
      [SUBAGENT_COMPLETION_SOURCE, subagentCompletionAdapter],
      [BACKGROUND_TOOL_COMPLETION_SOURCE, backgroundToolCompletionAdapter],
    ]),
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
  retireAgentTrigger: service.retire,
  renewAgentTriggerProducerLease: service.renewProducerLease,
  drainAgentTriggerDeliveriesForUser: service.drainUser,
  prepareAgentTriggerUserPurge: service.prepareUserPurge,
  cancelAgentTriggerUserPurge: service.cancelUserPurge,
  purgeAgentTriggerDeliveriesForUser: service.purgeUser,
};
