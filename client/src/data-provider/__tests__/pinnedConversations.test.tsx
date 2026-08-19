import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  TConversationTag,
  TConversation,
} from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useConversationTagMutation,
  useDeleteConversationMutation,
  useDeleteConversationTagMutation,
  usePinConversationMutation,
} from '../mutations';
import {
  removeConvoFromAllQueries,
  updateConvoInAllQueries,
  upsertConvoInAllQueries,
  collectPinnedConversations,
} from '~/utils/convos';
import { pinnedConversationsPageSize, usePinnedConversationsQuery } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      listConversations: jest.fn(),
      pinConversation: jest.fn(),
      deleteConversation: jest.fn(),
      updateConversationTag: jest.fn(),
      deleteConversationTag: jest.fn(),
    },
  };
});

const listConversations = dataService.listConversations as jest.MockedFunction<
  typeof dataService.listConversations
>;
const pinConversation = dataService.pinConversation as jest.MockedFunction<
  typeof dataService.pinConversation
>;
const deleteConversation = dataService.deleteConversation as jest.MockedFunction<
  typeof dataService.deleteConversation
>;
const updateConversationTag = dataService.updateConversationTag as jest.MockedFunction<
  typeof dataService.updateConversationTag
>;
const deleteConversationTag = dataService.deleteConversationTag as jest.MockedFunction<
  typeof dataService.deleteConversationTag
>;

const pinnedConversationId = 'convo-pinned';

const pinnedConvo = {
  conversationId: pinnedConversationId,
  title: 'Initial Greeting',
  endpoint: 'openAI',
  pinned: true,
} as TConversation;

const listResponse = (conversations: TConversation[]): ConversationListResponse => ({
  conversations,
  nextCursor: null,
});

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };

const readPinnedCache = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationListResponse>([
    QueryKeys.pinnedConversations,
    { tags: undefined },
  ]);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePinnedConversationsQuery', () => {
  it('fetches pins directly instead of filtering the paginated chats list', async () => {
    listConversations.mockResolvedValue(listResponse([pinnedConvo]));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(listConversations).toHaveBeenCalledWith({
      pinned: true,
      tags: undefined,
      limit: pinnedConversationsPageSize,
      cursor: undefined,
    });
    expect(result.current.data?.conversations).toEqual([pinnedConvo]);
  });

  it('does not fetch while the user is unauthenticated', async () => {
    listConversations.mockResolvedValue(listResponse([]));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery({}, { enabled: false }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('refetches the pinned list after a chat is pinned', async () => {
    listConversations.mockResolvedValue(listResponse([]));
    pinConversation.mockResolvedValue(pinnedConvo);
    const queryClient = createQueryClient();

    const { result } = renderHook(
      () => ({
        query: usePinnedConversationsQuery(),
        pin: usePinConversationMutation(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.query.data?.conversations).toEqual([]);

    listConversations.mockResolvedValue(listResponse([pinnedConvo]));
    await act(async () => {
      await result.current.pin.mutateAsync({
        conversationId: pinnedConvo.conversationId as string,
        pinned: true,
      });
    });

    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.query.data?.conversations).toEqual([pinnedConvo]));
  });

  /** `groupConversationsByDate` keeps pins out of the chats groups, so a pin this query
   * drops is invisible everywhere, not merely further down a list. */
  it('drains the cursor instead of truncating at one page', async () => {
    const second = { ...pinnedConvo, conversationId: 'convo-pinned-2' } as TConversation;
    listConversations
      .mockResolvedValueOnce({ conversations: [pinnedConvo], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ conversations: [second], nextCursor: null });
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listConversations).toHaveBeenCalledTimes(2);
    expect(listConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
    );
    expect(result.current.data?.conversations).toEqual([pinnedConvo, second]);
    expect(result.current.data?.nextCursor).toBeNull();
  });

  /** The drain rejects as a whole, so without publishing what it already has the
   * section would fall back to an empty list for every pin past the first page. */
  it('keeps the pages already drained when a later one fails', async () => {
    listConversations
      .mockResolvedValueOnce({ conversations: [pinnedConvo], nextCursor: 'cursor-2' })
      .mockRejectedValueOnce(new Error('network'));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readPinnedCache(queryClient)?.conversations).toEqual([pinnedConvo]);
    expect(readPinnedCache(queryClient)?.nextCursor).toBe('cursor-2');
    expect(result.current.data?.conversations).toEqual([pinnedConvo]);
  });

  it('reports the failure when the very first page fails', async () => {
    listConversations.mockRejectedValueOnce(new Error('network'));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readPinnedCache(queryClient)).toBeUndefined();
  });

  /** The chats list beside it is filtered by the selected bookmarks; the pinned section
   * showed every pin regardless until the tags were threaded through. */
  it('applies the active bookmark filter and keys the cache by it', async () => {
    listConversations.mockResolvedValue(listResponse([pinnedConvo]));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery({ tags: ['work'] }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listConversations).toHaveBeenCalledWith(expect.objectContaining({ tags: ['work'] }));
    expect(
      queryClient.getQueryData([QueryKeys.pinnedConversations, { tags: ['work'] }]),
    ).toBeDefined();
  });
});

describe('pinned list cache synchronization', () => {
  it('drops a chat from the pinned cache as soon as it is unpinned', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    updateConvoInAllQueries(queryClient, pinnedConvo.conversationId as string, (convo) => ({
      ...convo,
      pinned: false,
    }));

    expect(readPinnedCache(queryClient)?.conversations).toEqual([]);
  });

  it('keeps a renamed pin in the section with its new title', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    updateConvoInAllQueries(queryClient, pinnedConvo.conversationId as string, (convo) => ({
      ...convo,
      title: 'Renamed',
    }));

    expect(readPinnedCache(queryClient)?.conversations).toEqual([
      { ...pinnedConvo, title: 'Renamed' },
    ]);
  });

  it('removes a deleted or archived pin from the section', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    removeConvoFromAllQueries(queryClient, pinnedConvo.conversationId as string);

    expect(readPinnedCache(queryClient)?.conversations).toEqual([]);
  });

  /** A pin that just received a message must lead the section the way it leads the
   * chats list, since the server returns pins newest-first. */
  it('moves a pin to the top when the caller asks for it', () => {
    const other = { ...pinnedConvo, conversationId: 'convo-other' } as TConversation;
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([other, pinnedConvo]),
    );

    updateConvoInAllQueries(
      queryClient,
      pinnedConvo.conversationId as string,
      (convo) => ({ ...convo, title: 'Replied' }),
      true,
    );

    expect(readPinnedCache(queryClient)?.conversations.map((c) => c.conversationId)).toEqual([
      'convo-pinned',
      'convo-other',
    ]);
  });

  /** The SSE payload can still carry the previous turn's timestamp, and the section is
   * sorted newest-first downstream, so the move has to refresh it or the sort undoes it. */
  it('refreshes the timestamp of a pin it moves to the top', () => {
    const stale = '2026-03-01T12:00:00.000Z';
    const other = {
      ...pinnedConvo,
      conversationId: 'convo-other',
      updatedAt: '2026-08-16T12:00:00.000Z',
    } as TConversation;
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([other, { ...pinnedConvo, updatedAt: stale } as TConversation]),
    );

    updateConvoInAllQueries(
      queryClient,
      pinnedConvo.conversationId as string,
      (convo) => ({ ...convo, title: 'Replied', updatedAt: stale }),
      true,
    );

    const moved = readPinnedCache(queryClient)?.conversations[0];
    expect(moved?.conversationId).toBe('convo-pinned');
    expect(Date.parse(moved?.updatedAt ?? '')).toBeGreaterThan(Date.parse(other.updatedAt ?? ''));
    expect(
      collectPinnedConversations(readPinnedCache(queryClient)?.conversations, []).map(
        (c) => c.conversationId,
      ),
    ).toEqual(['convo-pinned', 'convo-other']);
  });

  it('leaves the pinned cache untouched for an unrelated conversation', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    updateConvoInAllQueries(queryClient, 'some-other-convo', (convo) => ({
      ...convo,
      title: 'Renamed',
    }));

    expect(readPinnedCache(queryClient)?.conversations).toEqual([pinnedConvo]);
  });

  /** Root-level SSE updates and resumable settlement call upsert rather than
   * update, so the independently cached pin has to follow that path too. */
  it('updates an existing pin when the conversation is upserted', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    upsertConvoInAllQueries(queryClient, {
      ...pinnedConvo,
      title: 'Settled title',
    });

    expect(readPinnedCache(queryClient)?.conversations).toEqual([
      expect.objectContaining({ ...pinnedConvo, title: 'Settled title' }),
    ]);
  });

  it('moves an upserted pin to the top of the pinned cache', () => {
    const other = { ...pinnedConvo, conversationId: 'convo-other' } as TConversation;
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([other, pinnedConvo]),
    );

    upsertConvoInAllQueries(queryClient, {
      ...pinnedConvo,
      title: 'Replied',
    });

    expect(readPinnedCache(queryClient)?.conversations.map((c) => c.conversationId)).toEqual([
      'convo-pinned',
      'convo-other',
    ]);
  });

  it('does not insert a conversation that is not already in the pinned cache', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    upsertConvoInAllQueries(queryClient, {
      conversationId: 'convo-new',
      title: 'Brand new',
      endpoint: 'openAI',
      pinned: true,
    } as TConversation);

    expect(readPinnedCache(queryClient)?.conversations).toEqual([pinnedConvo]);
  });

  it('keeps the cached pinned flag when the upsert payload omits it', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );

    upsertConvoInAllQueries(queryClient, {
      conversationId: pinnedConvo.conversationId,
      title: 'Root turn',
      endpoint: 'openAI',
    } as TConversation);

    expect(readPinnedCache(queryClient)?.conversations).toEqual([
      expect.objectContaining({ ...pinnedConvo, title: 'Root turn' }),
    ]);
  });
});

describe('delete mutation project lookup', () => {
  const projectId = 'project-pinned';

  it('invalidates the project when the deleted pin is only in the pinned cache', async () => {
    deleteConversation.mockResolvedValue({
      acknowledged: true,
      deletedCount: 1,
      messages: { acknowledged: true, deletedCount: 0 },
    });
    const queryClient = createQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([{ ...pinnedConvo, chatProjectId: projectId }]),
    );

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ conversationId: pinnedConversationId });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.project, projectId]);
  });
});

const tagResponse: TConversationTag = {
  _id: 'tag-office',
  user: 'user-1',
  tag: 'office',
  count: 1,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('bookmark mutations invalidate the pinned cache', () => {
  it('invalidates pins when a bookmark is renamed', async () => {
    updateConversationTag.mockResolvedValue(tagResponse);
    const queryClient = createQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useConversationTagMutation({ context: 'test', tag: 'work' }),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      result.current.mutate({ tag: 'office' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.pinnedConversations]);
  });

  it('invalidates pins when a bookmark is deleted', async () => {
    deleteConversationTag.mockResolvedValue({ ...tagResponse, tag: 'work' });
    const queryClient = createQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteConversationTagMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate('work');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.pinnedConversations]);
  });
});

describe('unpinning a pin that is not on a loaded chats page', () => {
  it('inserts the unpinned conversation at the top of the chats list', async () => {
    const unpinned = { ...pinnedConvo, pinned: false } as TConversation;
    pinConversation.mockResolvedValue(unpinned);
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [
            {
              conversationId: 'other-recent',
              title: 'Recent',
              endpoint: 'openAI',
            } as TConversation,
          ],
          nextCursor: 'cursor-2',
        },
      ],
      pageParams: [undefined],
    });

    const { result } = renderHook(() => usePinConversationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        conversationId: pinnedConvo.conversationId as string,
        pinned: false,
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chats = queryClient.getQueryData<{
      pages: { conversations: TConversation[] }[];
    }>([QueryKeys.allConversations]);
    expect(
      chats?.pages[0].conversations.map((conversation) => conversation.conversationId),
    ).toEqual(['convo-pinned', 'other-recent']);
    expect(chats?.pages[0].conversations[0].pinned).toBe(false);
  });

  /** `isShared` is derived per list request, so the pin response never carries it. The
   * reinserted row has no existing chats row to merge it from, so it has to come off
   * the cached pin or the shared badge disappears until the next list refetch. */
  it('keeps the shared badge on the reinserted row', async () => {
    const unpinned = { ...pinnedConvo, pinned: false } as TConversation;
    pinConversation.mockResolvedValue(unpinned);
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([{ ...pinnedConvo, isShared: true } as TConversation]),
    );
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [{ conversations: [], nextCursor: null }],
      pageParams: [undefined],
    });

    const { result } = renderHook(() => usePinConversationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        conversationId: pinnedConvo.conversationId as string,
        pinned: false,
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chats = queryClient.getQueryData<{
      pages: { conversations: TConversation[] }[];
    }>([QueryKeys.allConversations]);
    expect(chats?.pages[0].conversations[0].conversationId).toBe('convo-pinned');
    expect(chats?.pages[0].conversations[0].isShared).toBe(true);
  });

  /** Deleting the last loaded row drops every page, so the insert has to rebuild the
   * first one instead of reading through an empty array. */
  it('rebuilds the first page when the chats cache has been emptied', async () => {
    const unpinned = { ...pinnedConvo, pinned: false } as TConversation;
    pinConversation.mockResolvedValue(unpinned);
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [
            { conversationId: 'only-chat', title: 'Only', endpoint: 'openAI' } as TConversation,
          ],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
    removeConvoFromAllQueries(queryClient, 'only-chat');
    expect(
      queryClient.getQueryData<{ pages: unknown[] }>([QueryKeys.allConversations])?.pages,
    ).toEqual([]);

    const { result } = renderHook(() => usePinConversationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        conversationId: pinnedConvo.conversationId as string,
        pinned: false,
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const chats = queryClient.getQueryData<{
      pages: { conversations: TConversation[] }[];
    }>([QueryKeys.allConversations]);
    expect(
      chats?.pages[0].conversations.map((conversation) => conversation.conversationId),
    ).toEqual(['convo-pinned']);
  });

  it('does not insert the unpinned chat into an unrelated bookmark cache', async () => {
    const unpinned = { ...pinnedConvo, pinned: false, tags: [] } as TConversation;
    pinConversation.mockResolvedValue(unpinned);
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      [QueryKeys.pinnedConversations, { tags: undefined }],
      listResponse([pinnedConvo]),
    );
    queryClient.setQueryData([QueryKeys.allConversations, { tags: ['work'] }], {
      pages: [
        {
          conversations: [
            {
              conversationId: 'work-chat',
              title: 'Work',
              endpoint: 'openAI',
              tags: ['work'],
            } as TConversation,
          ],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });

    const { result } = renderHook(() => usePinConversationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({
        conversationId: pinnedConvo.conversationId as string,
        pinned: false,
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const filtered = queryClient.getQueryData<{
      pages: { conversations: TConversation[] }[];
    }>([QueryKeys.allConversations, { tags: ['work'] }]);
    expect(
      filtered?.pages[0].conversations.map((conversation) => conversation.conversationId),
    ).toEqual(['work-chat']);
  });
});
