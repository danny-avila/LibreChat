import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConversationListResponse, TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { removeConvoFromAllQueries, updateConvoInAllQueries } from '~/utils/convos';
import { pinnedConversationsLimit, usePinnedConversationsQuery } from '../queries';
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
  queryClient.getQueryData<ConversationListResponse>([QueryKeys.pinnedConversations]);

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
      limit: pinnedConversationsLimit,
    });
    expect(result.current.data?.conversations).toEqual([pinnedConvo]);
  });

  it('does not fetch while the user is unauthenticated', async () => {
    listConversations.mockResolvedValue(listResponse([]));
    const queryClient = createQueryClient();

    const { result } = renderHook(() => usePinnedConversationsQuery({ enabled: false }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
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
});

describe('pinned list cache synchronization', () => {
  it('drops a chat from the pinned cache as soon as it is unpinned', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([QueryKeys.pinnedConversations], listResponse([pinnedConvo]));

    updateConvoInAllQueries(queryClient, pinnedConvo.conversationId as string, (convo) => ({
      ...convo,
      pinned: false,
    }));

    expect(readPinnedCache(queryClient)?.conversations).toEqual([]);
  });

  it('keeps a renamed pin in the section with its new title', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([QueryKeys.pinnedConversations], listResponse([pinnedConvo]));

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
    queryClient.setQueryData([QueryKeys.pinnedConversations], listResponse([pinnedConvo]));

    removeConvoFromAllQueries(queryClient, pinnedConvo.conversationId as string);

    expect(readPinnedCache(queryClient)?.conversations).toEqual([]);
  });

  it('leaves the pinned cache untouched for an unrelated conversation', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([QueryKeys.pinnedConversations], listResponse([pinnedConvo]));

    updateConvoInAllQueries(queryClient, 'some-other-convo', (convo) => ({
      ...convo,
      title: 'Renamed',
    }));

    expect(readPinnedCache(queryClient)?.conversations).toEqual([pinnedConvo]);
  });
});
