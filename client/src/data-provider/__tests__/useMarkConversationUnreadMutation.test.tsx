import React from 'react';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useMarkConversationUnreadMutation } from '../mutations';
import type { ConversationCursorData } from '~/utils/convos';
import { isConversationUnseen } from '~/utils';

const mockMarkUnread = jest.fn();
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      markConversationUnread: (...args: unknown[]) => mockMarkUnread(...args),
    },
  };
});

const CONVO_ID = 'convo-unread';
const listKey = [QueryKeys.allConversations, { isArchived: false }];
const RESPONDED_AT = '2026-08-16T10:00:00.000Z';
const SEEN_AT = '2026-08-16T11:00:00.000Z';

function setup(lastResponseAt?: string, lastSeenAt?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<InfiniteData<ConversationCursorData>>(listKey, {
    pages: [
      {
        conversations: [
          {
            conversationId: CONVO_ID,
            title: 'Flagged',
            endpoint: EModelEndpoint.openAI,
            createdAt: RESPONDED_AT,
            updatedAt: SEEN_AT,
            lastResponseAt,
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

  const view = renderHook(() => useMarkConversationUnreadMutation(), { wrapper });
  const cached = () =>
    queryClient.getQueryData<InfiniteData<ConversationCursorData>>(listKey)?.pages[0]
      .conversations[0];

  return { ...view, cached };
}

describe('useMarkConversationUnreadMutation', () => {
  beforeEach(() => {
    mockMarkUnread.mockReset();
  });

  it('optimistically flags a read conversation unread while the request is in flight', async () => {
    mockMarkUnread.mockReturnValue(new Promise(() => undefined));
    const { result, cached } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      result.current.mutate({ conversationId: CONVO_ID });
    });

    expect(isConversationUnseen(cached())).toBe(true);
    expect(mockMarkUnread).toHaveBeenCalledWith({ conversationId: CONVO_ID });
  });

  it('stamps lastResponseAt for a never-replied conversation so the dot lights', async () => {
    mockMarkUnread.mockReturnValue(new Promise(() => undefined));
    const { result, cached } = setup();

    await act(async () => {
      result.current.mutate({ conversationId: CONVO_ID });
    });

    expect(cached()?.lastResponseAt).toBeDefined();
    expect(isConversationUnseen(cached())).toBe(true);
  });

  it('restores the previous state when the request fails', async () => {
    mockMarkUnread.mockRejectedValue(new Error('network down'));
    const { result, cached } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      await result.current.mutateAsync({ conversationId: CONVO_ID }).catch(() => undefined);
    });

    await waitFor(() => expect(cached()?.lastSeenAt).toBe(SEEN_AT));
    await waitFor(() => expect(isConversationUnseen(cached())).toBe(false));
  });
});
