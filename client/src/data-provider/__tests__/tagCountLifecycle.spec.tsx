import { useState } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TConversationTag } from 'librechat-data-provider';
import { useConversationTagsQuery } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, getConversationTags: jest.fn() },
  };
});

const counted = {
  _id: 'work-id',
  user: 'owner',
  tag: 'Work',
  position: 0,
  count: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies TConversationTag;

function CountSnapshot() {
  const query = useConversationTagsQuery({ staleTime: Infinity, refetchOnMount: 'always' });
  const current = !query.isFetching && !query.isStale && !query.isError;
  return <output data-testid="count-state">{current ? query.data?.[0]?.count : 'hidden'}</output>;
}

function Host({ queryClient }: { queryClient: QueryClient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen((value) => !value)}>{open ? 'Close' : 'Open'}</button>
      <button
        onClick={() =>
          queryClient.invalidateQueries({
            queryKey: [QueryKeys.conversationTags],
            refetchType: 'none',
          })
        }
      >
        {'Invalidate'}
      </button>
      {open && <CountSnapshot />}
    </>
  );
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Host queryClient={queryClient} />
    </QueryClientProvider>,
  );
  return queryClient;
}

it('fetches only on explicit open, suppresses an invalidated snapshot, and refreshes on reopen', async () => {
  jest.mocked(dataService.getConversationTags).mockResolvedValue([counted]);
  setup();
  expect(dataService.getConversationTags).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Open'));
  await waitFor(() => expect(screen.getByTestId('count-state')).toHaveTextContent('2'));
  expect(dataService.getConversationTags).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText('Invalidate'));
  await waitFor(() => expect(screen.getByTestId('count-state')).toHaveTextContent('hidden'));
  expect(dataService.getConversationTags).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Open'));
  await waitFor(() => expect(screen.getByTestId('count-state')).toHaveTextContent('2'));
  expect(dataService.getConversationTags).toHaveBeenCalledTimes(2);
});

it('does not expose the previous snapshot when an explicit refresh fails', async () => {
  const queryClient = setup();
  queryClient.setQueryData([QueryKeys.conversationTags], [counted]);
  await queryClient.invalidateQueries({
    queryKey: [QueryKeys.conversationTags],
    refetchType: 'none',
  });
  jest.mocked(dataService.getConversationTags).mockRejectedValue(new Error('Offline'));

  await act(async () => {
    fireEvent.click(screen.getByText('Open'));
  });
  await waitFor(() => expect(dataService.getConversationTags).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('count-state')).toHaveTextContent('hidden');
});
