import { QueryKeys } from 'librechat-data-provider';
import { QueryClient } from '@tanstack/react-query';
import type { TPullRequestConnection } from 'librechat-data-provider';
import { PULL_REQUEST_CONNECT_POLL_MS, watchPullRequestSignIn } from './signIn';

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
  const popup = { closed: false };
  return { client, invalidate, popup };
};

/** Every interval tick plus the reads it starts. */
const pass = (ms: number) => jest.advanceTimersByTimeAsync(ms);

describe('watchPullRequestSignIn', () => {
  const stops: Array<() => void> = [];
  const watch = (...args: Parameters<typeof watchPullRequestSignIn>) => {
    stops.push(watchPullRequestSignIn(...args));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetConnection.mockReset();
    mockGetConnection.mockResolvedValue(connection(false));
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    jest.useRealTimers();
  });

  it('asks while the window is open, then refreshes pull requests once connected', async () => {
    const { client, invalidate, popup } = setup();
    watch(client, { popup, expiresAt: Date.now() + 10 * MINUTE });

    await pass(PULL_REQUEST_CONNECT_POLL_MS * 2);
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
    expect(invalidate).not.toHaveBeenCalled();

    mockGetConnection.mockResolvedValue(connection(true));
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
    expect(client.getQueryData([QueryKeys.pullRequestConnection])).toEqual(connection(true));

    await pass(PULL_REQUEST_CONNECT_POLL_MS * 5);
    window.dispatchEvent(new Event('focus'));
    await pass(0);
    expect(mockGetConnection).toHaveBeenCalledTimes(3);
  });

  it('stops asking on a timer once the window is closed, after one last ask', async () => {
    const { client, popup } = setup();
    watch(client, { popup, expiresAt: Date.now() + 60 * MINUTE });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(mockGetConnection).toHaveBeenCalledTimes(1);

    popup.closed = true;
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
    await pass(10 * MINUTE);
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
  });

  it('still notices a sign-in finished after its window closed, when this window is focused', async () => {
    const { client, invalidate, popup } = setup();
    popup.closed = true;
    watch(client, { popup, expiresAt: Date.now() + 10 * MINUTE });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    const asked = mockGetConnection.mock.calls.length;

    mockGetConnection.mockResolvedValue(connection(true));
    window.dispatchEvent(new Event('focus'));
    await pass(0);
    expect(mockGetConnection).toHaveBeenCalledTimes(asked + 1);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
  });

  it('stops watching, focus included, when the flow expires', async () => {
    const { client, popup } = setup();
    watch(client, { popup, expiresAt: Date.now() + 1 * MINUTE });
    await pass(1 * MINUTE);
    const asked = mockGetConnection.mock.calls.length;

    await pass(5 * MINUTE);
    window.dispatchEvent(new Event('focus'));
    await pass(0);
    expect(mockGetConnection).toHaveBeenCalledTimes(asked);
  });

  it('refreshes pull requests when the account it watches turns out disconnected', async () => {
    const { client, invalidate, popup } = setup();
    mockGetConnection.mockResolvedValueOnce(connection(true));
    watch(client, { popup: { closed: true }, expiresAt: Date.now() + 10 * MINUTE });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);

    /** Removed elsewhere while this window still watches a new sign-in. */
    mockGetConnection.mockResolvedValue(connection(false));
    watch(client, { popup, expiresAt: Date.now() + 10 * MINUTE });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('keeps watching through a failed status read', async () => {
    const { client, invalidate, popup } = setup();
    mockGetConnection.mockRejectedValueOnce(new Error('500'));
    watch(client, { popup, expiresAt: Date.now() + 10 * MINUTE });
    await pass(PULL_REQUEST_CONNECT_POLL_MS);

    mockGetConnection.mockResolvedValue(connection(true));
    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
  });

  it('replaces the watch on an earlier sign-in when another starts', async () => {
    const { client, popup } = setup();
    const first = { closed: false };
    watch(client, { popup: first, expiresAt: Date.now() + 10 * MINUTE });
    watch(client, { popup, expiresAt: Date.now() + 10 * MINUTE });

    await pass(PULL_REQUEST_CONNECT_POLL_MS);
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });
});
