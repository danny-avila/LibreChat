import React from 'react';
import { RecoilRoot } from 'recoil';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { MutableSnapshot } from 'recoil';
import type { ConversationCursorData } from '~/utils/convos';
import { isConversationUnseen } from '~/utils';
import useReplyWatcher from '../useReplyWatcher';
import store from '~/store';

const mockGetConversationById = jest.fn();
const mockListConversations = jest.fn();
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
  },
}));

let mockActiveJobIds: string[] | undefined = [];
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useActiveJobs: () => ({ data: { activeJobIds: mockActiveJobIds } }),
}));

const CONVO_ID = 'convo-watched';
const RESPONDED_AT = '2026-08-16T10:00:00.000Z';

const listKey = [QueryKeys.allConversations, { isArchived: false }];

type Toggles = { notifications?: boolean; sound?: boolean; badge?: boolean };

function setup(toggles: Toggles = {}) {
  const { notifications = false, sound = false, badge = false } = toggles;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(listKey, {
    pages: [
      {
        conversations: [{ conversationId: CONVO_ID, title: 'Watched', endpoint: 'openAI' }],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });

  const initialize = (snapshot: MutableSnapshot) => {
    snapshot.set(store.replyNotifications, notifications);
    snapshot.set(store.replyNotificationSound, sound);
    snapshot.set(store.unseenTabBadge, badge);
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
    </QueryClientProvider>
  );

  const view = renderHook(() => useReplyWatcher(), { wrapper });
  const cachedConvo = () =>
    queryClient.getQueryData<InfiniteData<ConversationCursorData>>(listKey)?.pages[0]
      .conversations[0];

  return { ...view, cachedConvo, queryClient };
}

describe('useReplyWatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockActiveJobIds = [];
    mockGetConversationById.mockReset();
    mockListConversations.mockReset();
    jest.spyOn(document, 'hasFocus').mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('pulls the reply timestamp in when a tracked job stops running', async () => {
    mockGetConversationById.mockResolvedValue({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });

    mockActiveJobIds = [CONVO_ID];
    const { rerender, cachedConvo } = setup();

    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(mockGetConversationById).toHaveBeenCalledWith(CONVO_ID));
    await waitFor(() => expect(isConversationUnseen(cachedConvo())).toBe(true));
  });

  it('does not treat the first observation of a running job as a completion', () => {
    mockActiveJobIds = [CONVO_ID];
    setup();

    expect(mockGetConversationById).not.toHaveBeenCalled();
  });

  it('treats a failed jobs poll as no information rather than mass completion', async () => {
    mockActiveJobIds = [CONVO_ID];
    const { rerender } = setup();

    mockActiveJobIds = undefined;
    rerender();

    expect(mockGetConversationById).not.toHaveBeenCalled();
  });

  it('skips the completion fetch when the cache already holds a newer reply stamp', async () => {
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient } = setup();

    /* The SSE final handler stamped the list cache after the job was observed running. */
    act(() => {
      queryClient.setQueryData<InfiniteData<ConversationCursorData>>(listKey, {
        pages: [
          {
            conversations: [
              {
                conversationId: CONVO_ID,
                title: 'Watched',
                endpoint: EModelEndpoint.openAI,
                createdAt: RESPONDED_AT,
                updatedAt: RESPONDED_AT,
                lastResponseAt: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      });
    });

    mockActiveJobIds = [];
    rerender();

    expect(mockGetConversationById).not.toHaveBeenCalled();
  });

  it('polls the conversation list while away once notifications are enabled', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { cachedConvo } = setup({ notifications: true });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).toHaveBeenCalled();
    await waitFor(() => expect(isConversationUnseen(cachedConvo())).toBe(true));
  });

  it('polls while away when only the notification sound is enabled', async () => {
    mockListConversations.mockResolvedValue({ conversations: [], nextCursor: null });

    setup({ sound: true });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).toHaveBeenCalled();
  });

  it('polls while away when only the tab badge is enabled', async () => {
    mockListConversations.mockResolvedValue({ conversations: [], nextCursor: null });

    setup({ badge: true });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).toHaveBeenCalled();
  });

  it('does not poll while the user is looking at the app', async () => {
    (document.hasFocus as jest.Mock).mockReturnValue(true);
    setup({ notifications: true, sound: true, badge: true });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).not.toHaveBeenCalled();
  });

  it('does not poll when every away feature is off', async () => {
    setup();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).not.toHaveBeenCalled();
  });

  it('does not refresh the list query when the poll finds nothing new', async () => {
    /* An unchanged write would bump dataUpdatedAt and keep the sidebar's list query
       permanently fresh, silently disabling its refetch on window focus. */
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient, cachedConvo } = setup({ notifications: true });
    updateCachedTimestamps(queryClient);
    const before = queryClient.getQueryState(listKey)?.dataUpdatedAt;

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(isConversationUnseen(cachedConvo())).toBe(true));

    const after = queryClient.getQueryState(listKey)?.dataUpdatedAt;
    expect(after).toBe(before);
  });

  it('refetches the list when the poll reveals a conversation started elsewhere', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'started-on-phone', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.allConversations]));
  });

  it('does not invalidate again while the same unknown conversation stays unknown', async () => {
    /* With a sidebar filter cached, a conversation can never enter the cache; the poll
       must not refetch the filtered list every tick because of it. */
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'elsewhere', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.allConversations]));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

function updateCachedTimestamps(queryClient: QueryClient) {
  queryClient.setQueryData<InfiniteData<ConversationCursorData>>(listKey, {
    pages: [
      {
        conversations: [
          {
            conversationId: CONVO_ID,
            title: 'Watched',
            endpoint: EModelEndpoint.openAI,
            createdAt: RESPONDED_AT,
            updatedAt: RESPONDED_AT,
            lastResponseAt: RESPONDED_AT,
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
}
