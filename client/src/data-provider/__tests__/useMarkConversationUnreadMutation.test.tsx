import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { ConversationCursorData } from '~/utils/convos';
import { isConversationUnseen, updateConvoInAllQueries } from '~/utils';
import { useMarkConversationUnreadMutation } from '../mutations';

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

/** Stands in for a list refetch committing whatever the server last told it. */
function seedList(queryClient: QueryClient, lastResponseAt?: string, lastSeenAt?: string) {
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
}

function setup(lastResponseAt?: string, lastSeenAt?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seedList(queryClient, lastResponseAt, lastSeenAt);

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const view = renderHook(() => useMarkConversationUnreadMutation(), { wrapper });
  const cached = () =>
    queryClient.getQueryData<InfiniteData<ConversationCursorData>>(listKey)?.pages[0]
      .conversations[0];

  return { ...view, cached, queryClient };
}

describe('useMarkConversationUnreadMutation', () => {
  beforeEach(() => {
    mockMarkUnread.mockReset();
  });

  it('reasserts the unread state when a refetch lands on top of it', async () => {
    /* A list refetch already in flight can have read the old catch-up and commit after the
       optimistic clear, quietly taking the dot back off a conversation the server did flag. */
    mockMarkUnread.mockResolvedValue({ modified: true, lastResponseAt: RESPONDED_AT });
    const { result, cached, queryClient } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      const pending = result.current.mutateAsync({ conversationId: CONVO_ID });
      seedList(queryClient, RESPONDED_AT, SEEN_AT);
      await pending;
    });

    await waitFor(() => expect(isConversationUnseen(cached())).toBe(true));
    expect(cached()?.lastSeenAt).toBeUndefined();
  });

  it('keeps a newer reply that arrived while the unread request was open', async () => {
    /* The server read the marker on the way in; a reply landing after that is newer than what
       it can return, and overwriting it would strand the dot behind a spent completion. */
    const NEWER_RESPONDED_AT = '2026-08-16T12:00:00.000Z';
    const request = deferred();
    mockMarkUnread.mockReturnValue(request.promise);
    const { result, cached, queryClient } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      const pending = result.current.mutateAsync({ conversationId: CONVO_ID });
      /* After the optimistic pass, so the merge is genuinely a later arrival. */
      await flush();
      updateConvoInAllQueries(queryClient, CONVO_ID, (convo) => ({
        ...convo,
        lastResponseAt: NEWER_RESPONDED_AT,
      }));
      request.resolve({ modified: true, lastResponseAt: RESPONDED_AT });
      await pending;
    });

    expect(cached()?.lastResponseAt).toBe(NEWER_RESPONDED_AT);
    expect(isConversationUnseen(cached())).toBe(true);
  });

  it('does not roll back over a newer reply that arrived mid-flight', async () => {
    /* The watcher or the SSE path can merge a newer reply while the request is open; restoring
       the pre-mutation stamps over it would make that reply read as seen with its completion
       signal already spent. */
    const NEWER_RESPONDED_AT = '2026-08-16T12:00:00.000Z';
    const request = deferred();
    mockMarkUnread.mockReturnValue(request.promise);
    const { result, cached, queryClient } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      const pending = result.current
        .mutateAsync({ conversationId: CONVO_ID })
        .catch(() => undefined);
      await flush();
      updateConvoInAllQueries(queryClient, CONVO_ID, (convo) => ({
        ...convo,
        lastResponseAt: NEWER_RESPONDED_AT,
      }));
      request.reject(new Error('network down'));
      await pending;
    });

    expect(cached()?.lastResponseAt).toBe(NEWER_RESPONDED_AT);
    expect(isConversationUnseen(cached())).toBe(true);
  });

  it('drops the optimistic dot when the server matched nothing', async () => {
    /* Deleted on another device, or between the access check and the write: keeping the dot
       would leave a row that no longer exists counted in the badge. */
    mockMarkUnread.mockResolvedValue({ modified: false });
    const { result, cached } = setup(RESPONDED_AT, SEEN_AT);

    await act(async () => {
      await result.current.mutateAsync({ conversationId: CONVO_ID });
    });

    await waitFor(() => expect(isConversationUnseen(cached())).toBe(false));
    expect(cached()?.lastSeenAt).toBe(SEEN_AT);
  });

  it('caches the server marker for a conversation that had no reply', async () => {
    const serverStamp = '2026-08-16T12:00:00.000Z';
    mockMarkUnread.mockResolvedValue({ modified: true, lastResponseAt: serverStamp });
    const { result, cached } = setup(undefined, undefined);

    await act(async () => {
      await result.current.mutateAsync({ conversationId: CONVO_ID });
    });

    await waitFor(() => expect(cached()?.lastResponseAt).toBe(serverStamp));
    expect(isConversationUnseen(cached())).toBe(true);
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

/** Lets a test place work between the optimistic pass and the response callback. */
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  /* Swallowed here so a rejection scheduled for the mutation does not surface as unhandled. */
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
