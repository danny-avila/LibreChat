import type { ParentSubagentSummary } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';

export const eventTaskProgressKey = (threadId: string, taskId: string) =>
  `event-task:${threadId}:${taskId}`;

export const eventSubagentSelection = (
  parentConversationId: string,
  child: ParentSubagentSummary,
  siblingParentMessageIds?: string[],
): ActiveSubagentPanel | null => {
  const taskId = child.latestTaskId;
  if (child.origin !== 'event' || child.actorId == null || taskId == null) return null;
  return {
    host: 'conversation',
    parentConversationId,
    parentMessageId: child.parentMessageId,
    toolCallId: `event-thread:${child.threadId}`,
    partIndex: 0,
    subagentType: child.subagentType,
    initialProgress: child.status === 'completed' ? 1 : 0,
    isSubmitting: child.status === 'running',
    durable: { threadId: child.threadId, taskId },
    event: {
      actorId: child.actorId,
      progressKey: eventTaskProgressKey(child.threadId, taskId),
      ...(siblingParentMessageIds == null ? {} : { siblingParentMessageIds }),
    },
  };
};
