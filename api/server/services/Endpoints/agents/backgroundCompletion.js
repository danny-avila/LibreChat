const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolDeadClaimRecovery,
  createBackgroundToolResultHandler,
} = require('@librechat/api');
const {
  enqueueAgentTrigger,
  persistAgentBackgroundToolResult,
  getAgentBackgroundToolResultClaim,
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

async function claimBackgroundToolResult(db, input) {
  const receiptClaim = await getAgentBackgroundToolResultClaim({
    sourceId: 'background-tool-completion',
    userId: input.userId,
    conversationId: input.conversationId,
    parentMessageId: input.messageId,
    taskId: input.taskId,
  });
  if (receiptClaim != null && receiptClaim.claimId !== input.claimId) {
    return { status: 'claimed', claim: receiptClaim };
  }
  const messageClaim = await db.claimBackgroundToolResults(input);
  if (messageClaim.status !== 'acquired') {
    return messageClaim;
  }
  const reconciledReceiptClaim = await getAgentBackgroundToolResultClaim({
    sourceId: 'background-tool-completion',
    userId: input.userId,
    conversationId: input.conversationId,
    parentMessageId: input.messageId,
    taskId: input.taskId,
  });
  if (reconciledReceiptClaim == null || reconciledReceiptClaim.claimId === input.claimId) {
    return messageClaim;
  }
  await db.releaseBackgroundToolResultClaims({
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    taskIds: [input.taskId],
    kind: input.kind,
    claimId: input.claimId,
  });
  return { status: 'claimed', claim: reconciledReceiptClaim };
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
  claimBackgroundToolResult,
  createDeadBackgroundToolClaimRecovery,
};
