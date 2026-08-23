import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdatePinnedOrderMutation } from '../Favorites';
import { setSessionUserId } from '~/utils/session';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getPinnedOrder: jest.fn(),
      updatePinnedOrder: jest.fn(),
    },
  };
});

const updatePinnedOrder = dataService.updatePinnedOrder as jest.MockedFunction<
  typeof dataService.updatePinnedOrder
>;
const getPinnedOrder = dataService.getPinnedOrder as jest.MockedFunction<
  typeof dataService.getPinnedOrder
>;

/** Resolves/rejects on command so two writes can be held in flight at once. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = (userId: string | undefined = 'user-a') => {
  /* Identity is published by the auth provider, which is mounted for the whole
   * session, so a test only has to say who is signed in. */
  setSessionUserId(userId);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(() => useUpdatePinnedOrderMutation(), { wrapper });
  return { queryClient, result, unmount, signInAs: setSessionUserId };
};

const cached = (queryClient: QueryClient) =>
  queryClient.getQueryData<string[]>([QueryKeys.pinnedOrder]);

describe('useUpdatePinnedOrderMutation', () => {
  beforeEach(() => {
    /* `reset`, not `clear`: a queued `mockResolvedValueOnce` that a test never
     * consumed would otherwise be handed to the next one. */
    jest.resetAllMocks();
    getPinnedOrder.mockResolvedValue(['a', 'b', 'c']);
  });

  it('serializes writes so the server sees them in the order they were made', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result } = setup();

    /* `onMutate` awaits `cancelQueries`, so the request leaves in a microtask
     * rather than inside the `mutate` call itself. */
    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    await act(async () => {
      result.current.mutate(['c', 'b', 'a']);
    });

    /* The second request must not be issued until the first settles, or the
     * server keeps whichever response happens to land last. */
    expect(updatePinnedOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
    });

    await waitFor(() => expect(updatePinnedOrder).toHaveBeenCalledTimes(2));
    expect(updatePinnedOrder.mock.calls[0][0]).toEqual(['b', 'a', 'c']);
    expect(updatePinnedOrder.mock.calls[1][0]).toEqual(['c', 'b', 'a']);
  });

  it('leaves a newer pending order alone when an earlier write fails', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.pinnedOrder], ['a', 'b', 'c']);

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    await act(async () => {
      result.current.mutate(['c', 'b', 'a']);
    });
    expect(cached(queryClient)).toEqual(['c', 'b', 'a']);

    await act(async () => {
      first.reject(new Error('nope'));
      await first.promise.catch(() => undefined);
    });

    /* Rolling back here would put the pre-first-drag order on screen while the
     * second drag is still in flight and about to be stored. */
    await waitFor(() => expect(cached(queryClient)).toEqual(['c', 'b', 'a']));
  });

  it('takes the order the server confirms for the newest write', async () => {
    updatePinnedOrder.mockResolvedValueOnce(['c', 'b', 'a']);

    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.mutateAsync(['c', 'b', 'a']);
    });

    expect(cached(queryClient)).toEqual(['c', 'b', 'a']);
  });

  it('discards the optimistic order when the newest write fails', async () => {
    updatePinnedOrder.mockRejectedValueOnce(new Error('rejected'));

    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.pinnedOrder], ['a', 'b', 'c']);

    await act(async () => {
      await result.current.mutateAsync(['b', 'a', 'c']).catch(() => undefined);
    });

    /* The optimistic value was never accepted, so it must not survive as though
     * it had been. Every automatic refetch trigger is off on this query, so
     * leaving it cached would pass it off as server data all session. */
    await waitFor(() => expect(cached(queryClient)).toBeUndefined());
  });

  it('abandons a queued write when the signed-in user changed', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result, signInAs } = setup('user-a');

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    let queued!: Promise<string[] | string>;
    await act(async () => {
      queued = result.current.mutateAsync(['c', 'b', 'a']).catch(() => 'abandoned');
      /* Let `onMutate` settle so the write is queued and has recorded its owner
       * before the session turns over. */
      await Promise.resolve();
      await Promise.resolve();
    });

    /* The session turns over while the second write is still waiting its turn:
     * sending it would put one account's order in the other's document. */
    signInAs('user-b');

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
      await expect(queued).resolves.toBe('abandoned');
    });

    expect(updatePinnedOrder).toHaveBeenCalledTimes(1);
    expect(updatePinnedOrder.mock.calls[0][0]).toEqual(['b', 'a', 'c']);
  });

  it('still sends a queued write when the same user stays signed in', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result } = setup('user-a');

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    await act(async () => {
      result.current.mutate(['c', 'b', 'a']);
    });

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
    });

    await waitFor(() => expect(updatePinnedOrder).toHaveBeenCalledTimes(2));
  });

  it('does not publish a response that arrives after the account changed', async () => {
    const inFlight = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(inFlight.promise);

    const { queryClient, result, signInAs } = setup('user-a');

    let write!: Promise<unknown>;
    await act(async () => {
      write = result.current.mutateAsync(['b', 'a', 'c']).catch(() => undefined);
      await Promise.resolve();
    });

    /* The request had already left, so the pre-send owner check passed. The
     * cache key is not scoped by user, so publishing this response now would
     * hand account A's order to account B. */
    signInAs('user-b');
    queryClient.setQueryData([QueryKeys.pinnedOrder], ['b-order']);

    await act(async () => {
      inFlight.resolve(['a-order']);
      await write;
    });

    expect(cached(queryClient)).toEqual(['b-order']);
  });

  /* The sidebar drops the section that owns this hook whenever a search is
   * active, while its queued writes keep running. Losing the identity there
   * must not strand work that belongs to the very same account. */
  it('still sends a queued write after the owning section unmounts', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result, unmount } = setup('user-a');

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    await act(async () => {
      result.current.mutate(['c', 'b', 'a']);
    });

    unmount();

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
    });

    await waitFor(() => expect(updatePinnedOrder).toHaveBeenCalledTimes(2));
    expect(updatePinnedOrder.mock.calls[1][0]).toEqual(['c', 'b', 'a']);
  });

  it('rolls back a failed write after the owning section unmounts', async () => {
    const inFlight = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(inFlight.promise);

    const { queryClient, result, unmount } = setup('user-a');
    queryClient.setQueryData([QueryKeys.pinnedOrder], ['a', 'b', 'c']);

    let write!: Promise<unknown>;
    await act(async () => {
      write = result.current.mutateAsync(['b', 'a', 'c']).catch(() => undefined);
      await Promise.resolve();
    });
    /* The optimistic order is on screen and the request has left. */
    expect(cached(queryClient)).toEqual(['b', 'a', 'c']);

    unmount();

    await act(async () => {
      inFlight.reject(new Error('rejected'));
      await write;
    });

    /* Observer callbacks no longer run, so the correction has to come from the
     * request itself; skipping it would leave an order cached that the server
     * never accepted, on a query that refetches on nothing. */
    await waitFor(() => expect(cached(queryClient)).toBeUndefined());
  });

  /* The exact sequence the identity has to survive: the section is unmounted by
   * a search, then A signs out and B signs in before A's queued write starts.
   * A tracker fed only by the unmounted hook would still read A here and post
   * A's order on B's credentials. */
  it('abandons a queued write across a sign-out while the section is unmounted', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result, unmount, signInAs } = setup('user-a');

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    let queued!: Promise<unknown>;
    await act(async () => {
      queued = result.current.mutateAsync(['c', 'b', 'a']).catch(() => 'abandoned');
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();
    signInAs(undefined);
    signInAs('user-b');

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
      await expect(queued).resolves.toBe('abandoned');
    });

    expect(updatePinnedOrder).toHaveBeenCalledTimes(1);
  });

  it('abandons a queued write after a plain sign-out', async () => {
    const first = deferred<string[]>();
    updatePinnedOrder.mockReturnValueOnce(first.promise).mockResolvedValueOnce(['c', 'b', 'a']);

    const { result, signInAs } = setup('user-a');

    await act(async () => {
      result.current.mutate(['b', 'a', 'c']);
    });
    let queued!: Promise<unknown>;
    await act(async () => {
      queued = result.current.mutateAsync(['c', 'b', 'a']).catch(() => 'abandoned');
      await Promise.resolve();
      await Promise.resolve();
    });

    /* Signed out is foreign to every owner: nothing queued should ride out on
     * whatever credentials arrive next. */
    signInAs(undefined);

    await act(async () => {
      first.resolve(['b', 'a', 'c']);
      await expect(queued).resolves.toBe('abandoned');
    });

    expect(updatePinnedOrder).toHaveBeenCalledTimes(1);
  });
});
