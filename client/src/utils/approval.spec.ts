import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessage, TMessageContentParts } from 'librechat-data-provider';
import {
  ASK_USER_QUESTION,
  applyPendingAction,
  countTaggedApprovalParts,
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

describe('countTaggedApprovalParts', () => {
  const twoToolAction = () =>
    toolApprovalAction({
      payload: {
        type: 'tool_approval',
        action_requests: [
          { name: 'search', arguments: '{}', tool_call_id: 'tc1' },
          { name: 'search', arguments: '{}', tool_call_id: 'tc2' },
        ],
        review_configs: [],
      },
    });

  it('counts tagged parts so a partial multi-tool apply is detectable (1 of 2)', () => {
    const action = twoToolAction();
    // Only tc1 has rendered when the action is first applied → 1 < 2, retry should continue.
    const partial = applyPendingAction(msg({ content: [toolCallPart('tc1')] }), action);
    expect(countTaggedApprovalParts(partial, 'a1')).toBe(1);
    // Both siblings present → both tagged → retry can stop.
    const full = applyPendingAction(
      msg({ content: [toolCallPart('tc1'), toolCallPart('tc2')] }),
      action,
    );
    expect(countTaggedApprovalParts(full, 'a1')).toBe(2);
  });

  it('returns 0 when nothing is tagged or content is not an array', () => {
    expect(countTaggedApprovalParts(msg({ content: [toolCallPart('tc1')] }), 'a1')).toBe(0);
    expect(countTaggedApprovalParts(msg({ content: [textPart('hi')] }), 'a1')).toBe(0);
    expect(
      countTaggedApprovalParts(
        msg({ content: undefined as unknown as TMessageContentParts[] }),
        'a1',
      ),
    ).toBe(0);
  });

  it('ignores parts tagged with a different actionId', () => {
    const tagged = applyPendingAction(
      msg({ content: [toolCallPart('tc1')] }),
      toolApprovalAction(),
    );
    expect(countTaggedApprovalParts(tagged, 'a1')).toBe(1);
    expect(countTaggedApprovalParts(tagged, 'other-action')).toBe(0);
  });
});

describe('applyPendingAction — subagent-nested tool calls', () => {
  const subagentMsg = (childId: string): TMessage =>
    msg({
      content: [
        {
          type: ContentTypes.TOOL_CALL,
          [ContentTypes.TOOL_CALL]: {
            id: 'sub1',
            name: 'subagent',
            args: '{}',
            subagent_content: [toolCallPart(childId)],
          },
        } as unknown as TMessageContentParts,
      ],
    });

  const childAction = () =>
    toolApprovalAction({
      payload: {
        type: 'tool_approval',
        action_requests: [{ name: 'search', arguments: '{}', tool_call_id: 'child-tc1' }],
        review_configs: [
          {
            action_name: 'search',
            tool_call_id: 'child-tc1',
            allowed_decisions: ['approve', 'reject'],
          },
        ],
      },
    });

  it('tags a tool paused inside a subagent and makes it countable', () => {
    const message = subagentMsg('child-tc1');
    const result = applyPendingAction(message, childAction());
    expect(result).not.toBe(message); // new reference

    const parentToolCall = getToolCall(result.content?.[0] as TMessageContentParts) as
      | { subagent_content?: TMessageContentParts[] }
      | undefined;
    const nested = parentToolCall?.subagent_content?.[0];
    expect(getToolCall(nested)?.approval).toMatchObject({ actionId: 'a1' });
    // The retry loop's "all tagged" check is now reachable for the nested call.
    expect(countTaggedApprovalParts(result, 'a1')).toBe(1);
  });

  it('returns the same message when no nested tool call matches', () => {
    const message = subagentMsg('child-other');
    expect(applyPendingAction(message, childAction())).toBe(message);
    expect(countTaggedApprovalParts(message, 'a1')).toBe(0);
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

  it('returns -1 (retry) when a provided responseMessageId matches only a user message', () => {
    // `<userMsg>_` style ids could collide with the user bubble — never resolve to it;
    // -1 makes the caller retry on the next frame once the assistant placeholder renders.
    const messages = [user('shared'), assistant('r-last')];
    const idx = findPendingActionMessageIndex(
      messages,
      toolApprovalAction({ responseMessageId: 'shared' }),
    );
    expect(idx).toBe(-1);
  });

  it('returns -1 (retry) when a provided responseMessageId is not found at all', () => {
    // Provided-but-absent means the in-flight assistant placeholder is not in the list
    // yet — defer rather than attach the prompt/approval to a prior reply.
    const messages = [assistant('r1'), user('u1'), assistant('r2')];
    const idx = findPendingActionMessageIndex(
      messages,
      toolApprovalAction({ responseMessageId: 'missing' }),
    );
    expect(idx).toBe(-1);
  });

  it('falls back to the last assistant message only when no responseMessageId is provided', () => {
    const messages = [assistant('r1'), user('u1'), assistant('r2')];
    const idx = findPendingActionMessageIndex(messages, toolApprovalAction());
    expect(idx).toBe(2);
  });

  it('returns -1 for an empty list or when no assistant message exists', () => {
    expect(findPendingActionMessageIndex([], toolApprovalAction())).toBe(-1);
    expect(findPendingActionMessageIndex([user('u1')], toolApprovalAction())).toBe(-1);
  });
});
