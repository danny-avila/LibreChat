import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TStartupConfig,
  TPullRequestConnectStart,
  TPullRequestConnection,
} from 'librechat-data-provider';
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

/**
 * Refetches every cached pull request under the credential the server now uses. In-flight loads
 * are cancelled first: an invalidation alone joins a first load that is still running, so one
 * that started with the old credential would land afterwards and stand.
 */
function refetchPullRequests(queryClient: QueryClient): void {
  void queryClient
    .cancelQueries([QueryKeys.conversationPullRequest])
    .then(() => queryClient.invalidateQueries([QueryKeys.conversationPullRequest]));
}

/** Forgets every app's credential with the session, so the next one starts from its own. */
export function resetPullRequestCredentials(): void {
  refreshedUnder.clear();
}

/**
 * Refetches every cached pull request when a status shows a different credential than the one
 * they were last refreshed under: connecting, disconnecting, or a connection moving to another
 * provider. The first status of a session always refreshes them once, whatever it says, since
 * pull requests fetched before it may have used a grant this app never saw. Every path that
 * learns the status goes through here, so a change refetches pull requests once.
 */
export function syncPullRequestConnection(
  queryClient: QueryClient,
  status: TPullRequestConnection,
): void {
  const credential = credentialOf(status);
  const previous = refreshedUnder.get(queryClient);
  refreshedUnder.set(queryClient, credential);
  if (previous === credential) {
    return;
  }
  refetchPullRequests(queryClient);
}

/**
 * Whether asking for the connection can find anything: on any deployment with pull requests on,
 * not only one advertising an app to connect, because a grant made before the app was turned off
 * must still be found to be disconnected.
 */
const isConnectionKnowable = (startupConfig?: Partial<TStartupConfig>): boolean =>
  startupConfig?.pullRequestsEnabled === true || startupConfig?.pullRequestsConnect != null;

/**
 * Whether the signed-in user has connected their own account. Asked on a deployment with pull
 * requests on, and again when the window regains focus; a sign-in in progress is
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
      enabled: isConnectionKnowable(startupConfig),
      retry: false,
      refetchOnWindowFocus: true,
      /** The row renders inside Settings, whose visibility check (`usePullRequestConnectionStatus`)
       *  asks as Settings mounts; the row reuses that answer instead of asking again. */
      refetchOnMount: false,
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
 * the row's query.
 */
export const usePullRequestConnectionStatus = () => {
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const { data } = useQuery<TPullRequestConnection>(
    [QueryKeys.pullRequestConnection],
    () => dataService.getPullRequestConnection(),
    {
      enabled: isConnectionKnowable(startupConfig),
      retry: false,
      refetchOnWindowFocus: true,
    },
  );
  /** Synced here too: a status that hides the row (a grant removed while its app is off) must
   *  still refetch pull requests looked up with that grant. A status already synced is a no-op. */
  useEffect(() => {
    if (data != null) {
      syncPullRequestConnection(queryClient, data);
    }
  }, [data, queryClient]);
  return data;
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
      refetchPullRequests(queryClient);
    },
    /** A failed request may still have ended the connection (the server fences the grant before
     *  removing it), so the status is asked again and a change refetches pull requests. */
    onError: () => {
      queryClient.invalidateQueries([QueryKeys.pullRequestConnection]);
    },
  });
};
