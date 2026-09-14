import { useState } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TConversation, TConversationTagCatalog } from 'librechat-data-provider';
import type { BookmarkMenuProps } from '../useBookmarkItems';
import useBookmarkSuccess from '~/hooks/Conversations/useBookmarkSuccess';
import useBookmarkItems from '../useBookmarkItems';

const mockShowToast = jest.fn();
jest.mock('@librechat/client', () => ({ useToastContext: () => ({ showToast: mockShowToast }) }));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/components/Bookmarks', () => ({ BookmarkEditDialog: () => null }));
jest.mock('~/data-provider', () => ({
  useConversationTagCatalogQuery:
    jest.requireActual('~/data-provider/queries').useConversationTagCatalogQuery,
  useTagConversationMutation: jest.requireActual('~/data-provider/mutations')
    .useTagConversationMutation,
}));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      addTagToConversation: jest.fn(),
      getConversationTagCatalog: jest.fn(),
      getConversationById: jest.fn(),
    },
  };
});

const deleted = { _id: 'deleted-id', tag: 'Deleted', position: 0 } as TConversationTagCatalog;
const work = { ...deleted, _id: 'work-id', tag: 'Work', position: 1 };
const original = {
  conversationId: 'original',
  tags: ['Deleted'],
  tagIds: ['deleted-id'],
} as TConversation;
const refreshed = { ...original, tags: [], tagIds: [] };
const next = { ...refreshed, conversationId: 'next' };

function Menu(props: BookmarkMenuProps) {
  const { items } = useBookmarkItems(props);
  return (
    <>
      {items
        .filter((item) => item.id === 'work-id')
        .map((item) => (
          <button key={item.id} onClick={item.onClick} disabled={item.disabled}>
            {'Toggle work'}
          </button>
        ))}
    </>
  );
}
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: Infinity, staleTime: Infinity } },
  });
  queryClient.setQueryData([QueryKeys.conversationTagCatalog], [deleted, work]);
  queryClient.setQueryData([QueryKeys.conversation, 'original'], original);
  queryClient.setQueryData([QueryKeys.conversation, 'next'], next);
  function Host() {
    const [conversation, setConversation] = useState<TConversation | null>(original);
    const onTagsUpdated = useBookmarkSuccess(conversation?.conversationId ?? '', setConversation);
    return (
      <>
        <button onClick={() => setConversation(next)}>{'Navigate'}</button>
        <output data-testid="active">{JSON.stringify(conversation)}</output>
        <Menu
          key={conversation?.conversationId}
          conversation={conversation}
          onTagsUpdated={onTagsUpdated}
        />
      </>
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>,
  );
  return queryClient;
}
beforeEach(() => {
  jest.mocked(dataService.getConversationTagCatalog).mockResolvedValue([work]);
  jest.mocked(dataService.getConversationById).mockResolvedValue(refreshed);
});

it('recovers stale membership on 404 and lets the next manual toggle succeed without retrying the failed write', async () => {
  const error = { status: 404 };
  jest
    .mocked(dataService.addTagToConversation)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(['work-id']);
  const queryClient = setup();
  fireEvent.click(screen.getByText('Toggle work'));
  await waitFor(() => expect(queryClient.getMutationCache().getAll()[0].state.error).toBe(error));
  expect(dataService.addTagToConversation).toHaveBeenCalledTimes(1);
  expect(dataService.addTagToConversation).toHaveBeenNthCalledWith(1, 'original', {
    tagIds: ['deleted-id', 'work-id'],
    tag: 'work-id',
  });
  expect(JSON.parse(screen.getByTestId('active').textContent ?? '')).toEqual(refreshed);
  expect(queryClient.getQueryData([QueryKeys.conversationTagCatalog])).toEqual([work]);
  fireEvent.click(screen.getByText('Toggle work'));
  await waitFor(() => expect(dataService.addTagToConversation).toHaveBeenCalledTimes(2));
  expect(dataService.addTagToConversation).toHaveBeenNthCalledWith(2, 'original', {
    tagIds: ['work-id'],
    tag: 'work-id',
  });
  await waitFor(() =>
    expect(JSON.parse(screen.getByTestId('active').textContent ?? '').tagIds).toEqual(['work-id']),
  );
});

it('starts independent recovery reads together and preserves a newly navigated conversation', async () => {
  let resolveCatalog: (tags: TConversationTagCatalog[]) => void = () => undefined;
  let resolveConversation: (conversation: TConversation) => void = () => undefined;
  jest.mocked(dataService.getConversationTagCatalog).mockReturnValue(
    new Promise((resolve) => {
      resolveCatalog = resolve;
    }),
  );
  jest.mocked(dataService.getConversationById).mockReturnValue(
    new Promise((resolve) => {
      resolveConversation = resolve;
    }),
  );
  const error = { status: 404 };
  jest.mocked(dataService.addTagToConversation).mockRejectedValue(error);
  const queryClient = setup();
  fireEvent.click(screen.getByText('Toggle work'));
  await waitFor(() => {
    expect(dataService.getConversationTagCatalog).toHaveBeenCalledTimes(1);
    expect(dataService.getConversationById).toHaveBeenCalledWith('original');
  });
  fireEvent.click(screen.getByText('Navigate'));
  await act(async () => {
    resolveCatalog([work]);
    resolveConversation(refreshed);
  });
  await waitFor(() => expect(queryClient.getMutationCache().getAll()[0].state.error).toBe(error));
  expect(JSON.parse(screen.getByTestId('active').textContent ?? '')).toEqual(next);
  expect(queryClient.getQueryData([QueryKeys.conversation, 'original'])).toEqual(refreshed);
  expect(dataService.addTagToConversation).toHaveBeenCalledTimes(1);
});

it.each(['catalog', 'conversation'] as const)(
  'preserves the original mutation error and host when %s recovery fails',
  async (failedRead) => {
    const error = { status: 404 };
    jest.mocked(dataService.addTagToConversation).mockRejectedValue(error);
    if (failedRead === 'catalog')
      jest.mocked(dataService.getConversationTagCatalog).mockRejectedValue(new Error('Offline'));
    else jest.mocked(dataService.getConversationById).mockRejectedValue(new Error('Offline'));
    const queryClient = setup();
    fireEvent.click(screen.getByText('Toggle work'));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()[0].state.error).toBe(error));
    expect(JSON.parse(screen.getByTestId('active').textContent ?? '')).toEqual(original);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(dataService.addTagToConversation).toHaveBeenCalledTimes(1);
  },
);

it('does not recover or replay non-404 errors', async () => {
  const error = { status: 500 };
  jest.mocked(dataService.addTagToConversation).mockRejectedValue(error);
  const queryClient = setup();
  fireEvent.click(screen.getByText('Toggle work'));
  await waitFor(() => expect(queryClient.getMutationCache().getAll()[0].state.error).toBe(error));
  expect(dataService.getConversationTagCatalog).not.toHaveBeenCalled();
  expect(dataService.getConversationById).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledTimes(1);
});
