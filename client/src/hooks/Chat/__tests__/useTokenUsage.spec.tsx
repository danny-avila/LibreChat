import { getDefaultStore } from 'jotai';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TMessage, TConversation } from 'librechat-data-provider';
import type { ContextSnapshot } from '~/store/usage';
import {
  contextSnapshotFamily,
  pendingUsageFamily,
  activeUsageResponseIdFamily,
  liveTokensFamily,
  removeUsageAtoms,
  snapshotsByAnchorFamily,
} from '~/store/usage';
import { useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import useUsageHandler from '~/hooks/SSE/useUsageHandler';
import useTokenUsage from '~/hooks/Chat/useTokenUsage';

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessageId: jest.fn(() => 'a2'),
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
    model: 'test-model',
    provider: 'openAI',
    contextBudget: 200000,
    remainingContextTokens: remaining,
    breakdown: { maxContextTokens: 200000, instructionTokens: 4000 },
  }) as unknown as ContextSnapshot;

/** The live snapshot for the tail call: pre-invoke, so its remaining headroom
 *  and message total both predate `a2`'s 2000 output tokens. */
const tailSnapshot: ContextSnapshot = {
  anchorMessageId: 'u2',
  model: 'test-model',
  provider: 'openAI',
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
  overrides: { messages?: TMessage[]; snapshot?: ContextSnapshot; isSubmitting?: boolean } = {},
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
        isSubmitting: overrides.isSubmitting ?? false,
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
};

describe('useTokenUsage — post-snapshot output', () => {
  beforeEach(() => {
    jest.mocked(useLatestMessageId).mockReturnValue('a2');
    removeUsageAtoms(convo);
  });

  it('keeps a viewed sibling isolated while another response streams and finalizes', () => {
    const saved = messages.map((message) =>
      message.messageId === 'a2'
        ? {
            ...message,
            metadata: {
              usage: { input: 25, output: 10, cacheRead: 100, cacheWrite: 0, cost: 0.01 },
            },
          }
        : message,
    );
    const generating = { ...messages[3], messageId: 'a2-alt', tokenCount: 0, text: '' };
    const { result: writer } = renderHook(() => useUsageHandler());
    const submission = {
      userMessage: { messageId: 'u2', conversationId: convo },
      initialResponse: { messageId: 'a2-alt', parentMessageId: 'u2' },
      conversation: { conversationId: convo },
      isRegenerate: true,
    };
    const store = getDefaultStore();
    const liveSnapshot = {
      ...tailSnapshot,
      anchorMessageId: 'u2',
      responseMessageId: 'a2-alt',
      completedOutputTokens: 0,
      remainingContextTokens: 8000,
    };
    const usage = {
      input_tokens: 40,
      output_tokens: 4,
      input_token_details: { cache_read: 300 },
      cost: 0.02,
      runId: 'sibling-run',
      seq: 1,
    };
    writer.current.backfillUsage([usage], submission);
    store.set(liveTokensFamily(convo), 100);
    const { result, rerender } = renderTokenUsage(new Map([['a2', tailSnapshot]]), {
      messages: [...saved, generating] as TMessage[],
      isSubmitting: true,
      snapshot: liveSnapshot,
    });

    expect(result.current.turnInProgress).toBe(false);
    expect(result.current.lastTurnUsage?.cacheRead).toBe(100);
    expect(result.current.branchUsage.cacheRead).toBe(100);
    expect(result.current.totalUsage.cacheRead).toBe(400);
    expect(result.current.liveTokens).toBe(0);
    expect(result.current.usedTokens).toBe(197000);

    jest.mocked(useLatestMessageId).mockReturnValue('a2-alt');
    rerender();
    expect(result.current.turnInProgress).toBe(true);
    expect(result.current.lastTurnUsage?.cacheRead).toBe(300);
    expect(result.current.branchUsage.cacheRead).toBe(300);
    expect(result.current.usedTokens).toBe(192100);

    jest.mocked(useLatestMessageId).mockReturnValue('a2');
    rerender();
    act(() =>
      writer.current.finalizeUsage(
        { responseMessage: generating, conversation: { conversationId: convo } },
        submission,
      ),
    );
    expect(result.current.branchTotals.tailId).toBe('a2');
    expect(result.current.lastTurnUsage?.cacheRead).toBe(100);
    expect(result.current.branchUsage.cacheRead).toBe(100);
    expect(result.current.totalUsage.cacheRead).toBe(400);
    expect(store.get(activeUsageResponseIdFamily(convo))).toBeNull();
  });

  it('uses the selected branch estimate when only a sibling has live context', () => {
    const store = getDefaultStore();
    store.set(activeUsageResponseIdFamily(convo), 'a2-alt');
    store.set(liveTokensFamily(convo), 9000);
    const { result } = renderTokenUsage(new Map(), {
      isSubmitting: true,
      snapshot: { ...tailSnapshot, responseMessageId: 'a2-alt' },
    });
    expect(result.current.isEstimate).toBe(true);
    expect(result.current.liveTokens).toBe(0);
    expect(result.current.usedTokens).toBe(4400);
  });

  it('keeps ancestor context cache distinct from a newer response with usage but no snapshot', () => {
    const ancestor = { ...tailSnapshot, anchorMessageId: 'a1', cacheRead: 1234, cacheWrite: 50 };
    const saved = messages.map((message) =>
      message.messageId === 'a2'
        ? {
            ...message,
            metadata: { usage: { input: 10, output: 5, cacheRead: 888, cacheWrite: 20 } },
          }
        : message,
    );
    const { result } = renderTokenUsage(new Map([['a1', ancestor]]), {
      messages: saved as TMessage[],
      snapshot: { ...tailSnapshot, anchorMessageId: 'another-branch' },
    });
    expect(result.current.cacheRead).toBe(1234);
    expect(result.current.cacheWrite).toBe(50);
    expect(result.current.lastTurnUsage?.cacheRead).toBe(888);
    expect(result.current.turnInProgress).toBe(false);
  });

  it('uses the selected response rollup, not the cumulative branch usage', () => {
    const saved = messages.map((message) => {
      if (message.messageId === 'a1') {
        return {
          ...message,
          metadata: { usage: { input: 100, output: 20, cacheRead: 500, cacheWrite: 0 } },
        };
      }
      if (message.messageId === 'a2') {
        return {
          ...message,
          metadata: { usage: { input: 30, output: 15, cacheRead: 700, cacheWrite: 50, cost: 0 } },
        };
      }
      return message;
    }) as TMessage[];
    const { result, unmount } = renderTokenUsage(undefined, { messages: saved });

    expect(result.current.lastTurnUsage).toEqual({
      input: 30,
      output: 15,
      cacheRead: 700,
      cacheWrite: 50,
      cost: 0,
      costKnown: true,
    });
    expect(result.current.branchUsage.input).toBe(130);
    expect(result.current.branchUsage.cacheRead).toBe(1200);
    expect(result.current.branchUsage.costKnown).toBe(false);
    unmount();
  });

  it('reports only confirmed calls in an in-progress turn, never the previous tail', () => {
    const pendingAtom = pendingUsageFamily(convo);
    const store = getDefaultStore();
    store.set(activeUsageResponseIdFamily(convo), 'a2');
    const saved = messages.map((message) =>
      message.messageId === 'a2'
        ? ({
            ...message,
            metadata: { usage: { input: 100, output: 10, cacheRead: 50, cacheWrite: 0 } },
          } as TMessage)
        : message,
    );
    store.set(pendingAtom, {
      input: 40,
      output: 4,
      cacheRead: 300,
      cacheWrite: 20,
      eventCount: 2,
      costUSD: 0.01,
      costKnown: true,
    });
    const { result, unmount } = renderTokenUsage(undefined, {
      messages: saved,
      isSubmitting: true,
    });
    expect(result.current.turnInProgress).toBe(true);
    expect(result.current.lastTurnUsage?.input).toBe(40);
    expect(result.current.lastTurnUsage?.cacheRead).toBe(300);
    expect(result.current.branchUsage.cacheRead).toBe(350);
    unmount();
    store.set(pendingAtom, {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      eventCount: 0,
      costUSD: 0,
      costKnown: true,
    });
    store.set(activeUsageResponseIdFamily(convo), 'a2');
    const waiting = renderTokenUsage(undefined, { messages: saved, isSubmitting: true });
    expect(waiting.result.current.lastTurnUsage).toBeUndefined();
    waiting.unmount();
  });

  it('charges the finalized output against the runway projection', () => {
    const { result } = renderTokenUsage();

    /** 5000 pre-invoke remaining − 2000 already generated = 3000 of real
     *  headroom at 1000 tokens per call. Using the stale remaining would
     *  promise 5 more turns. */
    expect(result.current.runwayTurns).toBe(3);
  });

  it('charges retained tool results in the gauge, tool share, and runway', () => {
    const retainedSnapshot = {
      ...tailSnapshot,
      retainedToolTokens: 700,
      breakdown: { ...tailSnapshot.breakdown, toolMessageTokens: 900 },
    } as ContextSnapshot;
    const { result } = renderTokenUsage(undefined, { snapshot: retainedSnapshot });

    /** The retained result is post-snapshot context: 195000 pre-invoke used +
     *  2000 finalized output + 700 retained tool tokens = 197700. The split
     *  widens from 900 to 1600, while runway headroom falls to 2300 (2 turns). */
    expect(result.current.usedTokens).toBe(197700);
    expect(result.current.toolCallTokens).toBe(1600);
    expect(result.current.runwayTurns).toBe(2);
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
      model: 'test-model',
      provider: 'openAI',
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

  it.each([
    { model: 'other-model' },
    { provider: 'anthropic' },
    { agentId: 'other-agent' },
    { contextBudget: 100000 },
    { breakdown: { maxContextTokens: 200000, instructionTokens: 8000 } },
    { breakdown: { maxContextTokens: 200000, toolSchemaTokens: 8000 } },
    { model: undefined },
    { provider: undefined },
  ])('withholds runway across a configuration change: %j', (change) => {
    const { result } = renderTokenUsage(
      new Map([
        [
          'a1',
          {
            ...anchorSnapshot(196000),
            ...change,
            breakdown: { ...anchorSnapshot(196000).breakdown, ...change.breakdown },
          },
        ],
        ['a2', anchorSnapshot(195000)],
      ]),
    );
    expect(result.current.runwayTurns).toBeUndefined();
  });

  it('withholds old runway history during a newly configured run', () => {
    const { result } = renderTokenUsage(undefined, {
      snapshot: { ...tailSnapshot, model: 'new-model' },
    });
    expect(result.current.runwayTurns).toBeUndefined();
  });

  it('restores cache rows and call identity from persisted snapshots', () => {
    const persisted = {
      ...anchorSnapshot(195000),
      cacheRead: 800,
      cacheWrite: 200,
      completedOutputTokens: 50,
    };
    const persistedById: Record<string, ContextSnapshot> = {
      a1: anchorSnapshot(196000),
      a2: persisted,
    };
    const { result } = renderTokenUsage(new Map(), {
      snapshot: { ...tailSnapshot, anchorMessageId: 'unrelated-branch' },
      messages: messages.map((message) => ({
        ...message,
        metadata: {
          contextUsage: persistedById[message.messageId],
        },
      })),
    });
    expect(result.current.cacheRead).toBe(800);
    expect(result.current.cacheWrite).toBe(200);
    expect(result.current.snapshot?.model).toBe('test-model');
    expect(result.current.runwayTurns).toBe(194);
  });

  it('excludes the retained latest tool result from compaction savings', () => {
    const { result } = renderTokenUsage(undefined, {
      messages: messages.map((message) =>
        message.messageId === 'a2'
          ? ({
              ...message,
              content: [
                {
                  type: 'tool_call',
                  tool_call: {
                    name: 'read_file',
                    args: 'path',
                    output: 'r'.repeat(20000),
                  },
                },
              ],
            } as TMessage)
          : message,
      ),
    });
    expect(result.current.compactionReclaim).toBe(4500);
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
