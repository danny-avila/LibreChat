const {
  createAgentTriggerService,
  createAgentContinuationResolver,
  createAgentEventContinueResolver,
  createSubagentCompletionWakeupResolver,
  SUBAGENT_COMPLETION_SOURCE,
  createBackgroundToolCompletionWakeupResolver,
  BACKGROUND_TOOL_COMPLETION_SOURCE,
  createAgentQueuedTurnResolver,
  createAgentQueuedTurnDeadLetterSettlement,
  createAgentQueuedTurnScheduler,
  AGENT_QUEUED_TURN_SOURCE,
  GenerationJobManager,
} = require('@librechat/api');
const methods = require('~/models');

const getGenerationAdmissionEvidence = (userId, clientRequestId, streamId, conversationId) =>
  GenerationJobManager.getGenerationAdmissionEvidence(
    userId,
    clientRequestId,
    streamId,
    conversationId,
  );

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
const queuedTurnAdapter = createAgentQueuedTurnResolver({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
});

const service = createAgentTriggerService({
  methods,
  isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  supportsDetachedActionCompletion: () => GenerationJobManager.supportsDetachedAgentEventActions,
  settleSourceBeforeDeadLetter: createAgentQueuedTurnDeadLetterSettlement({
    methods,
    getGenerationAdmissionEvidence,
  }),
  prepareContinue: createAgentContinuationResolver({
    eventActor: eventActorAdapter,
    internalSources: new Map([
      [SUBAGENT_COMPLETION_SOURCE, subagentCompletionAdapter],
      [BACKGROUND_TOOL_COMPLETION_SOURCE, backgroundToolCompletionAdapter],
      [AGENT_QUEUED_TURN_SOURCE, queuedTurnAdapter],
    ]),
  }),
});

const queuedTurnScheduler = createAgentQueuedTurnScheduler({
  methods,
  enqueue: service.enqueue,
  getGenerationAdmissionEvidence,
});

const initializeAgentTriggerService = async (options) => {
  await service.initialize(options);
  await queuedTurnScheduler.initialize();
};

const stopAgentTriggerService = async () => {
  await queuedTurnScheduler.stop();
  await service.stop();
};

const purgeAgentTriggerDeliveriesForUser = async (userId) => {
  await service.purgeUser(userId);
};

module.exports = {
  initializeAgentTriggerService,
  stopAgentTriggerService,
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
  purgeAgentTriggerDeliveriesForUser,
  scheduleAgentQueuedTurn: queuedTurnScheduler.schedule,
};
