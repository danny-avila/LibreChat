import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { TConversationTag } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useTagConversationMutation, useConversationTagMutation } from '../mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      addTagToConversation: jest.fn(),
      getConversationTags: jest.fn(),
      createConversationTag: jest.fn(),
      updateConversationTagById: jest.fn(),
    },
  };
});

const bookmark = { _id: 'work-id', tag: 'Work', count: 1, position: 0 } as TConversationTag;
const listKeys = [
  [QueryKeys.allConversations, { tagIds: ['work-id'], search: 'Work', sortBy: 'updatedAt' }],
  [QueryKeys.archivedConversations, { tagIds: ['work-id'], isArchived: true }],
  [QueryKeys.projectConversations, 'project-id', { tagIds: ['work-id'] }],
  [QueryKeys.pinnedConversations, { tagIds: ['work-id'] }],
  [QueryKeys.sharedLinks, { search: 'Work' }],
];

function setup(initialIds: string[]) {
  let ids = initialIds;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, cacheTime: Infinity } },
  });
  queryClient.setQueryData(
    [QueryKeys.conversationTags],
    [bookmark, { ...bookmark, _id: 'other-id', tag: 'Other', position: 1 }],
  );
  jest.mocked(dataService.getConversationTags).mockResolvedValue([bookmark]);
  const fetchRows = jest.fn(async () => (ids.includes('work-id') ? ['conversation'] : []));
  const unsubscribe = listKeys.map((queryKey) => {
    queryClient.setQueryData(queryKey, initialIds.includes('work-id') ? ['conversation'] : []);
    return new QueryObserver(queryClient, { queryKey, queryFn: fetchRows }).subscribe(
      () => undefined,
    );
  });
  const unrelatedKey = [QueryKeys.allConversations, { tagIds: ['other-id'] }];
  queryClient.setQueryData(unrelatedKey, ['other-conversation']);
  const unrelatedObserver = new QueryObserver(queryClient, {
    queryKey: unrelatedKey,
    queryFn: async () => ['other-conversation'],
  });
  unsubscribe.push(unrelatedObserver.subscribe(() => undefined));
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return {
    queryClient,
    fetchRows,
    wrapper,
    unrelatedKey,
    setIds: (next: string[]) => {
      ids = next;
    },
    cleanup: () => unsubscribe.forEach((stop) => stop()),
  };
}

it.each([true, false])(
  'refetches parameterized dependent lists after a successful membership change (add %s)',
  async (add) => {
    const fixture = setup(add ? [] : ['work-id']);
    const next = add ? ['work-id'] : [];
    jest.mocked(dataService.addTagToConversation).mockImplementation(async () => {
      fixture.setIds(next);
      return next;
    });
    const { result, unmount } = renderHook(() => useTagConversationMutation('conversation'), {
      wrapper: fixture.wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ tagIds: next, tag: 'work-id' });
    });
    await waitFor(() =>
      listKeys.forEach((key) =>
        expect(fixture.queryClient.getQueryData(key)).toEqual(add ? ['conversation'] : []),
      ),
    );
    expect(fixture.fetchRows).toHaveBeenCalledTimes(listKeys.length);
    expect(fixture.queryClient.getQueryData(fixture.unrelatedKey)).toEqual(['other-conversation']);
    unmount();
    fixture.cleanup();
  },
);

it('refetches dependent lists after create-and-attach without a detail cache', async () => {
  const fixture = setup([]);
  jest.mocked(dataService.createConversationTag).mockImplementation(async () => {
    fixture.setIds(['work-id']);
    return bookmark;
  });
  const { result, unmount } = renderHook(() => useConversationTagMutation({ context: 'test' }), {
    wrapper: fixture.wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({
      tag: 'Work',
      addToConversation: true,
      conversationId: 'conversation',
    });
  });
  await waitFor(() =>
    listKeys.forEach((key) =>
      expect(fixture.queryClient.getQueryData(key)).toEqual(['conversation']),
    ),
  );
  expect(
    fixture.queryClient.getQueryData([QueryKeys.conversation, 'conversation']),
  ).toBeUndefined();
  unmount();
  fixture.cleanup();
});

it('does not refetch list membership after a rejected mutation', async () => {
  const fixture = setup(['work-id']);
  jest.mocked(dataService.addTagToConversation).mockRejectedValue(new Error('Rejected'));
  const { result, unmount } = renderHook(() => useTagConversationMutation('conversation'), {
    wrapper: fixture.wrapper,
  });
  await act(async () => {
    await expect(result.current.mutateAsync({ tagIds: [], tag: 'work-id' })).rejects.toThrow(
      'Rejected',
    );
  });
  expect(fixture.fetchRows).not.toHaveBeenCalled();
  unmount();
  fixture.cleanup();
});

it.each([{ position: 1 }, { tag: 'Work', description: 'Updated' }])(
  'does not refetch membership lists for bookmark metadata %o',
  async (payload) => {
    const fixture = setup(['work-id']);
    jest
      .mocked(dataService.updateConversationTagById)
      .mockResolvedValue({ ...bookmark, ...payload });
    const { result, unmount } = renderHook(
      () => useConversationTagMutation({ context: 'test', tag: 'Work', tagId: 'work-id' }),
      { wrapper: fixture.wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync(payload);
    });
    expect(fixture.fetchRows).not.toHaveBeenCalled();
    unmount();
    fixture.cleanup();
  },
);
