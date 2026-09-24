const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolDeadClaimRecovery,
  createBackgroundToolResultHandler,
  claimBackgroundToolResult: claimResult,
} = require('@librechat/api');
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
  createBackgroundToolResultPersistence,
  claimBackgroundToolResult,
  createDeadBackgroundToolClaimRecovery,
};
