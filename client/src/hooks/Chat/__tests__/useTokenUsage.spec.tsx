import { getDefaultStore } from 'jotai';
import { renderHook } from '@testing-library/react';
import { QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TMessage, TConversation } from 'librechat-data-provider';
import type { ContextSnapshot } from '~/store/usage';
import { contextSnapshotFamily, snapshotsByAnchorFamily } from '~/store/usage';
import useTokenUsage from '~/hooks/Chat/useTokenUsage';

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessageId: () => 'a2',
}));

jest.mock('~/hooks/Chat/useTokenLimits', () => ({
  __esModule: true,
  default: () => ({ maxContextTokens: 200000, endpoint: 'agents', model: 'test-model' }),
}));

const convo = 'convo-post-snapshot';

/** Two completed turns: the tail response `a2` answers `u2`. */
const messages = [
  {
    messageId: 'u1',
    parentMessageId: null,
    conversationId: convo,
    isCreatedByUser: true,
    tokenCount: 400,
    text: 'first ask',
  },
  {
    messageId: 'a1',
    parentMessageId: 'u1',
    conversationId: convo,
    isCreatedByUser: false,
    tokenCount: 1500,
    text: 'first answer',
  },
  {
    messageId: 'u2',
    parentMessageId: 'a1',
    conversationId: convo,
    isCreatedByUser: true,
    tokenCount: 500,
    text: 'second ask',
  },
  {
    messageId: 'a2',
    parentMessageId: 'u2',
    conversationId: convo,
    isCreatedByUser: false,
    tokenCount: 2000,
    text: 'second answer',
  },
] as unknown as TMessage[];

/** Persisted per-turn snapshots: used grows 1000 tokens per call
 *  (196000 → 195000 remaining of a 200000 budget). */
const anchorSnapshot = (remaining: number): ContextSnapshot =>
  ({
    anchorMessageId: null,
    contextBudget: 200000,
    remainingContextTokens: remaining,
    breakdown: { maxContextTokens: 200000 },
  }) as unknown as ContextSnapshot;

/** The live snapshot for the tail call: pre-invoke, so its remaining headroom
 *  and message total both predate `a2`'s 2000 output tokens. */
const tailSnapshot: ContextSnapshot = {
  anchorMessageId: 'u2',
  contextBudget: 200000,
  remainingContextTokens: 5000,
  completedOutputTokens: 2000,
  breakdown: {
    maxContextTokens: 200000,
    instructionTokens: 4000,
    messageTokens: 10000,
  },
} as unknown as ContextSnapshot;

const renderTokenUsage = (
  anchors: Map<string, ContextSnapshot> = new Map([
    ['a1', anchorSnapshot(196000)],
    ['a2', anchorSnapshot(195000)],
  ]),
  overrides: { messages?: TMessage[]; snapshot?: ContextSnapshot } = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData([QueryKeys.messages, convo], overrides.messages ?? messages);
  const store = getDefaultStore();
  store.set(contextSnapshotFamily(convo), overrides.snapshot ?? tailSnapshot);
  store.set(snapshotsByAnchorFamily(convo), anchors);

  return renderHook(
    () =>
      useTokenUsage({
        index: 0,
        conversation: { conversationId: convo, endpoint: 'agents' } as TConversation,
        isSubmitting: false,
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
};

describe('useTokenUsage — post-snapshot output', () => {
  it('charges the finalized output against the runway projection', () => {
    const { result } = renderTokenUsage();

    /** 5000 pre-invoke remaining − 2000 already generated = 3000 of real
     *  headroom at 1000 tokens per call. Using the stale remaining would
     *  promise 5 more turns. */
    expect(result.current.runwayTurns).toBe(3);
  });

  it('counts the finalized output in what a summarization could reclaim', () => {
    const { result } = renderTokenUsage();

    /** 10000 pre-invoke message tokens + 2000 finalized output − the kept
     *  latest exchange (500 + 2000) = 9500. Omitting the output would
     *  under-report the reclaim by the size of the final answer. */
    expect(result.current.compactionReclaim).toBe(9500);
  });

  /** The older persisted shape: a budget and a breakdown, no remaining count. */
  const legacySnapshot = (messageTokens: number): ContextSnapshot =>
    ({
      anchorMessageId: null,
      contextBudget: 200000,
      breakdown: { maxContextTokens: 200000, instructionTokens: 4000, messageTokens },
    }) as unknown as ContextSnapshot;

  it('projects a branch whose snapshots predate the remaining-token field', () => {
    /** Both readings are instruction+messages sums — 13000 then 14000, so the
     *  call grew 1000. Reading the absent remaining as zero would score both
     *  turns as having spent the entire 200000 window and hide the projection. */
    const { result } = renderTokenUsage(
      new Map([
        ['a1', legacySnapshot(9000)],
        ['a2', legacySnapshot(10000)],
      ]),
    );

    expect(result.current.runwayTurns).toBe(3);
  });

  it('withholds the projection when the two readings were measured differently', () => {
    /** `a1` reports remaining headroom (4000 used of 200000) and `a2` only a
     *  breakdown (14000). Their difference is the content a breakdown omits,
     *  not what the last call added, so no per-call growth can be read from
     *  the pair — a 10000-token "growth" would report zero turns left. */
    const { result } = renderTokenUsage(
      new Map([
        ['a1', anchorSnapshot(196000)],
        ['a2', legacySnapshot(10000)],
      ]),
    );

    expect(result.current.runwayTurns).toBeUndefined();
  });

  it('leaves a summarizing turn’s summary completion out of the reclaim estimate', () => {
    /** The tail turn compacted: its `tokenCount` carries the 700-token
     *  summarization completion the backend folded in, while the snapshot holds
     *  those tokens in `summaryTokens` rather than `messageTokens`. Subtracting
     *  the whole response would understate the reclaim by that summary.
     *  10000 messages + 2000 finalized output − (500 user + 2000 answer − 700
     *  summary) = 10200. */
    const summarizedMessages = messages.map((message) =>
      (message as TMessage).messageId === 'a2'
        ? ({ ...message, metadata: { summaryUsedTokens: 8000 } } as TMessage)
        : message,
    );

    /** After finalize the live snapshot is re-anchored to the response id, so
     *  the compacting turn's own snapshot still describes the viewed branch. */
    const summarizedSnapshot = {
      ...tailSnapshot,
      anchorMessageId: 'a2',
      breakdown: { ...tailSnapshot.breakdown, summaryTokens: 700 },
    } as unknown as ContextSnapshot;

    const { result } = renderTokenUsage(undefined, {
      messages: summarizedMessages,
      snapshot: summarizedSnapshot,
    });

    expect(result.current.compactionReclaim).toBe(10200);
  });
});
