import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessage, TSteerAppliedEvent } from 'librechat-data-provider';
import type { QueuedMessage } from '~/store/families';
import {
  getSteerPart,
  applySteerPart,
  resolveRunEndTarget,
  bumpQueuedMessage,
  mergeQueuedMessages,
  findSteerMessageIndex,
  appendAppliedSteerIds,
  resolveAbortSteerTarget,
  compareQueuedMessages,
  insertQueuedOrigin,
  isMergeableQueuedMessage,
} from '../steer';

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

describe('resolveAbortSteerTarget', () => {
  it('keeps chips under NEW_CONVO on a new-held first turn while claiming under the resolved id', () => {
    expect(
      resolveAbortSteerTarget({
        conversationId: String(Constants.NEW_CONVO),
        resolvedId: 'convo-resolved',
      }),
    ).toEqual({
      chipConvoId: String(Constants.NEW_CONVO),
      claimConvoId: 'convo-resolved',
    });
  });

  it('prefers the resolved id for both targets on an existing conversation', () => {
    expect(
      resolveAbortSteerTarget({ conversationId: 'convo-held', resolvedId: 'convo-resolved' }),
    ).toEqual({ chipConvoId: 'convo-resolved', claimConvoId: 'convo-resolved' });
  });

  it('falls back to the client-held id without a resolved id', () => {
    expect(resolveAbortSteerTarget({ conversationId: 'convo-held' })).toEqual({
      chipConvoId: 'convo-held',
      claimConvoId: 'convo-held',
    });
    expect(resolveAbortSteerTarget({ conversationId: String(Constants.NEW_CONVO) })).toEqual({
      chipConvoId: String(Constants.NEW_CONVO),
      claimConvoId: String(Constants.NEW_CONVO),
    });
  });
});

describe('appendAppliedSteerIds', () => {
  it('appends new ids and dedupes against the existing set', () => {
    expect(appendAppliedSteerIds(['a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns the same array reference when nothing new lands', () => {
    const prev = ['a', 'b'];
    expect(appendAppliedSteerIds(prev, ['a'])).toBe(prev);
    expect(appendAppliedSteerIds(prev, [])).toBe(prev);
  });

  it('retains both correlation ids for all 100 server receipt slots', () => {
    const prev = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const next = appendAppliedSteerIds(prev, ['id-new']);
    expect(next).toHaveLength(200);
    expect(next[0]).toBe('id-1');
    expect(next[next.length - 1]).toBe('id-new');
  });
});

describe('insertQueuedOrigin', () => {
  const staleOrigin = {
    item: {
      id: 'queued-c',
      text: 'send C',
      createdAt: 3,
      expectedPredecessorCreatedAt: 1000,
    },
    beforeIds: [],
    afterIds: ['queued-d'],
  };

  it('rebases an already-restored row so its next resend targets the terminal winner', () => {
    const restored = insertQueuedOrigin(
      [{ id: 'queued-d', text: 'send D', createdAt: 4 }],
      staleOrigin,
    );
    const rebased = insertQueuedOrigin(restored, staleOrigin, 2000);

    expect(rebased).toEqual([
      expect.objectContaining({
        id: 'queued-c',
        expectedPredecessorCreatedAt: 2000,
      }),
      expect.objectContaining({ id: 'queued-d' }),
    ]);
  });
});

const queued = (overrides: Partial<QueuedMessage> & { id: string }): QueuedMessage => ({
  text: `text ${overrides.id}`,
  createdAt: 1,
  ...overrides,
});

describe('compareQueuedMessages', () => {
  const ids = (items: QueuedMessage[]) =>
    [...items].sort(compareQueuedMessages).map(({ id }) => id);

  it('orders by enqueue time by default', () => {
    expect(ids([queued({ id: 'b', createdAt: 2 }), queued({ id: 'a', createdAt: 1 })])).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps interrupt front-inserts ahead of chronologically older rows', () => {
    expect(
      ids([
        queued({ id: 'old', createdAt: 1 }),
        queued({ id: 'armed', createdAt: 9, priority: true }),
      ]),
    ).toEqual(['armed', 'old']);
  });

  it('drains the most recently promoted row first', () => {
    const items = [
      queued({ id: 'first-bump', createdAt: 1, priority: true, bumpedAt: 100 }),
      queued({ id: 'second-bump', createdAt: 2, priority: true, bumpedAt: 200 }),
      queued({ id: 'plain', createdAt: 3 }),
    ];
    expect(ids(items)).toEqual(['second-bump', 'first-bump', 'plain']);
  });

  it('ranks a promoted row ahead of an unpromoted interrupt front-insert', () => {
    const items = [
      queued({ id: 'armed', createdAt: 1, priority: true }),
      queued({ id: 'bumped', createdAt: 5, priority: true, bumpedAt: 50 }),
    ];
    expect(ids(items)).toEqual(['bumped', 'armed']);
  });
});

describe('bumpQueuedMessage', () => {
  const queue = [
    queued({ id: 'a', createdAt: 1 }),
    queued({ id: 'b', createdAt: 2 }),
    queued({ id: 'c', createdAt: 3 }),
  ];

  it('moves the chosen row to the front and preserves the rest of the order', () => {
    expect(bumpQueuedMessage(queue, 'c', 500).map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  it('survives a later enqueue, because the order lives in the sort key', () => {
    const bumped = bumpQueuedMessage(queue, 'c', 500);
    const afterEnqueue = [...bumped, queued({ id: 'd', createdAt: 4 })].sort(compareQueuedMessages);
    expect(afterEnqueue.map(({ id }) => id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('returns the same array when the id is gone', () => {
    expect(bumpQueuedMessage(queue, 'missing', 500)).toBe(queue);
  });
});

describe('isMergeableQueuedMessage', () => {
  it('rejects rows bound to a parked server source', () => {
    expect(isMergeableQueuedMessage(queued({ id: 'a', recoverySteerId: 'steer-1' }))).toBe(false);
    expect(isMergeableQueuedMessage(queued({ id: 'b', clientRequestId: 'req-1' }))).toBe(false);
  });

  it('accepts ordinary local rows', () => {
    expect(isMergeableQueuedMessage(queued({ id: 'c' }))).toBe(true);
  });
});

describe('mergeQueuedMessages', () => {
  it('joins texts in drain order as paragraphs', () => {
    const merged = mergeQueuedMessages([
      queued({ id: 'a', text: 'first thought', createdAt: 1 }),
      queued({ id: 'b', text: 'second thought', createdAt: 2 }),
    ]);
    expect(merged?.text).toBe('first thought\n\nsecond thought');
  });

  it('keeps the front row`s identity and position', () => {
    const merged = mergeQueuedMessages([
      queued({ id: 'a', createdAt: 7, priority: true, bumpedAt: 90 }),
      queued({ id: 'b', createdAt: 8 }),
    ]);
    expect(merged).toMatchObject({ id: 'a', createdAt: 7, priority: true, bumpedAt: 90 });
  });

  it('unions attachments, quotes and skill picks without duplicates', () => {
    const merged = mergeQueuedMessages([
      queued({
        id: 'a',
        files: [{ file_id: 'f1', filepath: '/f1', type: 'image/png' }],
        quotes: ['q1'],
        manualSkills: ['s1'],
      }),
      queued({
        id: 'b',
        files: [
          { file_id: 'f1', filepath: '/f1', type: 'image/png' },
          { file_id: 'f2', filepath: '/f2', type: 'image/png' },
        ],
        quotes: ['q1', 'q2'],
        manualSkills: ['s2'],
      }),
    ]);
    expect(merged?.files?.map((file) => file.file_id)).toEqual(['f1', 'f2']);
    expect(merged?.quotes).toEqual(['q1', 'q2']);
    expect(merged?.manualSkills).toEqual(['s1', 's2']);
  });

  it('takes the latest predecessor fence so the merged turn is gated on everything it followed', () => {
    const merged = mergeQueuedMessages([
      queued({ id: 'a', expectedPredecessorCreatedAt: 100 }),
      queued({ id: 'b', expectedPredecessorCreatedAt: 400 }),
    ]);
    expect(merged?.expectedPredecessorCreatedAt).toBe(400);
  });

  it('refuses to merge a recovery-bound row, whose parked source must be discarded first', () => {
    expect(
      mergeQueuedMessages([
        queued({ id: 'a' }),
        queued({ id: 'b', recoverySteerId: 'steer-1', recoveryClientSteerId: 'local-1' }),
      ]),
    ).toBeNull();
  });

  it('refuses a batch of fewer than two rows', () => {
    expect(mergeQueuedMessages([queued({ id: 'a' })])).toBeNull();
  });
});
