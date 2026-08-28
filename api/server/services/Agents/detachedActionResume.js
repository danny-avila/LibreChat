const { randomUUID } = require('node:crypto');
const {
  createAgentTriggerEnvelope,
  EVENT_ACTOR_DETACHED_COMPLETION_SOURCE,
  EVENT_ACTOR_DETACHED_COMPLETION_TYPE,
} = require('@librechat/api');
const methods = require('~/models');

function renderCompletion(action) {
  const terminal =
    action.status === 'succeeded'
      ? `succeeded with this result:\n${action.result ?? ''}`
      : `${action.status} with this error:\n${action.error ?? 'No error detail was recorded.'}`;
  return [
    'A detached expected action from your preceding event turn has now reached an authoritative terminal state.',
    `Tool: ${action.toolName}`,
    `Tool call: ${action.toolCallId}`,
    `The action ${terminal}`,
    'Continue the same event invocation using this trusted internal completion. Do not launch the same action again.',
  ].join('\n');
}

/** Re-enters the normal trigger host with a new generation identity while the
 * signed actor suspension retains ownership of the original delivery. */
async function resumeAgentEventDetachedAction({ job, action }) {
  const delivery = await methods.getAgentTriggerDelivery(job.agentEventDeliveryKey);
  const envelope = delivery?.envelope;
  if (
    delivery == null ||
    String(delivery.user) !== job.userId ||
    envelope?.mode !== 'continue' ||
    envelope.target?.bindingId !== job.agentEventBindingId ||
    envelope.target?.conversationId !== job.conversationId ||
    envelope.expectedAction?.toolName !== action.expectedToolName
  ) {
    throw new Error('Detached Event Actor completion owner is unavailable');
  }
  const completion = {
    version: 1,
    invocationId: job.agentEventDeliveryKey,
    generationCreatedAt: job.createdAt,
    taskId: action.taskId,
    idempotencyKey: action.idempotencyKey,
  };
  const continuation = createAgentTriggerEnvelope({
    mode: 'continue',
    requestId: randomUUID(),
    deliveryId: `detached_completion:${action.taskId}`,
    receivedAt: Date.now(),
    principal: {
      id: job.userId,
      ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
    },
    event: {
      id: action.taskId,
      type: EVENT_ACTOR_DETACHED_COMPLETION_TYPE,
      occurredAt: action.settledAt?.getTime() ?? Date.now(),
      source: { id: EVENT_ACTOR_DETACHED_COMPLETION_SOURCE, type: 'internal' },
      payload: completion,
    },
    target: envelope.target,
    input: renderCompletion(action),
    expectedAction: envelope.expectedAction,
  });
  /** Lazy import avoids service-construction cycles during server startup. */
  const { dispatchAgentTrigger } = require('./triggers');
  await dispatchAgentTrigger(continuation);
}

module.exports = { resumeAgentEventDetachedAction };
