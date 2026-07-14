import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessage, TSteerAppliedEvent } from 'librechat-data-provider';
import { applySteerPart, findSteerMessageIndex, getSteerPart, resolveRunEndTarget } from '../steer';

const buildEvent = (overrides: Partial<TSteerAppliedEvent> = {}): TSteerAppliedEvent => ({
  steerId: 'steer-1',
  index: 2,
  part: {
    type: ContentTypes.STEER,
    [ContentTypes.STEER]: 'change course',
    steerId: 'steer-1',
  },
  ...overrides,
});

const assistantMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'resp-1',
    conversationId: 'convo-1',
    isCreatedByUser: false,
    text: '',
    content: [
      { type: ContentTypes.TEXT, text: 'part 0' },
      { type: ContentTypes.TEXT, text: 'part 1' },
    ],
    ...overrides,
  }) as TMessage;

describe('applySteerPart', () => {
  it('places the part at its absolute index on a new message object', () => {
    const message = assistantMessage();
    const updated = applySteerPart(message, buildEvent());

    expect(updated).not.toBe(message);
    expect(updated.content).toHaveLength(3);
    expect(getSteerPart(updated.content?.[2])?.steer).toBe('change course');
    expect(message.content).toHaveLength(2);
  });

  it('writes by index even past the current end (holes preserved)', () => {
    const message = assistantMessage({ content: [{ type: ContentTypes.TEXT, text: 'only' }] });
    const updated = applySteerPart(message, buildEvent({ index: 3 }));

    expect(updated.content).toHaveLength(4);
    expect(getSteerPart(updated.content?.[3])?.steerId).toBe('steer-1');
    expect(updated.content?.[1]).toBeUndefined();
  });

  it('is idempotent for a replayed event (same reference back)', () => {
    const message = assistantMessage();
    const once = applySteerPart(message, buildEvent());
    const twice = applySteerPart(once, buildEvent());

    expect(twice).toBe(once);
  });

  it('handles a message without content', () => {
    const message = assistantMessage({ content: undefined });
    const updated = applySteerPart(message, buildEvent({ index: 0 }));

    expect(getSteerPart(updated.content?.[0])?.steer).toBe('change course');
  });

  it('ignores malformed events', () => {
    const message = assistantMessage();
    expect(applySteerPart(message, buildEvent({ index: -1 }))).toBe(message);
    expect(
      applySteerPart(message, { steerId: 's', index: 0 } as unknown as TSteerAppliedEvent),
    ).toBe(message);
  });
});

describe('findSteerMessageIndex', () => {
  const userMessage = {
    messageId: 'user-1',
    isCreatedByUser: true,
  } as TMessage;

  it('matches the exact assistant message by responseMessageId', () => {
    const messages = [userMessage, assistantMessage(), assistantMessage({ messageId: 'resp-2' })];
    expect(findSteerMessageIndex(messages, buildEvent({ responseMessageId: 'resp-2' }))).toBe(2);
  });

  it('returns -1 when the identified response has not rendered yet', () => {
    const messages = [userMessage, assistantMessage()];
    expect(findSteerMessageIndex(messages, buildEvent({ responseMessageId: 'resp-future' }))).toBe(
      -1,
    );
  });

  it('never matches a user message by id', () => {
    const messages = [userMessage];
    expect(findSteerMessageIndex(messages, buildEvent({ responseMessageId: 'user-1' }))).toBe(-1);
  });

  it('falls back to the last assistant message without an id', () => {
    const messages = [assistantMessage({ messageId: 'old' }), userMessage, assistantMessage()];
    expect(findSteerMessageIndex(messages, buildEvent())).toBe(2);
  });
});

describe('resolveRunEndTarget', () => {
  it('keys an early-aborted first turn under NEW_CONVO and drops the migration flag', () => {
    expect(
      resolveRunEndTarget({
        conversationId: 'optimistic-stream-id',
        earlyAbort: true,
        startedAsNewConvo: true,
      }),
    ).toEqual({ conversationId: String(Constants.NEW_CONVO), startedAsNewConvo: false });
  });

  it('keeps the real conversation id for an early abort of an existing conversation', () => {
    expect(
      resolveRunEndTarget({
        conversationId: 'convo-real',
        earlyAbort: true,
        startedAsNewConvo: false,
      }),
    ).toEqual({ conversationId: 'convo-real', startedAsNewConvo: false });
  });

  it('passes normal completions through untouched', () => {
    expect(
      resolveRunEndTarget({
        conversationId: 'convo-real',
        earlyAbort: false,
        startedAsNewConvo: true,
      }),
    ).toEqual({ conversationId: 'convo-real', startedAsNewConvo: true });
  });
});
