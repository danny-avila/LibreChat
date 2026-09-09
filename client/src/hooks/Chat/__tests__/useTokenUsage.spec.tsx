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

const renderTokenUsage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData([QueryKeys.messages, convo], messages);
  const store = getDefaultStore();
  store.set(contextSnapshotFamily(convo), tailSnapshot);
  store.set(
    snapshotsByAnchorFamily(convo),
    new Map([
      ['a1', anchorSnapshot(196000)],
      ['a2', anchorSnapshot(195000)],
    ]),
  );

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
});
