import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { TPullRequestConnection } from 'librechat-data-provider';
import { useGetStartupConfig } from '../Endpoints';

/**
 * Whether the signed-in user has connected their own account. Asked only when the deployment
 * offers connecting one, and again when the window regains focus, so the answer catches up once
 * the provider's sign-in tab closes. A change in either direction swaps the token the server
 * looks pull requests up with, so every cached pull request is refetched.
 */
export const usePullRequestConnectionQuery = () => {
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const query = useQuery<TPullRequestConnection>(
    [QueryKeys.pullRequestConnection],
    () => dataService.getPullRequestConnection(),
    {
      enabled: startupConfig?.pullRequestsConnect != null,
      retry: false,
      refetchOnWindowFocus: true,
    },
  );

  const connected = query.data?.connected;
  const previous = useRef(connected);
  useEffect(() => {
    if (previous.current != null && connected != null && previous.current !== connected) {
      queryClient.invalidateQueries([QueryKeys.conversationPullRequest]);
    }
    previous.current = connected ?? previous.current;
  }, [connected, queryClient]);

  return query;
};

/** Starts the provider's sign-in; the caller navigates a window it opened to the returned url. */
export const useConnectPullRequestAccountMutation = () =>
  useMutation<{ url: string }, unknown, void>({
    mutationKey: [MutationKeys.connectPullRequestAccount],
    mutationFn: () => dataService.connectPullRequestAccount(),
  });

export const useDisconnectPullRequestAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, void>({
    mutationKey: [MutationKeys.disconnectPullRequestAccount],
    mutationFn: () => dataService.disconnectPullRequestAccount(),
    onSuccess: () => {
      queryClient.setQueryData<TPullRequestConnection>(
        [QueryKeys.pullRequestConnection],
        (current) => (current == null ? current : { ...current, connected: false }),
      );
      queryClient.invalidateQueries([QueryKeys.pullRequestConnection]);
      queryClient.invalidateQueries([QueryKeys.conversationPullRequest]);
    },
  });
};
