import { withTimeout } from './promise';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('should resolve when promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000);
    expect(result).toBe('success');
  });

  it('should reject when promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('test error'));
    await expect(withTimeout(promise, 1000)).rejects.toThrow('test error');
  });

  it('should timeout when promise takes too long', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 2000));
    await expect(withTimeout(promise, 100, 'Custom timeout message')).rejects.toThrow(
      'Custom timeout message',
    );
  });

  it('should use default error message when none provided', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 2000));
    await expect(withTimeout(promise, 100)).rejects.toThrow('Operation timed out after 100ms');
  });

  it('should clear timeout when promise resolves', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const promise = Promise.resolve('fast');

    await withTimeout(promise, 1000);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear timeout when promise rejects', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const promise = Promise.reject(new Error('fail'));

    await expect(withTimeout(promise, 1000)).rejects.toThrow('fail');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should handle multiple concurrent timeouts', async () => {
    const promise1 = Promise.resolve('first');
    const promise2 = new Promise((resolve) => setTimeout(() => resolve('second'), 50));
    const promise3 = new Promise((resolve) => setTimeout(() => resolve('third'), 2000));

    const [result1, result2] = await Promise.all([
      withTimeout(promise1, 1000),
      withTimeout(promise2, 1000),
    ]);

    expect(result1).toBe('first');
    expect(result2).toBe('second');

    await expect(withTimeout(promise3, 100)).rejects.toThrow('Operation timed out after 100ms');
  });

  it('should work with async functions', async () => {
    const asyncFunction = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'async result';
    };

    const result = await withTimeout(asyncFunction(), 1000);
    expect(result).toBe('async result');
  });

  it('should work with any return type', async () => {
    const numberPromise = Promise.resolve(42);
    const objectPromise = Promise.resolve({ key: 'value' });
    const arrayPromise = Promise.resolve([1, 2, 3]);

    expect(await withTimeout(numberPromise, 1000)).toBe(42);
    expect(await withTimeout(objectPromise, 1000)).toEqual({ key: 'value' });
    expect(await withTimeout(arrayPromise, 1000)).toEqual([1, 2, 3]);
  });

  it('should call logger when timeout occurs', async () => {
    const loggerMock = jest.fn();
    const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 2000));
    const errorMessage = 'Custom timeout with logger';

    await expect(withTimeout(promise, 100, errorMessage, loggerMock)).rejects.toThrow(errorMessage);

    expect(loggerMock).toHaveBeenCalledTimes(1);
    expect(loggerMock).toHaveBeenCalledWith(errorMessage, expect.any(Error));
  });

  it('should not call logger when promise resolves', async () => {
    const loggerMock = jest.fn();
    const promise = Promise.resolve('success');

    const result = await withTimeout(promise, 1000, 'Should not timeout', loggerMock);

    expect(result).toBe('success');
    expect(loggerMock).not.toHaveBeenCalled();
  });

  it('should work without logger parameter', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 2000));

    await expect(withTimeout(promise, 100, 'No logger provided')).rejects.toThrow(
      'No logger provided',
    );
  });
});
