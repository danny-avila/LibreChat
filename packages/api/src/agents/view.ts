import { logger, SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT } from '@librechat/data-schemas';
import type {
  ConversationMethods,
  MessageMethods,
  SubagentThreadViewMessageRecord,
} from '@librechat/data-schemas';
import type {
  SubagentThreadMessage,
  SubagentThreadStatus,
  SubagentThreadView,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { projectSubagentActivity, SUBAGENT_ACTIVITY_LIMITS } from './activity';

const MAX_THREAD_MESSAGES = 50;
const MAX_MESSAGE_TEXT_BYTES = 32 * 1024;
// MongoDB slices by Unicode code points, so reserve the UTF-8 worst case and
// keep the storage projection at or below the public byte ceiling.
const MAX_MESSAGE_TEXT_PROJECTION_CODE_POINTS = Math.floor(MAX_MESSAGE_TEXT_BYTES / 4);
const MAX_RESPONSE_TEXT_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 160 * 1024;
const MAX_PUBLIC_ID_BYTES = 512;
const MAX_TITLE_BYTES = 1024;
type SubagentThreadViewDependencies = Pick<
  ConversationMethods,
  'getConvoOwnership' | 'getSubagentThreadForParent'
> &
  Pick<MessageMethods, 'getMessagesForSubagentThreadView'>;

type SubagentThreadViewParams = {
  parentConversationId?: string;
  threadId?: string;
};

const validConversationId = (value: string | undefined): value is string =>
  value != null && value.trim() !== '' && value.length <= 256;

const validTaskId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  Buffer.byteLength(value, 'utf8') <= MAX_PUBLIC_ID_BYTES;

const tenantMatches = (recordTenantId: string | undefined, requestTenantId: string | undefined) =>
  recordTenantId === requestTenantId;

const isoDate = (value: Date | string | undefined): string | undefined => {
  if (value == null) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
};

const truncateUtf8 = (
  input: string,
  byteLimit: number,
): { text: string; truncated: boolean; bytes: number } => {
  const inputBytes = Buffer.byteLength(input, 'utf8');
  if (inputBytes <= byteLimit) {
    return { text: input, truncated: false, bytes: inputBytes };
  }
  let low = 0;
  let high = input.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(input.slice(0, middle), 'utf8') <= byteLimit) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let end = low;
  if (end > 0 && /[\uD800-\uDBFF]/.test(input[end - 1])) {
    end -= 1;
  }
  const text = input.slice(0, end);
  return { text, truncated: true, bytes: Buffer.byteLength(text, 'utf8') };
};

const publicMessage = (
  message: SubagentThreadViewMessageRecord,
  byteLimit: number,
): { message: SubagentThreadMessage; bytes: number } => {
  const text = message.text ?? '';
  const projected = truncateUtf8(text, Math.min(MAX_MESSAGE_TEXT_BYTES, byteLimit));
  return {
    message: {
      messageId: truncateUtf8(message.messageId, MAX_PUBLIC_ID_BYTES).text,
      parentMessageId:
        message.parentMessageId == null
          ? null
          : truncateUtf8(message.parentMessageId, MAX_PUBLIC_ID_BYTES).text,
      role: message.isCreatedByUser ? 'user' : 'assistant',
      text: projected.text,
      ...(isoDate(message.createdAt) == null ? {} : { createdAt: isoDate(message.createdAt) }),
      ...(message.error === true ? { error: true } : {}),
      ...(message.textProjectionTruncated === true || projected.truncated
        ? { textTruncated: true }
        : {}),
    },
    bytes: projected.bytes,
  };
};

const publicStatus = (
  messages: SubagentThreadViewMessageRecord[],
  activeLeaseTaskId: string | undefined,
  requestedTaskId?: string,
): SubagentThreadStatus => {
  if (
    activeLeaseTaskId != null &&
    (requestedTaskId == null || requestedTaskId === activeLeaseTaskId)
  ) {
    const activeTaskMessage = messages.find(
      (message) =>
        message.messageId === `${activeLeaseTaskId}:user` ||
        message.messageId === `${activeLeaseTaskId}:assistant`,
    );
    if (
      activeTaskMessage?.subagentTask?.status == null ||
      activeTaskMessage.subagentTask.status === 'running'
    ) {
      return 'running';
    }
    return publicStatus([activeTaskMessage], undefined);
  }
  const message = messages.find(
    (candidate) =>
      candidate.subagentTask != null &&
      (requestedTaskId == null || candidate.messageId.startsWith(`${requestedTaskId}:`)),
  );
  switch (message?.subagentTask?.status) {
    case 'running':
      return 'interrupted';
    case 'completed':
      return 'completed';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'dispatched';
  }
};

const notFound = (res: Response): void => {
  res.status(404).json({ error: 'Conversation not found' });
};

/** Reads one durable child through its parent without reopening ordinary conversation reads. */
export function createSubagentThreadViewHandler(deps: SubagentThreadViewDependencies) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || undefined;
    const { parentConversationId, threadId } = req.params as SubagentThreadViewParams;
    const requestedTaskId = req.query?.taskId;
    if (
      !userId ||
      !validConversationId(parentConversationId) ||
      !validConversationId(threadId) ||
      parentConversationId === threadId ||
      (requestedTaskId != null && !validTaskId(requestedTaskId))
    ) {
      notFound(res);
      return;
    }

    try {
      const now = new Date();
      const [parent, child] = await Promise.all([
        deps.getConvoOwnership(userId, parentConversationId, tenantId ?? null),
        deps.getSubagentThreadForParent({
          user: userId,
          parentConversationId,
          conversationId: threadId,
          ...(tenantId == null ? {} : { tenantId }),
        }),
      ]);
      const lineage = child?.subagentThread;
      const authorized =
        parent != null &&
        child != null &&
        lineage != null &&
        lineage.parentConversationId === parentConversationId &&
        tenantMatches(parent.tenantId, tenantId) &&
        tenantMatches(child.tenantId, tenantId);
      if (!authorized || lineage == null || child == null) {
        notFound(res);
        return;
      }

      const messages = await deps.getMessagesForSubagentThreadView({
        conversationId: threadId,
        user: userId,
        ...(tenantId == null ? {} : { tenantId }),
        limit: MAX_THREAD_MESSAGES + 1,
        textCodePointLimit: MAX_MESSAGE_TEXT_PROJECTION_CODE_POINTS,
        ...(requestedTaskId == null ? {} : { taskId: requestedTaskId }),
      });

      const historyTruncated = messages.length > MAX_THREAD_MESSAGES;
      const newestFirst = historyTruncated ? messages.slice(0, MAX_THREAD_MESSAGES) : messages;
      const activeLeaseTaskId =
        child.subagentThreadLease != null && child.subagentThreadLease.expiresAt > now
          ? child.subagentThreadLease.taskId
          : undefined;
      const selectedMessage =
        requestedTaskId == null
          ? undefined
          : newestFirst.find((message) => message.messageId === `${requestedTaskId}:assistant`);
      const selectedTranscript = selectedMessage?.subagentTranscript;
      const selectedInput =
        requestedTaskId == null
          ? undefined
          : newestFirst.find((message) => message.messageId === `${requestedTaskId}:user`);
      let projectedActivity: ReturnType<typeof projectSubagentActivity> = {
        activity: [],
        truncated: false,
      };
      if (selectedMessage?.subagentTranscriptProjectionTruncated === true) {
        projectedActivity = { activity: [], truncated: true };
      } else if (selectedTranscript != null && selectedTranscript.taskId === requestedTaskId) {
        projectedActivity = projectSubagentActivity(
          selectedTranscript.messagesJson,
          selectedTranscript.mode,
          selectedInput?.textProjectionTruncated === true ? undefined : selectedInput?.text,
        );
      } else if (selectedTranscript != null) {
        projectedActivity = { activity: [], truncated: true };
      }
      const projectedNewestFirst: SubagentThreadMessage[] = [];
      let remainingTextBytes = MAX_RESPONSE_TEXT_BYTES;
      for (const message of newestFirst) {
        if (remainingTextBytes === 0) {
          break;
        }
        const projected = publicMessage(message, remainingTextBytes);
        projectedNewestFirst.push(projected.message);
        remainingTextBytes -= projected.bytes;
      }
      const view: SubagentThreadView = {
        threadId,
        parentConversationId,
        parentMessageId: truncateUtf8(lineage.parentMessageId, MAX_PUBLIC_ID_BYTES).text,
        parentToolCallId: truncateUtf8(lineage.parentToolCallId, MAX_PUBLIC_ID_BYTES).text,
        subagentType: truncateUtf8(lineage.subagentType, MAX_PUBLIC_ID_BYTES).text,
        subagentKind: lineage.subagentKind,
        ...(child.agent_id == null
          ? {}
          : { agentId: truncateUtf8(child.agent_id, MAX_PUBLIC_ID_BYTES).text }),
        title: truncateUtf8(child.title ?? `Subagent: ${lineage.subagentType}`, MAX_TITLE_BYTES)
          .text,
        status: publicStatus(newestFirst, activeLeaseTaskId, requestedTaskId),
        activity: projectedActivity.activity,
        activityTruncated: projectedActivity.truncated,
        messages: projectedNewestFirst.reverse(),
        historyTruncated: historyTruncated || projectedNewestFirst.length < newestFirst.length,
        ...(isoDate(child.updatedAt) == null ? {} : { updatedAt: isoDate(child.updatedAt) }),
      };
      while (Buffer.byteLength(JSON.stringify(view), 'utf8') > MAX_RESPONSE_BYTES) {
        if (view.messages.length === 0) {
          throw new Error('Subagent thread projection exceeded its response limit');
        }
        view.messages.shift();
        view.historyTruncated = true;
      }
      res.status(200).json(view);
    } catch (error) {
      logger.error('[subagentThreads] Failed to read child thread through parent', error);
      res.status(500).json({ error: 'Failed to load subagent thread' });
    }
  };
}

export const SUBAGENT_THREAD_VIEW_LIMITS: Readonly<{
  messages: number;
  messageTextBytes: number;
  responseTextBytes: number;
  responseBytes: number;
  activityItems: number;
  activityBytes: number;
  activitySourceBytes: number;
}> = {
  messages: MAX_THREAD_MESSAGES,
  messageTextBytes: MAX_MESSAGE_TEXT_BYTES,
  responseTextBytes: MAX_RESPONSE_TEXT_BYTES,
  responseBytes: MAX_RESPONSE_BYTES,
  activityItems: SUBAGENT_ACTIVITY_LIMITS.items,
  activityBytes: SUBAGENT_ACTIVITY_LIMITS.bytes,
  activitySourceBytes: SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT,
};
