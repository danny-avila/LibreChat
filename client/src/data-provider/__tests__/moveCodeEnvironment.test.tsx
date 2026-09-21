import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useMoveConversationCodeEnvironmentMutation,
  useIsReplacingConversationCodeEnvironment,
  useReconcileConversationCodeEnvironmentMutation,
} from '../CodeEnvironments';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      moveConversationCodeEnvironment: jest.fn(),
      getConversationById: jest.fn(),
    },
  };
});

const mac = { environmentId: 'mac', workspaceId: 'primary' };
const vm = { environmentId: 'vm', workspaceId: 'projects' };

describe('useMoveConversationCodeEnvironmentMutation', () => {
  it('keeps the moved decision when a conversation read from before the move resolves later', async () => {
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
      codeWorkspaces: [vm],
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
      await result.current.move.mutateAsync({ conversationId: 'convo-1', from: [mac], to: [vm] });
    });
    await act(async () => {
      resolveStaleRead(stored);
    });

    expect(queryClient.getQueryData([QueryKeys.conversation, 'convo-1'])).toEqual(
      expect.objectContaining({ codeEnvironmentMode: 'attached', codeWorkspaces: [vm] }),
    );
  });
});

describe('conversation-scoped decision recovery', () => {
  const setup = (setConversation = jest.fn()) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(
      () => ({
        change: useMoveConversationCodeEnvironmentMutation(),
        reconcile: useReconcileConversationCodeEnvironmentMutation(setConversation),
        blocked: useIsReplacingConversationCodeEnvironment('convo-1'),
        unrelated: useIsReplacingConversationCodeEnvironment('convo-2'),
      }),
      { wrapper },
    );
  };

  it('blocks only the conversation being changed and unblocks after settlement', async () => {
    let finish!: (value: {
      conversationId: string;
      codeEnvironmentMode: 'attached';
      codeWorkspaces: (typeof vm)[];
    }) => void;
    jest.mocked(dataService.moveConversationCodeEnvironment).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    act(() => result.current.change.mutate({ conversationId: 'convo-1', from: [mac], to: [vm] }));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.unrelated).toBe(false);
    await act(async () => {
      finish({ conversationId: 'convo-1', codeEnvironmentMode: 'attached', codeWorkspaces: [vm] });
    });
    await waitFor(() => expect(result.current.blocked).toBe(false));
  });

  it.each([
    { codeEnvironmentMode: undefined, codeWorkspaces: undefined },
    { codeEnvironmentMode: 'attached' as const, codeWorkspaces: [mac] },
    { codeEnvironmentMode: 'without_attached' as const, codeWorkspaces: undefined },
  ])('reconciles both pre-persistence and persisted failures: %j', async (decision) => {
    const attempted = { codeEnvironmentMode: 'attached' as const, codeWorkspaces: [vm] };
    const current = {
      conversationId: 'convo-1',
      title: 'Keep title',
      ...attempted,
    } as TConversation;
    const persisted = { ...current, ...decision };
    jest.mocked(dataService.getConversationById).mockResolvedValueOnce(persisted);
    const setter = jest.fn();
    const { result } = setup(setter);
    await act(async () => {
      await result.current.reconcile.mutateAsync({ conversationId: 'convo-1', attempted });
    });
    const update = setter.mock.calls[0][0];
    expect(update(current)).toEqual(persisted);
    const other = { ...current, conversationId: 'convo-2' };
    expect(update(other)).toBe(other);
    const changed = {
      ...current,
      codeEnvironmentMode: 'without_attached',
      codeWorkspaces: undefined,
    };
    expect(update(changed)).toBe(changed);
  });

  it('blocks retries while the authoritative decision is being read', async () => {
    let finish!: (value: TConversation) => void;
    jest.mocked(dataService.getConversationById).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    act(() =>
      result.current.reconcile.mutate({
        conversationId: 'convo-1',
        attempted: { codeEnvironmentMode: 'without_attached' },
      }),
    );
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.unrelated).toBe(false);
    await act(async () => {
      finish({
        conversationId: 'convo-1',
        codeEnvironmentMode: 'without_attached',
      } as TConversation);
    });
    await waitFor(() => expect(result.current.blocked).toBe(false));
  });
});
