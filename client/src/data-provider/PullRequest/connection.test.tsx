import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TPullRequestConnection, TStartupConfig } from 'librechat-data-provider';
import {
  resetPullRequestCredentials,
  usePullRequestConnectionQuery,
  useDisconnectPullRequestAccountMutation,
} from './connection';

const mockGetConnection = jest.fn();
const mockDisconnect = jest.fn();
const mockStartup: { current: Partial<TStartupConfig> | undefined } = {
  current: { pullRequestsConnect: 'github' },
};

jest.mock('../Endpoints', () => ({
  useGetStartupConfig: () => ({ data: mockStartup.current }),
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getPullRequestConnection: (...args: unknown[]) => mockGetConnection(...args),
      disconnectPullRequestAccount: (...args: unknown[]) => mockDisconnect(...args),
    },
  };
});

const connection = (connected: boolean): TPullRequestConnection => ({
  configured: true,
  provider: 'github',
  connected,
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
};

describe('pull request connection hooks', () => {
  beforeEach(() => {
    mockStartup.current = { pullRequestsConnect: 'github' };
    mockGetConnection.mockReset();
    mockDisconnect.mockReset();
  });

  it('never asks a deployment with pull requests off', () => {
    mockStartup.current = {};
    const { wrapper } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('asks a deployment with pull requests on that no longer offers an app', async () => {
    mockStartup.current = { pullRequestsEnabled: true };
    mockGetConnection.mockResolvedValueOnce({ configured: false, connected: true });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(result.current.data?.connected).toBe(true));
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });

  it('refetches cached pull requests once a connection made elsewhere shows up', async () => {
    mockGetConnection.mockResolvedValueOnce(connection(false));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(result.current.data?.connected).toBe(false));
    expect(invalidate).not.toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);

    mockGetConnection.mockResolvedValueOnce(connection(true));
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]),
    );
  });

  it('refetches cached pull requests when the first status shows the user connected', async () => {
    mockGetConnection.mockResolvedValueOnce(connection(true));
    const { wrapper, invalidate } = setup();
    renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('leaves cached pull requests alone when the first status shows the server token', async () => {
    mockGetConnection.mockResolvedValueOnce(connection(false));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(result.current.data?.connected).toBe(false));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refreshes pull requests once per change, not on every Settings visit', async () => {
    mockGetConnection.mockResolvedValue(connection(true));
    const { wrapper, invalidate } = setup();
    const first = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await act(async () => {
      await second.result.current.refetch();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('refetches cached pull requests when a connection moves to another provider', async () => {
    mockGetConnection.mockResolvedValueOnce(connection(true));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));

    mockGetConnection.mockResolvedValueOnce({ ...connection(true), provider: 'gitlab' });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
  });

  it('refetches cached pull requests when the deployment moves a disconnected user to another provider', async () => {
    mockGetConnection.mockResolvedValueOnce(connection(false));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(result.current.data?.connected).toBe(false));
    expect(invalidate).not.toHaveBeenCalled();

    mockGetConnection.mockResolvedValueOnce({ ...connection(false), provider: 'gitlab' });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]),
    );
  });

  it('starts over with the next session, so its first status follows the first-status rule', async () => {
    mockGetConnection.mockResolvedValue(connection(true));
    const { wrapper, invalidate } = setup();
    const first = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    first.unmount();

    resetPullRequestCredentials();
    const second = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await act(async () => {
      await second.result.current.refetch();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
  });

  it('refetches cached pull requests when another sign-in replaces the grant', async () => {
    mockGetConnection.mockResolvedValueOnce({ ...connection(true), flowId: 'flow-a' });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePullRequestConnectionQuery(), { wrapper });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));

    mockGetConnection.mockResolvedValueOnce({ ...connection(true), flowId: 'flow-b' });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
  });

  it('marks the account disconnected and refetches the status and pull requests', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    const { client, wrapper, invalidate } = setup();
    client.setQueryData([QueryKeys.pullRequestConnection], connection(true));
    const { result } = renderHook(() => useDisconnectPullRequestAccountMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(
      client.getQueryData<TPullRequestConnection>([QueryKeys.pullRequestConnection])?.connected,
    ).toBe(false);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.pullRequestConnection]);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
  });
});
