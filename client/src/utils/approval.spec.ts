import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessage, TMessageContentParts } from 'librechat-data-provider';
import {
  ASK_USER_QUESTION,
  applyPendingAction,
  getAskUserQuestionPart,
  findPendingActionMessageIndex,
} from './approval';

const toolCallPart = (id: string, extra: Record<string, unknown> = {}): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: { id, name: 'search', args: '{}', ...extra },
  }) as unknown as TMessageContentParts;

const textPart = (text: string): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text }) as unknown as TMessageContentParts;

const msg = (over: Partial<TMessage> = {}): TMessage =>
  ({ messageId: 'm1', isCreatedByUser: false, content: [], ...over }) as unknown as TMessage;

const toolApprovalAction = (over: Record<string, unknown> = {}): Agents.PendingAction =>
  ({
    actionId: 'a1',
    streamId: 's1',
    createdAt: 0,
    payload: {
      type: 'tool_approval',
      action_requests: [
        { name: 'search', arguments: '{}', tool_call_id: 'tc1', description: 'Run search' },
      ],
      review_configs: [
        { action_name: 'search', tool_call_id: 'tc1', allowed_decisions: ['approve', 'reject'] },
      ],
    },
    ...over,
  }) as unknown as Agents.PendingAction;

const askAction = (over: Record<string, unknown> = {}): Agents.PendingAction =>
  ({
    actionId: 'a1',
    streamId: 's1',
    createdAt: 0,
    payload: { type: 'ask_user_question', question: { question: 'What name?' } },
    ...over,
  }) as unknown as Agents.PendingAction;

const getToolCall = (part: TMessageContentParts | undefined) =>
  (part as unknown as { tool_call?: Agents.ToolCall & { approval?: unknown } })?.tool_call;

describe('applyPendingAction — tool_approval', () => {
  it('joins by tool_call_id (not position) and sets approval from the matching request + review', () => {
    // tc1 is the SECOND part — a by-position join would mis-target the first.
    const message = msg({ content: [toolCallPart('tcX'), toolCallPart('tc1')] });
    const result = applyPendingAction(message, toolApprovalAction());

    expect(result).not.toBe(message); // new reference: something changed
    expect(getToolCall(result.content?.[0] as TMessageContentParts)?.approval).toBeUndefined();
    expect(getToolCall(result.content?.[1] as TMessageContentParts)?.approval).toEqual({
      actionId: 'a1',
      allowed_decisions: ['approve', 'reject'],
      description: 'Run search',
    });
  });

  it('leaves a completed tool call (with output) untouched and returns the same message reference', () => {
    const message = msg({ content: [toolCallPart('tc1', { output: 'already ran' })] });
    const result = applyPendingAction(message, toolApprovalAction());
    expect(result).toBe(message);
  });

  it('defaults allowed_decisions to [] when no review config matches the tool call', () => {
    const action = toolApprovalAction({
      payload: {
        type: 'tool_approval',
        action_requests: [{ name: 'search', arguments: '{}', tool_call_id: 'tc1' }],
        review_configs: [], // no config for tc1
      },
    });
    const message = msg({ content: [toolCallPart('tc1')] });
    const result = applyPendingAction(message, action);
    expect(getToolCall(result.content?.[0] as TMessageContentParts)?.approval).toMatchObject({
      allowed_decisions: [],
    });
  });

  it('returns the same message when content is empty or not an array', () => {
    const empty = msg({ content: [] });
    expect(applyPendingAction(empty, toolApprovalAction())).toBe(empty);
    const nonArray = msg({ content: undefined as unknown as TMessageContentParts[] });
    expect(applyPendingAction(nonArray, toolApprovalAction())).toBe(nonArray);
  });

  it('returns the same message when no tool call matches the pending request', () => {
    const message = msg({ content: [toolCallPart('other')] });
    expect(applyPendingAction(message, toolApprovalAction())).toBe(message);
  });
});

describe('applyPendingAction — ask_user_question', () => {
  it('appends a synthetic ask-user-question part carrying the actionId and question', () => {
    const message = msg({ content: [textPart('hello')] });
    const result = applyPendingAction(message, askAction());
    expect(result.content).toHaveLength(2);
    const part = getAskUserQuestionPart(result.content?.[1] as TMessageContentParts);
    expect(part?.[ASK_USER_QUESTION]).toMatchObject({
      actionId: 'a1',
      question: { question: 'What name?' },
    });
  });

  it('is idempotent on replay: the same actionId replaces in place rather than stacking', () => {
    const once = applyPendingAction(msg({ content: [] }), askAction());
    const twice = applyPendingAction(once, askAction());
    expect(twice.content).toHaveLength(1); // not duplicated

    const other = applyPendingAction(twice, askAction({ actionId: 'a2' }));
    expect(other.content).toHaveLength(2); // a different action does append
  });

  it('coerces non-array content to a single-part array', () => {
    const message = msg({ content: undefined as unknown as TMessageContentParts[] });
    const result = applyPendingAction(message, askAction());
    expect(result.content).toHaveLength(1);
  });
});

describe('applyPendingAction — unsupported type', () => {
  it('returns the original message unchanged', () => {
    const message = msg({ content: [textPart('hi')] });
    const action = {
      actionId: 'a1',
      payload: { type: 'mystery' },
    } as unknown as Agents.PendingAction;
    expect(applyPendingAction(message, action)).toBe(message);
  });
});

describe('getAskUserQuestionPart', () => {
  it('returns the typed part for an ask-user-question synthetic part', () => {
    const appended = applyPendingAction(msg({ content: [] }), askAction());
    const part = getAskUserQuestionPart(appended.content?.[0] as TMessageContentParts);
    expect(part?.type).toBe(ASK_USER_QUESTION);
    expect(part?.[ASK_USER_QUESTION].actionId).toBe('a1');
  });

  it('returns undefined for a non-ask part, undefined, or a wrong type', () => {
    expect(getAskUserQuestionPart(toolCallPart('tc1'))).toBeUndefined();
    expect(getAskUserQuestionPart(undefined)).toBeUndefined();
    expect(getAskUserQuestionPart(textPart('x'))).toBeUndefined();
  });
});

describe('findPendingActionMessageIndex', () => {
  const assistant = (messageId: string) => msg({ messageId, isCreatedByUser: false });
  const user = (messageId: string) => msg({ messageId, isCreatedByUser: true });

  it('returns the index of the assistant message matching responseMessageId exactly', () => {
    const messages = [user('u1'), assistant('r1'), assistant('r2')];
    const idx = findPendingActionMessageIndex(
      messages,
      toolApprovalAction({ responseMessageId: 'r1' }),
    );
    expect(idx).toBe(1);
  });

  it('skips a user message that shares the responseMessageId and falls back to the last assistant', () => {
    // `<userMsg>_` style ids could collide with the user bubble — the function must
    // never resolve to a user message.
    const messages = [user('shared'), assistant('r-last')];
    const idx = findPendingActionMessageIndex(
      messages,
      toolApprovalAction({ responseMessageId: 'shared' }),
    );
    expect(idx).toBe(1);
  });

  it('falls back to the last assistant message when there is no exact match', () => {
    const messages = [assistant('r1'), user('u1'), assistant('r2')];
    const idx = findPendingActionMessageIndex(
      messages,
      toolApprovalAction({ responseMessageId: 'missing' }),
    );
    expect(idx).toBe(2);
  });

  it('returns -1 for an empty list or when no assistant message exists', () => {
    expect(findPendingActionMessageIndex([], toolApprovalAction())).toBe(-1);
    expect(findPendingActionMessageIndex([user('u1')], toolApprovalAction())).toBe(-1);
  });
});
