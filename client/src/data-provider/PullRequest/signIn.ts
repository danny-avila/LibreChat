import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TPullRequestConnection } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import { syncPullRequestConnection } from './connection';

/** First wait between status asks while a sign-in is watched; each wait doubles from here. */
export const PULL_REQUEST_CONNECT_POLL_MS = 2000;
/** Longest wait between status asks, so a sign-in left open costs a few requests a minute. */
export const PULL_REQUEST_CONNECT_POLL_MAX_MS = 30_000;
/** Same-origin pages that end an OAuth sign-in announce it here. */
export const OAUTH_SETTLED_CHANNEL = 'librechat:oauth-settled';

type Watch = { stop: () => void };

/** What a landing page says about the sign-in it ends, and which one when it knows. */
export type OAuthSettlement = { outcome: 'succeeded' | 'failed'; flowId?: string };

const isSettlement = (value: unknown): value is OAuthSettlement =>
  typeof value === 'object' &&
  value !== null &&
  ((value as OAuthSettlement).outcome === 'succeeded' ||
    (value as OAuthSettlement).outcome === 'failed');

/** One sign-in per app at a time: starting another replaces the watch on the first. */
const watches = new Map<QueryClient, Watch>();
/** Counts ended sessions, so work started in one session can tell it has ended. */
let session = 0;

/** The current session; a sign-in started now is watched only while this stays current. */
export function pullRequestSignInSession(): number {
  return session;
}

/**
 * Announces, from the page an OAuth sign-in lands on, how it settled. The page shares this app's
 * origin, so the announcement reaches the window that started the sign-in even when the
 * provider's pages severed the popup from it (a cross-origin opener policy makes the retained
 * window handle read as closed while the sign-in is still open).
 */
export function announceOAuthSettled(settlement: OAuthSettlement): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }
  const channel = new BroadcastChannel(OAUTH_SETTLED_CHANNEL);
  channel.postMessage(settlement);
  channel.close();
}

/**
 * Watches a sign-in started from this window until the account is connected, outside any
 * component, so closing Settings mid-flow still refreshes what was fetched with the old token.
 *
 * - The landing page's announcement asks the status at once; it is the signal that survives the
 *   provider severing the popup, so the popup handle is not consulted at all. A failure ends the
 *   watch only when it names this sign-in's flow: the server names it on every failure after the
 *   flow is bound, so one naming none belongs to another sign-in or never reached this one.
 * - Without it (an older page, no BroadcastChannel) the status is asked on a timer that starts at
 *   2 seconds and doubles to 30, and whenever this window regains focus.
 * - At `expiresAt` the server's signed state is no longer accepted, so watching ends.
 * - Seeing the grant this sign-in produced ends watching. A server that names grants by the flow
 *   behind them lets another flow's grant (a second tab, an earlier click) be told apart, and that
 *   one does not end this watch; an older server's connected status does. Every answer goes
 *   through the same check a mounted status row uses, so a change of credential, a replaced grant
 *   included, refetches cached pull requests once.
 *
 * A failed status read is not an answer, so watching continues; the row shows the failure.
 * Returns a function that ends the watch; ending the session ends every watch.
 */
export function watchPullRequestSignIn(
  queryClient: QueryClient,
  { expiresAt, startedIn, flowId }: { expiresAt: number; startedIn: number; flowId?: string },
): () => void {
  /** Started before the session ended: nothing to watch for whoever signs in next. */
  if (startedIn !== session) {
    return () => undefined;
  }
  watches.get(queryClient)?.stop();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = PULL_REQUEST_CONNECT_POLL_MS;
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
    /** An answer already asked for still counts once the watch expires or is replaced, since a
     *  sign-in that landed just before expiry must refresh pull requests; only a session that
     *  ended in between discards it, as it would apply to whoever signs in next. */
    if (startedIn !== session) {
      return;
    }
    /** Every answer, so an account removed elsewhere mid-flow also refreshes pull requests. */
    syncPullRequestConnection(queryClient, status);
    const ours = flowId == null || status.flowId == null || status.flowId === flowId;
    if (status.connected && ours) {
      stop();
    }
  };

  const schedule = () => {
    timer = setTimeout(() => {
      void check();
      wait = Math.min(wait * 2, PULL_REQUEST_CONNECT_POLL_MAX_MS);
      schedule();
    }, wait);
  };
  const onSignal = () => void check();
  const onSettled = (event: MessageEvent) => {
    const settlement: unknown = event.data;
    if (!isSettlement(settlement) || settlement.outcome === 'succeeded') {
      void check();
      return;
    }
    /** A failure naming no flow is another sign-in's (an MCP server's, say): ours always name it. */
    if (settlement.flowId != null && settlement.flowId === flowId) {
      /** The server can store the grant and still report the flow failed (a check after storing
       *  could not finish), so the status is read once more before the watch ends. */
      void check().finally(stop);
    }
  };
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(OAUTH_SETTLED_CHANNEL);
  channel?.addEventListener('message', onSettled);
  const expiry = setTimeout(() => stop(), Math.max(0, expiresAt - Date.now()));

  function stop() {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(expiry);
    window.removeEventListener('focus', onSignal);
    channel?.close();
    if (watches.get(queryClient) === watch) {
      watches.delete(queryClient);
    }
  }

  const watch: Watch = { stop };
  watches.set(queryClient, watch);
  schedule();
  window.addEventListener('focus', onSignal);
  return stop;
}

/** Ends every sign-in watch, as the session ending does: none may ask for the next user. */
export function stopPullRequestSignIns(): void {
  session += 1;
  for (const watch of [...watches.values()]) {
    watch.stop();
  }
}
