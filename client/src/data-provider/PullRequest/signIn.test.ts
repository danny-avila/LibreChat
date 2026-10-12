import { QueryKeys } from 'librechat-data-provider';
import { QueryClient } from '@tanstack/react-query';
import type { TPullRequestConnection } from 'librechat-data-provider';
import {
  PULL_REQUEST_CONNECT_POLL_MS,
  announceOAuthSettled,
  stopPullRequestSignIns,
  pullRequestSignInSession,
  watchPullRequestSignIn,
} from './signIn';
import { endPullRequestSession } from './queries';

const mockGetConnection = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getPullRequestConnection: (...args: unknown[]) => mockGetConnection(...args),
    },
  };
});

/** jsdom has no BroadcastChannel; this one delivers between instances of one name, as tabs do. */
class FakeBroadcastChannel {
  static open = new Set<FakeBroadcastChannel>();
  private listeners = new Set<(event: MessageEvent) => void>();
  constructor(readonly name: string) {
    FakeBroadcastChannel.open.add(this);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  postMessage(data: unknown) {
    for (const other of FakeBroadcastChannel.open) {
      if (other !== this && other.name === this.name) {
        other.listeners.forEach((listener) => listener({ data } as MessageEvent));
      }
    }
  }

  close() {
    FakeBroadcastChannel.open.delete(this);
  }
}

const connection = (connected: boolean): TPullRequestConnection => ({
  configured: true,
  provider: 'github',
  connected,
});

const MINUTE = 60_000;

const setup = () => {
  const client = new QueryClient({
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  return { client, invalidate };
};

const pass = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const focus = async () => {
  window.dispatchEvent(new Event('focus'));
  await pass(0);
};

describe('watchPullRequestSignIn', () => {
  beforeAll(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel;
  });

  afterAll(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetConnection.mockReset();
    mockGetConnection.mockResolvedValue(connection(false));
  });

  afterEach(() => {
    stopPullRequestSignIns();
    jest.useRealTimers();
  });

  it('refreshes pull requests and stops once the account shows connected', async () => {
    const { client, invalidate } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });

    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();

    mockGetConnection.mockResolvedValue(connection(true));
    await focus();
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
    expect(client.getQueryData([QueryKeys.pullRequestConnection])).toEqual(connection(true));

    const asked = mockGetConnection.mock.calls.length;
    await pass(5 * MINUTE);
    await focus();
    expect(mockGetConnection).toHaveBeenCalledTimes(asked);
  });

  it('asks at once when the sign-in page announces it settled, however the popup reads', async () => {
    const { client, invalidate } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });
    mockGetConnection.mockResolvedValue(connection(true));

    /** Before any timer is due: only the announcement can explain this ask. */
    announceOAuthSettled();
    await pass(0);
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
  });

  it('backs off asking on a timer, so a sign-in left open costs few requests', async () => {
    const { client } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 60 * MINUTE,
    });

    await pass(15_000);
    /** Responsive while a sign-in is likely: 2, 6 and 14 seconds in. */
    expect(mockGetConnection).toHaveBeenCalledTimes(3);
    await pass(60 * MINUTE - 15_000);
    /** At most one ask per 30 seconds after that: about 120 in an hour, not 1,800. */
    expect(mockGetConnection.mock.calls.length).toBeLessThanOrEqual(122);
  });

  it('stops watching, focus and announcements included, when the flow expires', async () => {
    const { client } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 1 * MINUTE,
    });
    await pass(1 * MINUTE);
    const asked = mockGetConnection.mock.calls.length;

    await pass(5 * MINUTE);
    await focus();
    announceOAuthSettled();
    await pass(0);
    expect(mockGetConnection).toHaveBeenCalledTimes(asked);
  });

  it('keeps watching through a failed status read', async () => {
    const { client, invalidate } = setup();
    mockGetConnection.mockRejectedValueOnce(new Error('500'));
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);

    mockGetConnection.mockResolvedValue(connection(true));
    await focus();
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
  });

  it('refreshes pull requests when the account it watches turns out disconnected', async () => {
    const { client, invalidate } = setup();
    mockGetConnection.mockResolvedValueOnce(connection(true));
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });
    await focus();
    expect(invalidate).toHaveBeenCalledTimes(1);

    /** Removed elsewhere while this window still watches a new sign-in. */
    mockGetConnection.mockResolvedValue(connection(false));
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });
    await focus();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('replaces the watch on an earlier sign-in when another starts', async () => {
    const { client } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });

    await focus();
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });

  it('ends every watch with the session, so none asks for the next user', async () => {
    const { client } = setup();
    watchPullRequestSignIn(client, {
      startedIn: pullRequestSignInSession(),
      expiresAt: Date.now() + 10 * MINUTE,
    });

    endPullRequestSession();
    await pass(10 * MINUTE);
    await focus();
    announceOAuthSettled();
    await pass(0);
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('does not start a watch for a sign-in begun in a session that has since ended', async () => {
    const { client } = setup();
    const startedIn = pullRequestSignInSession();
    endPullRequestSession();
    watchPullRequestSignIn(client, { startedIn, expiresAt: Date.now() + 10 * MINUTE });

    await pass(10 * MINUTE);
    await focus();
    expect(mockGetConnection).not.toHaveBeenCalled();
  });
});
