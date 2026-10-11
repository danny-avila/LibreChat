import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TPullRequestConnection } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import { syncPullRequestConnection } from './connection';

/** How often the status is asked while the sign-in window is still open. */
export const PULL_REQUEST_CONNECT_POLL_MS = 2000;

type Watch = { stop: () => void };

/** One sign-in per app at a time: starting another replaces the watch on the first. */
const watches = new WeakMap<QueryClient, Watch>();

/**
 * Watches a sign-in started from this window until the account is connected, outside any
 * component, so closing Settings mid-flow still refreshes what was fetched with the old token.
 *
 * - While the sign-in window is open, the status is asked on an interval, because the provider can
 *   finish without this window ever regaining focus.
 * - Once that window is closed (finished, denied or cancelled) the interval stops after one last
 *   ask. The flow may still finish in a window this one lost track of, so until it expires the
 *   status is asked again whenever this window regains focus, and never on a timer.
 * - At `expiresAt` the server's signed state is no longer accepted, so watching ends.
 * - Seeing the account connected ends watching and refetches every cached pull request, once,
 *   through the same check a mounted status row uses.
 *
 * A failed status read is not an answer, so watching continues; the row shows the failure.
 * Returns a function that ends the watch.
 */
export function watchPullRequestSignIn(
  queryClient: QueryClient,
  { popup, expiresAt }: { popup: Pick<Window, 'closed'>; expiresAt: number },
): () => void {
  watches.get(queryClient)?.stop();
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const check = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    let status: TPullRequestConnection;
    try {
      status = await queryClient.fetchQuery<TPullRequestConnection>(
        [QueryKeys.pullRequestConnection],
        () => dataService.getPullRequestConnection(),
        { staleTime: 0, retry: false },
      );
    } catch {
      return;
    }
    if (stopped) {
      return;
    }
    /** Every answer, so an account removed elsewhere mid-flow also refreshes pull requests. */
    syncPullRequestConnection(queryClient, status);
    if (status.connected) {
      stop();
    }
  };

  const tick = () => {
    if (popup.closed) {
      clearInterval(interval);
      interval = undefined;
    }
    void check();
  };
  const onFocus = () => void check();
  const expiry = setTimeout(() => stop(), Math.max(0, expiresAt - Date.now()));

  function stop() {
    stopped = true;
    clearInterval(interval);
    clearTimeout(expiry);
    window.removeEventListener('focus', onFocus);
    if (watches.get(queryClient) === watch) {
      watches.delete(queryClient);
    }
  }

  const watch: Watch = { stop };
  watches.set(queryClient, watch);
  interval = setInterval(tick, PULL_REQUEST_CONNECT_POLL_MS);
  window.addEventListener('focus', onFocus);
  return stop;
}

/** Ends the sign-in watch of an app, if one is running. */
export function stopPullRequestSignIn(queryClient: QueryClient): void {
  watches.get(queryClient)?.stop();
}
