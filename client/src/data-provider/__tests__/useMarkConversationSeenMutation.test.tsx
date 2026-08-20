import React from 'react';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useMarkConversationSeenMutation } from '../mutations';
import type { ConversationCursorData } from '~/utils/convos';

const mockMarkSeen = jest.fn();
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      markConversationSeen: (...args: unknown[]) => mockMarkSeen(...args),
    },
  };
});

const CONVO_ID = 'convo-mark';
const listKey = [QueryKeys.allConversations, { isArchived: false }];
const RESPONDED_AT = '2026-08-16T10:00:00.000Z';
const SEEN_AT = '2026-08-16T09:00:00.000Z';

function setup(lastSeenAt?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<InfiniteData<ConversationCursorData>>(listKey, {
    pages: [
      {
        conversations: [
          {
            conversationId: CONVO_ID,
            title: 'Marked',
            endpoint: EModelEndpoint.openAI,
            createdAt: SEEN_AT,
            updatedAt: SEEN_AT,
            lastResponseAt: RESPONDED_AT,
            lastSeenAt,
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const view = renderHook(() => useMarkConversationSeenMutation(), { wrapper });
  const cached = () =>
    queryClient.getQueryData<InfiniteData<ConversationCursorData>>(listKey)?.pages[0]
      .conversations[0];

  return { ...view, cached, queryClient };
}

describe('useMarkConversationSeenMutation', () => {
  beforeEach(() => {
    mockMarkSeen.mockReset();
  });

  it('optimistically marks the conversation seen while the request is in flight', async () => {
    mockMarkSeen.mockReturnValue(new Promise(() => undefined));
    const { result, cached } = setup();

    await act(async () => {
      result.current.mutate({ conversationId: CONVO_ID });
    });

    expect(cached()?.lastSeenAt).toBeDefined();
    expect(mockMarkSeen).toHaveBeenCalledWith({ conversationId: CONVO_ID });
  });

  it('restores the previous catch-up state when the request fails', async () => {
    mockMarkSeen.mockRejectedValue(new Error('network down'));
    const { result, cached } = setup(SEEN_AT);

    await act(async () => {
      await result.current.mutateAsync({ conversationId: CONVO_ID }).catch(() => undefined);
    });

    /* Restoring the old value re-arms the seen triggers, which gate on the cache. */
    await waitFor(() => expect(cached()?.lastSeenAt).toBe(SEEN_AT));
  });

  it('restores never-seen when a first catch-up fails', async () => {
    mockMarkSeen.mockRejectedValue(new Error('network down'));
    const { result, cached } = setup();

    await act(async () => {
      await result.current.mutateAsync({ conversationId: CONVO_ID }).catch(() => undefined);
    });

    await waitFor(() => expect(cached()?.lastSeenAt).toBeUndefined());
  });
});
