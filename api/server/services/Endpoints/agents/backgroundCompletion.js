const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolDeadClaimRecovery,
  createPendingBackgroundCompletions,
  createBackgroundToolResultHandler,
  claimBackgroundToolResult: claimResult,
} = require('@librechat/api');
const { listPendingAgentBackgroundToolCompletions } = require('~/models');
const {
  enqueueAgentTrigger,
  persistAgentBackgroundToolResult,
  getAgentBackgroundToolResultClaim,
  releaseAgentBackgroundToolResultClaims,
  renewAgentTriggerProducerLease,
  retireAgentTrigger,
} = require('../../Agents/triggers');

const preregisterBackgroundToolCompletion = createBackgroundToolCompletionWakeupHandler(
  enqueueAgentTrigger,
  retireAgentTrigger,
  renewAgentTriggerProducerLease,
  (deliveryKey, sourceId, result) =>
    persistAgentBackgroundToolResult({ deliveryKey, sourceId, result }),
);

const pendingBackgroundToolCompletions = createPendingBackgroundCompletions({
  list: listPendingAgentBackgroundToolCompletions,
  retire: retireAgentTrigger,
});

function createBackgroundToolResultPersistence({ req, updateToolCallResult }) {
  return createBackgroundToolResultHandler({ req, updateToolCallResult });
}

const claimBackgroundToolResult = (db, input) =>
  claimResult(db, getAgentBackgroundToolResultClaim, input);

function createDeadBackgroundToolClaimRecovery(
  releaseBackgroundToolResultClaims,
  getGenerationJob,
  fenceGenerationClaim,
) {
  return createBackgroundToolDeadClaimRecovery(
    retireAgentTrigger,
    releaseBackgroundToolResultClaims,
    getGenerationJob,
    fenceGenerationClaim,
    releaseAgentBackgroundToolResultClaims,
  );
}

module.exports = {
  preregisterBackgroundToolCompletion,
  pendingBackgroundToolCompletions,
  createBackgroundToolResultPersistence,
  claimBackgroundToolResult,
  createDeadBackgroundToolClaimRecovery,
};
