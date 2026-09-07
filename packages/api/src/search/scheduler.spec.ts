import { startIndexSyncScheduler } from './scheduler';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('startIndexSyncScheduler', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('runs startup and periodic checks without overlap', async () => {
    jest.useFakeTimers();
    const startup = createDeferred();
    const run = jest.fn((reason: 'startup' | 'periodic') =>
      reason === 'startup' ? startup.promise : Promise.resolve(),
    );
    const onError = jest.fn();

    const scheduler = startIndexSyncScheduler({ run, onError, intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith('startup');

    await jest.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);

    startup.resolve();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('periodic');
    expect(onError).not.toHaveBeenCalled();

    scheduler.stop();
  });

  test('reports failures and continues scheduling', async () => {
    jest.useFakeTimers();
    const error = new Error('sync failed');
    const run = jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = jest.fn();

    const scheduler = startIndexSyncScheduler({ run, onError, intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(error);

    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });
});
