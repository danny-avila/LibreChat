import { randomUUID } from 'node:crypto';
import type { AgentTriggerEnqueueOptions } from './triggers/delivery';
import type { SubagentTaskSettlement } from './subagentThreads';
import { createAgentTriggerEnvelope } from './triggers/envelope';

const WAKEUP_ADMISSION_DELAY_MS = 250;
const SOURCE_ID = 'subagent-completion';

export type EnqueueAgentTrigger = (
  envelope: unknown,
  options?: AgentTriggerEnqueueOptions,
) => Promise<unknown>;

function renderWakeupInput(settlement: SubagentTaskSettlement): string {
  return [
    `A detached subagent task has ${settlement.status}.`,
    'Collect it now with check_background_task, then continue the parent task from its result.',
    JSON.stringify({
      background_task_id: settlement.taskId,
      subagent_thread_id: settlement.threadId,
      subagent_type: settlement.subagentType,
      status: settlement.status,
    }),
  ].join('\n');
}

/**
 * Adapts a persisted child settlement into the source-neutral durable trigger
 * queue. The stable delivery identity makes duplicate settlement callbacks
 * harmless, while the exact parent response id preserves the originating
 * conversation branch.
 */
export function createSubagentCompletionWakeupHandler(
  enqueue: EnqueueAgentTrigger,
): (settlement: SubagentTaskSettlement) => Promise<void> {
  return async (settlement) => {
    const parentAgentId = settlement.parentAgentId?.trim();
    if (parentAgentId == null || parentAgentId === '') {
      return;
    }
    const eventId = `${settlement.taskId}:${settlement.status}`;
    const envelope = createAgentTriggerEnvelope({
      mode: 'continue',
      requestId: randomUUID(),
      deliveryId: eventId,
      receivedAt: Date.now(),
      principal: {
        id: settlement.userId,
        ...(settlement.tenantId == null ? {} : { tenantId: settlement.tenantId }),
      },
      event: {
        id: eventId,
        type: `subagent.${settlement.status}`,
        occurredAt: settlement.settledAt,
        source: { id: SOURCE_ID, type: 'internal' },
        payload: {
          taskId: settlement.taskId,
          threadId: settlement.threadId,
          subagentType: settlement.subagentType,
          status: settlement.status,
        },
      },
      target: {
        agentId: parentAgentId,
        conversationId: settlement.parentConversationId,
        parentMessageId: settlement.parentMessageId,
      },
      input: renderWakeupInput(settlement),
    });
    await enqueue(envelope, {
      orderingKey: `subagent-completion:${settlement.parentConversationId}`,
      availableAt: new Date(Math.max(Date.now(), settlement.settledAt) + WAKEUP_ADMISSION_DELAY_MS),
    });
  };
}
