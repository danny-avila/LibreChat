import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConversationListResponse, TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { pinnedConversationsPageSize, usePinnedConversationsQuery } from '../queries';
import { removeConvoFromAllQueries, updateConvoInAllQueries } from '~/utils/convos';
import { usePinConversationMutation } from '../mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      listConversations: jest.fn(),
      pinConversation: jest.fn(),
    },
  };
});

const listConversations = dataService.listConversations as jest.MockedFunction<
  typeof dataService.listConversations
>;
const pinConversation = dataService.pinConversation as jest.MockedFunction<
  typeof dataService.pinConversation
>;

const pinnedConvo = {
  conversationId: 'convo-pinned',
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
});
