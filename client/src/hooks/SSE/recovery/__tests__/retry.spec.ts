import { getJitteredRetryDelay, runTerminalRetry } from '../retry';

describe('terminal retry policy', () => {
  it('bounds unsuccessful operations and applies jittered delays once per attempt', async () => {
    const operation = jest.fn().mockResolvedValue({ ready: false });
    const wait = jest.fn().mockResolvedValue(true);

    const result = await runTerminalRetry<{ ready: boolean }>({
      operation,
      isSuccess: (value) => value.ready,
      signal: new AbortController().signal,
      delays: [100, 200],
      maxAttempts: 3,
      maxElapsedMs: 10000,
      random: () => 0.5,
      now: () => 0,
      wait,
    });

    expect(result.status).toBe('exhausted');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([
      [100, expect.any(AbortSignal)],
      [200, expect.any(AbortSignal)],
    ]);
  });

  it('stops immediately on a non-retryable error', async () => {
    const error = { response: { status: 400 } };
    const operation = jest.fn().mockRejectedValue(error);
    const wait = jest.fn().mockResolvedValue(true);

    const result = await runTerminalRetry({
      operation,
      signal: new AbortController().signal,
      wait,
    });

    expect(result).toMatchObject({ status: 'failed', error, attempts: 1 });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('stops when the retry budget would be exceeded', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('offline'));
    const wait = jest.fn().mockResolvedValue(true);

    const result = await runTerminalRetry({
      operation,
      signal: new AbortController().signal,
      delays: [1000],
      maxAttempts: 10,
      maxElapsedMs: 999,
      random: () => 0.5,
      now: () => 0,
      wait,
    });

    expect(result.status).toBe('exhausted');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('aborts an in-flight attempt when the overall deadline expires', async () => {
    jest.useFakeTimers();
    const operation = jest.fn((_signal: AbortSignal) => new Promise<never>(() => undefined));

    const resultPromise = runTerminalRetry({
      operation,
      signal: new AbortController().signal,
      maxElapsedMs: 1000,
    });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toMatchObject({
      status: 'exhausted',
      attempts: 1,
    });
    expect(operation.mock.calls[0][0].aborted).toBe(true);
    jest.useRealTimers();
  });

  it('propagates external cancellation to an in-flight attempt', async () => {
    const controller = new AbortController();
    const operation = jest.fn((_signal: AbortSignal) => new Promise<never>(() => undefined));

    const resultPromise = runTerminalRetry({
      operation,
      signal: controller.signal,
    });
    controller.abort();

    await expect(resultPromise).resolves.toMatchObject({
      status: 'aborted',
      attempts: 1,
    });
    expect(operation.mock.calls[0][0].aborted).toBe(true);
  });

  it('clamps jitter to the configured twenty-percent range', () => {
    expect(getJitteredRetryDelay(1000, () => -1)).toBe(800);
    expect(getJitteredRetryDelay(1000, () => 2)).toBe(1200);
  });
});
