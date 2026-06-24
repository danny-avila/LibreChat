import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessage, TMessageContentParts } from 'librechat-data-provider';

/**
 * UI-only content-part type used to render an `ask_user_question` pause inline
 * with the assistant's other content parts. It rides on the standard `content`
 * array (which `Agents.MessageContentComplex` allows for arbitrary `type`
 * strings), so it survives SSE, sync, and DB rehydration without a new wire
 * type or an extra field on `TMessage`.
 */
export const ASK_USER_QUESTION = 'ask_user_question' as const;

/** Shape of the synthetic content part carrying an ask-user pending action. */
export interface AskUserQuestionPart {
  type: typeof ASK_USER_QUESTION;
  [ASK_USER_QUESTION]: {
    actionId: string;
    question: Agents.AskUserQuestionRequest;
  };
}

/**
 * The synthetic type isn't in the `ContentTypes` union, so this reads the
 * `type` field through a cast rather than a type-predicate (which TS rejects
 * because `AskUserQuestionPart` isn't assignable to the strict
 * `TMessageContentParts` union).
 */
const isAskUserQuestionPart = (part: TMessageContentParts | undefined): boolean =>
  (part as { type?: string } | undefined)?.type === ASK_USER_QUESTION &&
  part != null &&
  ASK_USER_QUESTION in part;

const getToolCallId = (part: TMessageContentParts | undefined): string =>
  (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';

/**
 * Maps a tool-approval pending action onto a message's tool-call content parts.
 *
 * For each `action_request`, the matching tool-call part (joined by
 * `tool_call_id`) gets its `approval` field set, using the `allowed_decisions`
 * from the review config with the same `tool_call_id` (NOT by position — the
 * same tool can appear twice in one batch).
 *
 * Returns a NEW message only when something changed (referential stability lets
 * React bail out of needless re-renders); otherwise the original is returned.
 */
function applyToolApproval(
  message: TMessage,
  actionId: string,
  payload: Agents.ToolApprovalInterruptPayload,
): TMessage {
  const content = message.content;
  if (!Array.isArray(content) || content.length === 0) {
    return message;
  }

  const reviewByToolCallId = new Map<string, Agents.ToolReviewConfig>();
  for (const config of payload.review_configs) {
    reviewByToolCallId.set(config.tool_call_id, config);
  }
  const requestByToolCallId = new Map<string, Agents.ToolApprovalRequest>();
  for (const requestItem of payload.action_requests) {
    requestByToolCallId.set(requestItem.tool_call_id, requestItem);
  }

  let changed = false;
  const nextContent = content.map((part) => {
    if (part?.type !== ContentTypes.TOOL_CALL) {
      return part;
    }
    const toolCallId = getToolCallId(part);
    const request = toolCallId ? requestByToolCallId.get(toolCallId) : undefined;
    if (!request) {
      return part;
    }
    const reviewConfig = reviewByToolCallId.get(toolCallId);
    const toolCall = part[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined;
    /** Leave completed calls alone — an output means the pause already resolved. */
    if (!toolCall || (toolCall.output?.length ?? 0) > 0) {
      return part;
    }
    changed = true;
    return {
      ...part,
      [ContentTypes.TOOL_CALL]: {
        ...toolCall,
        approval: {
          actionId,
          allowed_decisions: reviewConfig?.allowed_decisions ?? [],
          description: request.description,
        },
      },
    } as TMessageContentParts;
  });

  if (!changed) {
    return message;
  }
  return { ...message, content: nextContent };
}

/**
 * Appends (or refreshes) an ask-user-question content part for the pending
 * action. Idempotent: replaces an existing part with the same `actionId` rather
 * than stacking duplicates on reconnect/replay.
 */
function applyAskUserQuestion(
  message: TMessage,
  actionId: string,
  payload: Agents.AskUserQuestionInterruptPayload,
): TMessage {
  const content = Array.isArray(message.content) ? message.content : [];
  const askPart = {
    type: ASK_USER_QUESTION,
    [ASK_USER_QUESTION]: { actionId, question: payload.question },
  } as unknown as TMessageContentParts;

  const existingIdx = content.findIndex(
    (part) =>
      isAskUserQuestionPart(part) &&
      (part as unknown as AskUserQuestionPart)[ASK_USER_QUESTION].actionId === actionId,
  );
  if (existingIdx >= 0) {
    const nextContent = [...content];
    nextContent[existingIdx] = askPart;
    return { ...message, content: nextContent };
  }
  return { ...message, content: [...content, askPart] };
}

/**
 * Applies a {@link Agents.PendingAction} onto the target response message,
 * dispatching on the interrupt type. Pure — returns a new message only when the
 * mapping actually changed something.
 */
export function applyPendingAction(
  message: TMessage,
  pendingAction: Agents.PendingAction,
): TMessage {
  const { payload, actionId } = pendingAction;
  if (payload.type === 'tool_approval') {
    return applyToolApproval(message, actionId, payload);
  }
  if (payload.type === 'ask_user_question') {
    return applyAskUserQuestion(message, actionId, payload);
  }
  return message;
}

/** Returns the ask-user-question synthetic part when `part` is one, else undefined. */
export function getAskUserQuestionPart(
  part: TMessageContentParts | undefined,
): AskUserQuestionPart | undefined {
  return isAskUserQuestionPart(part) ? (part as unknown as AskUserQuestionPart) : undefined;
}

/**
 * Resolves the response message a pending action targets within `messages`.
 * Prefers an explicit `responseMessageId`, then the conventional `<userMsg>_`
 * placeholder / a child of the user message. Returns the index or -1.
 */
export function findPendingActionMessageIndex(
  messages: TMessage[],
  pendingAction: Agents.PendingAction,
): number {
  const { responseMessageId } = pendingAction;
  if (responseMessageId) {
    const exact = messages.findIndex((message) => message.messageId === responseMessageId);
    if (exact >= 0) {
      return exact;
    }
    const unpadded = responseMessageId.replace(/_+$/, '');
    const unpaddedIdx = messages.findIndex((message) => message.messageId === unpadded);
    if (unpaddedIdx >= 0) {
      return unpaddedIdx;
    }
  }
  /** Fall back to the last assistant message (the in-flight response). */
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.isCreatedByUser === false) {
      return i;
    }
  }
  return -1;
}
