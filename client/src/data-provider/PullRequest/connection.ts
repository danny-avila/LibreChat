import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { TPullRequestConnectStart, TPullRequestConnection } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import { useGetStartupConfig } from '../Endpoints';

/**
 * The credential the server looks this user's pull requests up with, as the status shows it:
 * the user's own account (the grant a given sign-in produced, when the server names it) or the
 * server's token, on the provider the deployment now uses.
 */
const credentialOf = (status: TPullRequestConnection): string =>
  status.connected
    ? `user:${status.provider ?? ''}:${status.flowId ?? ''}`
    : `server:${status.provider ?? ''}`;

/** Per app, the credential its cached pull requests were last refreshed under. */
const refreshedUnder = new Map<QueryClient, string>();

/** Forgets every app's credential with the session, so the next one starts from its own. */
export function resetPullRequestCredentials(): void {
  refreshedUnder.clear();
}

/**
 * Refetches every cached pull request when a status shows a different credential than the one
 * they were last refreshed under: connecting, disconnecting, or a connection moving to another
 * provider. The first status an app sees refreshes them only when it shows the user's own
 * account, since anything fetched before it may have used the server's token; one showing the
 * server's token, the common case, costs nothing. Every path that learns the status goes
 * through here, so a change refetches pull requests once.
 */
export function syncPullRequestConnection(
  queryClient: QueryClient,
  status: TPullRequestConnection,
): void {
  const credential = credentialOf(status);
  const previous = refreshedUnder.get(queryClient);
  refreshedUnder.set(queryClient, credential);
  if (previous === credential || (previous == null && !status.connected)) {
    return;
  }
  queryClient.invalidateQueries([QueryKeys.conversationPullRequest]);
}

/**
 * Whether the signed-in user has connected their own account. Asked only when the deployment
 * offers connecting one, and again when the window regains focus; a sign-in in progress is
 * watched by `watchPullRequestSignIn`, which outlives this hook. A change in either direction
 * swaps the token the server looks pull requests up with, so every cached pull request is
 * refetched.
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

  const { data } = query;
  useEffect(() => {
    if (data != null) {
      syncPullRequestConnection(queryClient, data);
    }
  }, [data, queryClient]);

  return query;
};

/**
 * The same status for what contains the Settings row, so an app the server no longer has hides
 * the whole section, and a later answer that it has one again brings the section back. It shares
 * the row's query and leaves refetching pull requests on a change to the row.
 */
export const usePullRequestConnectionStatus = () => {
  const { data: startupConfig } = useGetStartupConfig();
  return useQuery<TPullRequestConnection>(
    [QueryKeys.pullRequestConnection],
    () => dataService.getPullRequestConnection(),
    {
      enabled: startupConfig?.pullRequestsConnect != null,
      retry: false,
      refetchOnWindowFocus: true,
    },
  ).data;
};

/** Starts the provider's sign-in; the caller navigates a window it opened to the returned url. */
export const useConnectPullRequestAccountMutation = () =>
  useMutation<TPullRequestConnectStart, unknown, void>({
    mutationKey: [MutationKeys.connectPullRequestAccount],
    mutationFn: () => dataService.connectPullRequestAccount(),
  });

export const useDisconnectPullRequestAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, void>({
    mutationKey: [MutationKeys.disconnectPullRequestAccount],
    mutationFn: () => dataService.disconnectPullRequestAccount(),
    onSuccess: () => {
      const status = queryClient.setQueryData<TPullRequestConnection>(
        [QueryKeys.pullRequestConnection],
        (current) => (current == null ? current : { ...current, connected: false }),
      );
      queryClient.invalidateQueries([QueryKeys.pullRequestConnection]);
      /** A disconnect always leaves the server's token, whatever this app saw before. */
      refreshedUnder.set(
        queryClient,
        credentialOf({ configured: true, provider: status?.provider, connected: false }),
      );
      queryClient.invalidateQueries([QueryKeys.conversationPullRequest]);
    },
  });
};
