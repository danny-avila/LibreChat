const {
  createAgentTriggerService,
  createAgentContinuationResolver,
  createAgentEventContinueResolver,
  createSubagentCompletionWakeupResolver,
  SUBAGENT_COMPLETION_SOURCE,
  createBackgroundToolCompletionWakeupResolver,
  BACKGROUND_TOOL_COMPLETION_SOURCE,
  createAgentQueuedTurnLifecycle,
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
let service;
const queuedTurnLifecycle = createAgentQueuedTurnLifecycle({
  methods,
  getGenerationJob: (conversationId) => GenerationJobManager.getJob(conversationId),
  getGenerationAdmissionEvidence,
  enqueue: (...args) => service.enqueue(...args),
  retireDelivery: (...args) => service.retire(...args),
  getDelivery: (...args) => service.getDelivery(...args),
});

service = createAgentTriggerService({
  methods,
  isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  supportsDetachedActionCompletion: () => GenerationJobManager.supportsDetachedAgentEventActions,
  settleSourceBeforeDeadLetter: queuedTurnLifecycle.settleBeforeDeadLetter,
  prepareContinue: createAgentContinuationResolver({
    eventActor: eventActorAdapter,
    internalSources: new Map([
      [SUBAGENT_COMPLETION_SOURCE, subagentCompletionAdapter],
      [BACKGROUND_TOOL_COMPLETION_SOURCE, backgroundToolCompletionAdapter],
      [AGENT_QUEUED_TURN_SOURCE, queuedTurnLifecycle.prepareContinue],
    ]),
  }),
});

const initializeAgentTriggerService = async (options) => {
  await service.initialize(options);
  await queuedTurnLifecycle.initialize();
};

const stopAgentTriggerService = async () => {
  await queuedTurnLifecycle.stop();
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
  scheduleAgentQueuedTurn: queuedTurnLifecycle.schedule,
  cancelAgentQueuedTurn: queuedTurnLifecycle.cancel,
  settleAgentQueuedTurnExecutionAdmission: queuedTurnLifecycle.recordExecutionAdmission,
  verifyAgentQueuedTurnExecutionAdmission: queuedTurnLifecycle.verifyExecutionAdmission,
};
