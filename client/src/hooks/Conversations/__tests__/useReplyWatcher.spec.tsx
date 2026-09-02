import React from 'react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { act, renderHook, waitFor } from '@testing-library/react';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { ConversationCursorData } from '~/utils/convos';
import {
  unseenTabBadgeAtom,
  replyNotificationsAtom,
  replyNotificationSoundAtom,
} from '../replyNotificationSettings';
import useReplyWatcher from '../useReplyWatcher';
import { isConversationUnseen } from '~/utils';

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

  const settings = createStore();
  settings.set(replyNotificationsAtom, notifications);
  settings.set(replyNotificationSoundAtom, sound);
  settings.set(unseenTabBadgeAtom, badge);

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={settings}>{children}</JotaiProvider>
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

  it('ignores a poll snapshot that would walk the read state backwards', async () => {
    /* Overlapping polls can resolve out of order; taking the older payload would drop a dot
       or bring one back until the next poll repaired it. */
    const newer = '2026-08-16T12:00:00.000Z';
    const { queryClient, cachedConvo } = setup({ notifications: true });

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
                lastResponseAt: newer,
              },
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      });
    });

    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(cachedConvo()?.lastResponseAt).toBe(newer);
  });

  it('drops a completion snapshot outrun while its messages refetched', async () => {
    /* The freshness guard runs before a real network wait; the SSE final handler can stamp a
       newer reply during it, and writing the older snapshot back would walk the read state
       backwards after that reply's signal was already consumed. */
    const newer = '2026-08-16T12:00:00.000Z';
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient, cachedConvo } = setup();

    const realInvalidate = queryClient.invalidateQueries.bind(queryClient);
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation((filters?: unknown) => {
        if (Array.isArray(filters) && filters[0] === QueryKeys.messages) {
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
                      lastResponseAt: newer,
                    },
                  ],
                  nextCursor: null,
                },
              ],
              pageParams: [null],
            });
          });
        }
        return realInvalidate(filters as Parameters<typeof realInvalidate>[0]);
      });

    mockGetConversationById.mockResolvedValue({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.messages, CONVO_ID]));
    await act(async () => {
      await Promise.resolve();
    });

    expect(cachedConvo()?.lastResponseAt).toBe(newer);
  });

  it('recovers a completion lost to a transient fetch failure through the list', async () => {
    /* The failed fetch has consumed the only completion transition, and the away poll is gated
       on the document being unfocused; without a fallback the reply would stay invisible for
       as long as the user kept the app focused. */
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    mockGetConversationById.mockRejectedValue(new Error('network down'));
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.messages, CONVO_ID]));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.allConversations]));
  });

  it('lets a conversation deleted while it generated stay gone', async () => {
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    mockGetConversationById.mockRejectedValue({ status: 404 });
    mockActiveJobIds = [];
    rerender();

    await act(async () => {
      await Promise.resolve();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('discards an away snapshot that resolves after the user returns', async () => {
    /* The poll's request bypasses React Query, so the seen mutation's cancellation cannot
       reach it: a snapshot read before the focus-triggered acknowledgement settled carries
       the same reply stamp with the older catch-up, and writing it back would re-light a dot
       the server no longer backs. */
    const { queryClient, cachedConvo } = setup({ notifications: true });

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
                lastResponseAt: RESPONDED_AT,
                lastSeenAt: RESPONDED_AT,
              },
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      });
    });

    mockListConversations.mockImplementation(async () => {
      (document.hasFocus as jest.Mock).mockReturnValue(true);
      return {
        conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
        nextCursor: null,
      };
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(cachedConvo()?.lastSeenAt).toBe(RESPONDED_AT);
  });

  it('withholds the stamp when the open conversation failed to reload its messages', async () => {
    /* Invalidation settles rather than throwing, so the failure has to be read off the query.
       Exposing the stamp would credit a reply the tab never managed to load. */
    const { queryClient, cachedConvo } = setup({ notifications: true });
    const failed = failMessagesQuery(queryClient, { observed: true });
    expect(failed).toBeDefined();

    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(cachedConvo()?.lastResponseAt).toBeUndefined();
  });

  it('ignores a stale error left by a conversation the user has since closed', async () => {
    /* An unobserved query is never refetched by the invalidation, so its cached error is not
       this attempt's and never clears; reading it would mute that conversation for the
       rest of the session. */
    const { queryClient, cachedConvo } = setup({ notifications: true });
    failMessagesQuery(queryClient, { observed: false });

    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: CONVO_ID, lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(cachedConvo()?.lastResponseAt).toBe(RESPONDED_AT));
  });

  it('marks the messages stale so a reply this tab never streamed is rendered', async () => {
    /* Without it the stamp alone would let the seen trigger credit a reply from a scroll
       position that belongs to the previous message. */
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    mockGetConversationById.mockResolvedValue({
      conversationId: CONVO_ID,
      lastResponseAt: new Date(Date.now() + 60_000).toISOString(),
    });
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.messages, CONVO_ID]));
  });

  it('refetches the list for a conversation the aggregate cannot see', async () => {
    /* Opened by URL, so it sits in its own point query: enough for the lookup, invisible to
       the badge and the alerts, which read the lists only. */
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient } = setup();
    queryClient.removeQueries(listKey);
    queryClient.setQueryData([QueryKeys.conversation, CONVO_ID], {
      conversationId: CONVO_ID,
      title: 'Opened by URL',
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    mockGetConversationById.mockResolvedValue({
      conversationId: CONVO_ID,
      lastResponseAt: RESPONDED_AT,
    });
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.allConversations]));
  });

  it('asks for more than one default page while away', async () => {
    /* A batch of scheduled runs can reply to more conversations than the server's default page
       holds, and anything past it would never reach the badge or the alerts. */
    mockListConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    setup({ notifications: true });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockListConversations).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    expect(mockListConversations.mock.calls[0][0].limit).toBeGreaterThan(25);
  });

  it('keeps a mid-merge acknowledgement over an equal-stamp completion snapshot', async () => {
    /* The completion fetch's one job is delivering a stamp the cache lacks; when the SSE
       final handler and the seen trigger land the same stamp and its acknowledgement while
       this merge awaits the messages refetch, the snapshot's older read state must not undo
       them. */
    const newer = '2026-08-16T12:00:00.000Z';
    mockActiveJobIds = [CONVO_ID];
    const { rerender, queryClient, cachedConvo } = setup();

    const realInvalidate = queryClient.invalidateQueries.bind(queryClient);
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation((filters?: unknown) => {
        if (Array.isArray(filters) && filters[0] === QueryKeys.messages) {
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
                      lastResponseAt: newer,
                      lastSeenAt: newer,
                    },
                  ],
                  nextCursor: null,
                },
              ],
              pageParams: [null],
            });
          });
        }
        return realInvalidate(filters as Parameters<typeof realInvalidate>[0]);
      });

    mockGetConversationById.mockResolvedValue({
      conversationId: CONVO_ID,
      lastResponseAt: newer,
    });
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.messages, CONVO_ID]));
    await act(async () => {
      await Promise.resolve();
    });

    expect(cachedConvo()?.lastSeenAt).toBe(newer);
  });

  it('retries revealing a point-cached conversation after a failed list refresh', async () => {
    /* The reveal is the row's only route to the badge and the alerts; marking it done before
       the refetch succeeds would leave the next identical snapshot exiting through the
       unchanged-row check with the reply invisible for good. */
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'point-only', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    queryClient.setQueryData([QueryKeys.conversation, 'point-only'], {
      conversationId: 'point-only',
      title: 'Opened by URL',
    });
    const realInvalidate = queryClient.invalidateQueries.bind(queryClient);
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation((filters?: unknown) => {
        if (Array.isArray(filters) && filters[0] === QueryKeys.allConversations) {
          const query = queryClient.getQueryCache().find(listKey);
          query?.setState({ status: 'error', error: new Error('offline') } as never);
          jest.spyOn(query!, 'getObserversCount').mockReturnValue(1);
          return Promise.resolve();
        }
        return realInvalidate(filters as never);
      });
    const listInvalidations = () =>
      invalidate.mock.calls.filter(
        ([key]) => Array.isArray(key) && key[0] === QueryKeys.allConversations,
      ).length;

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(listInvalidations()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(listInvalidations()).toBe(2));
  });

  it('reveals a point-cached conversation once when the filter legitimately hides it', async () => {
    /* A successful refetch that still does not surface the row marks the stamp done, so a
       cached sidebar filter cannot turn the reveal into a refetch every tick. */
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'point-only', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    queryClient.setQueryData([QueryKeys.conversation, 'point-only'], {
      conversationId: 'point-only',
      title: 'Opened by URL',
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const listInvalidations = () =>
      invalidate.mock.calls.filter(
        ([key]) => Array.isArray(key) && key[0] === QueryKeys.allConversations,
      ).length;

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(listInvalidations()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(listInvalidations()).toBe(1);
  });

  it('refetches the list when a completed job belongs to no cached conversation', async () => {
    /* A job finishing on another device can belong to a conversation no cached query holds;
       the writes only reach rows that already exist, so the fetch would be discarded. */
    mockActiveJobIds = ['started-on-phone'];
    const { rerender, queryClient } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    mockGetConversationById.mockResolvedValue({
      conversationId: 'started-on-phone',
      lastResponseAt: RESPONDED_AT,
    });
    mockActiveJobIds = [];
    rerender();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith([QueryKeys.allConversations]));
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

  it('retries the list refresh while an unknown conversation is still unrevealed', async () => {
    /* Recording the id before the refetch succeeds would mute the conversation for good: every
       later poll would read it as already known and never invalidate again, even after the
       network recovered. */
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'elsewhere', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    const realInvalidate = queryClient.invalidateQueries.bind(queryClient);
    const invalidate = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation((filters?: unknown) => {
        if (Array.isArray(filters) && filters[0] === QueryKeys.allConversations) {
          const query = queryClient.getQueryCache().find(listKey);
          query?.setState({ status: 'error', error: new Error('offline') } as never);
          jest.spyOn(query!, 'getObserversCount').mockReturnValue(1);
          return Promise.resolve();
        }
        return realInvalidate(filters as never);
      });
    const listInvalidations = () =>
      invalidate.mock.calls.filter(
        ([key]) => Array.isArray(key) && key[0] === QueryKeys.allConversations,
      ).length;

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(listInvalidations()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(listInvalidations()).toBe(2));
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

  it('attempts the reveal again when a later reply reaches the same unknown conversation', async () => {
    /* One attempt per reply, not per conversation: a row the refetched page could not reach
       must not be muted for the rest of the session by its first miss. */
    const laterResponseAt = '2026-08-16T10:10:00.000Z';
    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'elsewhere', lastResponseAt: RESPONDED_AT }],
      nextCursor: null,
    });

    const { queryClient } = setup({ notifications: true });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));

    mockListConversations.mockResolvedValue({
      conversations: [{ conversationId: 'elsewhere', lastResponseAt: laterResponseAt }],
      nextCursor: null,
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
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

/** Leaves the conversation's messages query cached in an error state, optionally with an
 *  observer so it counts as the one this attempt refetched. */
function failMessagesQuery(queryClient: QueryClient, { observed }: { observed: boolean }) {
  queryClient.setQueryData([QueryKeys.messages, CONVO_ID], []);
  const query = queryClient.getQueryCache().find([QueryKeys.messages, CONVO_ID]);
  query?.setState({ status: 'error', error: new Error('offline') } as never);
  jest.spyOn(query!, 'getObserversCount').mockReturnValue(observed ? 1 : 0);
  return query;
}
