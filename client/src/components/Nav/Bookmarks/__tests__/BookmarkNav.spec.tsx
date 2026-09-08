import { useState } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversationTag } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import BookmarkNav from '../BookmarkNav';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, getConversationTags: jest.fn() } };
});
jest.mock('~/data-provider', () => jest.requireActual('~/data-provider/tags'));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/utils', () => ({ cn: () => '' }));
jest.mock('@ariakit/react', () => ({
  MenuButton: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));
jest.mock('@librechat/client', () => ({
  buttonVariants: () => '',
  TooltipAnchor: ({
    description,
    render: node,
  }: {
    description: string;
    render: React.ReactNode;
  }) => (
    <div data-testid="label" title={description}>
      {node}
    </div>
  ),
  DropdownPopup: ({ trigger, items }: { trigger: React.ReactNode; items: MenuItemProps[] }) => (
    <div>
      {trigger}
      {items.map((item) => (
        <span key={item.id}>{item.label}</span>
      ))}
    </div>
  ),
}));

const work = { _id: 'work-id', tag: 'Work', count: 1 } as TConversationTag;
const personal = { _id: 'personal-id', tag: 'Personal', count: 1 } as TConversationTag;
const key = [QueryKeys.conversationTags];

function setup(data?: TConversationTag[], selected = ['work-id']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: Infinity } },
  });
  if (data !== undefined) queryClient.setQueryData(key, data);
  function Host() {
    const [tags, setTags] = useState(selected);
    return (
      <>
        <BookmarkNav tags={tags} setTags={setTags} />
        <output data-testid="query-tags">{JSON.stringify(tags.length ? tags : null)}</output>
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

it('removes a locally deleted ID from parent selection while preserving other selected IDs', async () => {
  const queryClient = setup([work, personal], ['work-id', 'personal-id']);
  act(() => queryClient.setQueryData(key, [personal]));
  await waitFor(() =>
    expect(screen.getByTestId('query-tags')).toHaveTextContent('["personal-id"]'),
  );
  expect(screen.getByTestId('label')).toHaveAttribute('title', 'Personal');
});

it('clears the last selected ID after a successful external catalog refresh', async () => {
  jest.mocked(dataService.getConversationTags).mockResolvedValue([]);
  const queryClient = setup([work]);
  await act(async () => {
    await queryClient.refetchQueries(key);
  });
  await waitFor(() => expect(screen.getByTestId('query-tags')).toHaveTextContent('null'));
  expect(screen.getByTestId('label')).toHaveAttribute('title', 'com_ui_bookmarks');
});

it('preserves selection through initial loading and a failed request with a nonblank fallback label', async () => {
  let rejectRequest: (error: Error) => void = () => undefined;
  jest.mocked(dataService.getConversationTags).mockReturnValue(
    new Promise((_, reject) => {
      rejectRequest = reject;
    }),
  );
  setup();
  expect(screen.getByTestId('query-tags')).toHaveTextContent('["work-id"]');
  expect(screen.getByTestId('label')).toHaveAttribute('title', 'com_ui_bookmarks');
  await act(async () => rejectRequest(new Error('Offline')));
  expect(screen.getByTestId('query-tags')).toHaveTextContent('["work-id"]');
});

it('does not prune against cached data while a background refresh is pending or fails', async () => {
  let rejectRequest: (error: Error) => void = () => undefined;
  jest.mocked(dataService.getConversationTags).mockReturnValue(
    new Promise((_, reject) => {
      rejectRequest = reject;
    }),
  );
  const queryClient = setup([work]);
  act(() => {
    void queryClient.refetchQueries(key);
    queryClient.setQueryData(key, []);
  });
  expect(screen.getByTestId('query-tags')).toHaveTextContent('["work-id"]');
  await act(async () => rejectRequest(new Error('Offline')));
  expect(screen.getByTestId('query-tags')).toHaveTextContent('["work-id"]');
});

it('keeps stable selection through rename and a zero-count catalog entry', async () => {
  const queryClient = setup([work]);
  act(() => queryClient.setQueryData(key, [{ ...work, tag: 'Renamed', count: 0 }]));
  await waitFor(() => expect(screen.getByTestId('label')).toHaveAttribute('title', 'Renamed'));
  expect(screen.getByTestId('query-tags')).toHaveTextContent('["work-id"]');
});
