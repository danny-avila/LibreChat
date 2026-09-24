import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useMoveConversationCodeEnvironmentMutation } from '../CodeEnvironments';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, moveConversationCodeEnvironment: jest.fn() },
  };
});

const mac = { environmentId: 'mac', workspaceId: 'primary' };
const vm = { environmentId: 'vm', workspaceId: 'projects' };

describe('useMoveConversationCodeEnvironmentMutation', () => {
  it.each([vm, { ...mac, workspaceId: 'replacement' }])(
    'keeps the moved decision %j when a pre-move conversation read resolves later',
    async (target) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const stored = {
        conversationId: 'convo-1',
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [mac],
      } as TConversation;
      queryClient.setQueryData([QueryKeys.conversation, 'convo-1'], stored);
      jest.mocked(dataService.moveConversationCodeEnvironment).mockResolvedValue({
        conversationId: 'convo-1',
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [target],
      });
      let resolveStaleRead: (conversation: TConversation) => void = () => undefined;
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(
        () => ({
          conversation: useQuery(
            [QueryKeys.conversation, 'convo-1'],
            () =>
              new Promise<TConversation>((resolve) => {
                resolveStaleRead = resolve;
              }),
            { staleTime: 0 },
          ),
          move: useMoveConversationCodeEnvironmentMutation(),
        }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.conversation.isFetching).toBe(true));

      await act(async () => {
        await result.current.move.mutateAsync({
          conversationId: 'convo-1',
          from: [mac],
          to: [target],
        });
      });
      await act(async () => {
        resolveStaleRead(stored);
      });

      expect(queryClient.getQueryData([QueryKeys.conversation, 'convo-1'])).toEqual(
        expect.objectContaining({ codeEnvironmentMode: 'attached', codeWorkspaces: [target] }),
      );
    },
  );
});
