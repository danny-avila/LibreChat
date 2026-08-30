const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolDeadClaimRecovery,
  createBackgroundToolResultHandler,
} = require('@librechat/api');
const {
  enqueueAgentTrigger,
  renewAgentTriggerProducerLease,
  retireAgentTrigger,
} = require('../../Agents/triggers');

const preregisterBackgroundToolCompletion = createBackgroundToolCompletionWakeupHandler(
  enqueueAgentTrigger,
  retireAgentTrigger,
  renewAgentTriggerProducerLease,
);

function createBackgroundToolResultPersistence({ req, updateToolCallResult }) {
  return createBackgroundToolResultHandler({ req, updateToolCallResult });
}

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
  );
}

module.exports = {
  preregisterBackgroundToolCompletion,
  createBackgroundToolResultPersistence,
  createDeadBackgroundToolClaimRecovery,
};
