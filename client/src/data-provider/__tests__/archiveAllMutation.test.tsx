import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useArchiveAllConversationsMutation } from '../mutations';

const mockArchiveAllConversations = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      archiveAllConversations: (...args: unknown[]) => mockArchiveAllConversations(...args),
    },
  };
});

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

describe('archive-all mutation cache refresh', () => {
  it('refetches inactive archived, project, and conversation detail queries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const archivedQuery = jest.fn().mockResolvedValue({ pages: [], pageParams: [] });
    const projectQuery = jest.fn().mockResolvedValue({ _id: 'project-1', conversationCount: 1 });
    const conversationQuery = jest
      .fn()
      .mockResolvedValue({ conversationId: 'conversation-1', isArchived: false });

    await queryClient.fetchQuery(
      [QueryKeys.archivedConversations, { isArchived: true }],
      archivedQuery,
    );
    await queryClient.fetchQuery([QueryKeys.project, 'project-1'], projectQuery);
    await queryClient.fetchQuery([QueryKeys.conversation, 'conversation-1'], conversationQuery);

    mockArchiveAllConversations.mockResolvedValue({ archivedCount: 1 });
    const { result } = renderHook(() => useArchiveAllConversationsMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(archivedQuery).toHaveBeenCalledTimes(2);
      expect(projectQuery).toHaveBeenCalledTimes(2);
      expect(conversationQuery).toHaveBeenCalledTimes(2);
    });

    queryClient.clear();
  });
});
