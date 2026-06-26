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

/** A tool-call value that may carry approval state and/or nested subagent content. */
type ToolCallWithApproval = Agents.ToolCall & {
  approval?: unknown;
  subagent_content?: TMessageContentParts[];
};

/**
 * Tags one tool-call part with the pending action's approval when it matches an
 * `action_request` (joined by `tool_call_id`, NOT position) and is still unresolved.
 *
 * Recurses into a subagent's `subagent_content`: a tool paused INSIDE a subagent
 * lives there, not as a top-level part, so without this the approval never attaches
 * and the user gets no controls. Returns a NEW part only when something changed.
 */
function tagApprovalOnPart(
  part: TMessageContentParts,
  actionId: string,
  requestByToolCallId: Map<string, Agents.ToolApprovalRequest>,
  reviewByToolCallId: Map<string, Agents.ToolReviewConfig>,
): { part: TMessageContentParts; changed: boolean } {
  if (part?.type !== ContentTypes.TOOL_CALL) {
    return { part, changed: false };
  }
  const toolCall = part[ContentTypes.TOOL_CALL] as ToolCallWithApproval | undefined;
  if (!toolCall) {
    return { part, changed: false };
  }

  let nextToolCall = toolCall;
  let changed = false;

  // Descend into nested subagent tool calls first.
  if (Array.isArray(toolCall.subagent_content) && toolCall.subagent_content.length > 0) {
    let nestedChanged = false;
    const nextNested = toolCall.subagent_content.map((nestedPart) => {
      const res = tagApprovalOnPart(nestedPart, actionId, requestByToolCallId, reviewByToolCallId);
      if (res.changed) {
        nestedChanged = true;
      }
      return res.part;
    });
    if (nestedChanged) {
      nextToolCall = { ...nextToolCall, subagent_content: nextNested };
      changed = true;
    }
  }

  // Tag this call itself when it's one of the paused requests and still unresolved
  // (an `output` means the pause already resolved — leave it alone).
  const toolCallId = getToolCallId(part);
  const request = toolCallId ? requestByToolCallId.get(toolCallId) : undefined;
  if (request && (nextToolCall.output?.length ?? 0) === 0) {
    const reviewConfig = reviewByToolCallId.get(toolCallId);
    nextToolCall = {
      ...nextToolCall,
      approval: {
        actionId,
        allowed_decisions: reviewConfig?.allowed_decisions ?? [],
        description: request.description,
      },
    };
    changed = true;
  }

  if (!changed) {
    return { part, changed: false };
  }
  return {
    part: { ...part, [ContentTypes.TOOL_CALL]: nextToolCall } as TMessageContentParts,
    changed: true,
  };
}

/**
 * Maps a tool-approval pending action onto a message's tool-call content parts,
 * including tool calls nested inside subagents (see {@link tagApprovalOnPart}).
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
    const res = tagApprovalOnPart(part, actionId, requestByToolCallId, reviewByToolCallId);
    if (res.changed) {
      changed = true;
    }
    return res.part;
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

/**
 * Counts the tool-call content parts already tagged with this action's approval —
 * i.e. how many of a tool-approval pending action's `action_requests` have rendered
 * and been mapped. A multi-tool pause can render its sibling cards across several
 * frames, so the SSE retry compares this against `action_requests.length` to know
 * whether EVERY paused call is tagged yet.
 */
export function countTaggedApprovalParts(message: TMessage, actionId: string): number {
  const content = message.content;
  if (!Array.isArray(content)) {
    return 0;
  }
  const countIn = (parts: TMessageContentParts[]): number => {
    let count = 0;
    for (const part of parts) {
      if (part?.type !== ContentTypes.TOOL_CALL) {
        continue;
      }
      const toolCall = part[ContentTypes.TOOL_CALL] as ToolCallWithApproval | undefined;
      if ((toolCall?.approval as { actionId?: string } | undefined)?.actionId === actionId) {
        count += 1;
      }
      // Nested subagent tool calls count too, so the retry loop's "all tagged" check
      // is reachable for a tool paused inside a subagent.
      if (Array.isArray(toolCall?.subagent_content)) {
        count += countIn(toolCall.subagent_content);
      }
    }
    return count;
  };
  return countIn(content);
}

/** Returns the ask-user-question synthetic part when `part` is one, else undefined. */
export function getAskUserQuestionPart(
  part: TMessageContentParts | undefined,
): AskUserQuestionPart | undefined {
  return isAskUserQuestionPart(part) ? (part as unknown as AskUserQuestionPart) : undefined;
}

/**
 * Resolves the assistant response message a pending action targets within
 * `messages`. Returns the index, or -1 when the assistant placeholder isn't present
 * yet (the caller retries on the next frame).
 *
 * Only ever matches an ASSISTANT message. The `responseMessageId` for a fresh turn
 * is the user message id with a trailing underscore (`<userMsg>_`), so a naive
 * underscore-strip would resolve to the just-created USER message before the
 * assistant placeholder exists — appending the prompt to the wrong bubble and never
 * triggering the retry. Matching strictly on assistant messages avoids that.
 */
export function findPendingActionMessageIndex(
  messages: TMessage[],
  pendingAction: Agents.PendingAction,
): number {
  const isAssistant = (message: TMessage | undefined) => message?.isCreatedByUser === false;
  const { responseMessageId } = pendingAction;
  if (responseMessageId) {
    // When the id is provided, ONLY an exact assistant match counts. A miss means the
    // assistant placeholder for this turn hasn't been inserted yet — return -1 so the
    // caller retries on the next frame. Falling back to the last assistant here would
    // attach the prompt/approval to a PRIOR reply (applyAskUserQuestion always appends),
    // and the retry would never run. The id is the in-flight response, so once it renders
    // the retry resolves it.
    return messages.findIndex(
      (message) => message.messageId === responseMessageId && isAssistant(message),
    );
  }
  /** No responseMessageId: best-effort to the last assistant (the in-flight placeholder). */
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAssistant(messages[i])) {
      return i;
    }
  }
  return -1;
}
