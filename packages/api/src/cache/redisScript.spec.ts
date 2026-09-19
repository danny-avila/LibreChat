import { evalScript, type RedisScriptClient } from './redisScript';

describe('evalScript', () => {
  test('falls back once on NOSCRIPT, then uses the cached EVALSHA result', async () => {
    const evalsha = jest
      .fn()
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce('cached-result');
    const evalCommand = jest.fn().mockResolvedValue('fallback-result');
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(client, 'return ARGV[1]', 0, 'first')).resolves.toBe('fallback-result');
    await expect(evalScript(client, 'return ARGV[1]', 0, 'second')).resolves.toBe('cached-result');

    expect(evalsha).toHaveBeenCalledTimes(2);
    expect(evalCommand).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledWith('return ARGV[1]', 0, 'first');
  });
  test('serializes concurrent cold loads for the same client and script', async () => {
    let releaseFallback!: () => void;
    const fallbackFinished = new Promise<void>((resolve) => {
      releaseFallback = resolve;
    });
    let signalFallbackStarted!: () => void;
    const fallbackStarted = new Promise<void>((resolve) => {
      signalFallbackStarted = resolve;
    });
    const evalsha = jest
      .fn()
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce('cached-result');
    const evalCommand = jest.fn(async () => {
      signalFallbackStarted();
      await fallbackFinished;
      return 'fallback-result';
    });
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const first = evalScript(client, 'return ARGV[1]', 0, 'first');
    await fallbackStarted;
    const second = evalScript(client, 'return ARGV[1]', 0, 'second');
    await Promise.resolve();

    expect(evalsha).toHaveBeenCalledTimes(1);
    releaseFallback();
    await expect(first).resolves.toBe('fallback-result');
    await expect(second).resolves.toBe('cached-result');
    expect(evalCommand).toHaveBeenCalledTimes(1);
  });
  test('retries a NOSCRIPT miss after a cold load on another cluster master', async () => {
    let releaseFirstLoad!: () => void;
    const firstLoadFinished = new Promise<void>((resolve) => {
      releaseFirstLoad = resolve;
    });
    let signalFirstLoadStarted!: () => void;
    const firstLoadStarted = new Promise<void>((resolve) => {
      signalFirstLoadStarted = resolve;
    });
    const evalsha = jest.fn().mockRejectedValue(new Error('NOSCRIPT No matching script'));
    let loadCount = 0;
    const evalCommand = jest.fn(async () => {
      loadCount += 1;
      if (loadCount === 1) {
        signalFirstLoadStarted();
        await firstLoadFinished;
      }
      return `fallback-result-${loadCount}`;
    });
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const first = evalScript(client, 'return ARGV[1]', 1, '{stream-a}chunks', 'first');
    await firstLoadStarted;
    const second = evalScript(client, 'return ARGV[1]', 1, '{stream-b}chunks', 'second');
    releaseFirstLoad();

    await expect(first).resolves.toBe('fallback-result-1');
    await expect(second).resolves.toBe('fallback-result-2');
    expect(evalsha).toHaveBeenCalledTimes(2);
    expect(evalCommand).toHaveBeenCalledTimes(2);
  });
  test('falls back and memoizes when EVALSHA is denied but EVAL is permitted', async () => {
    const evalsha = jest
      .fn()
      .mockRejectedValue(
        new Error("NOPERM this user has no permissions to run the 'EVALSHA' command"),
      );
    const evalCommand = jest.fn().mockResolvedValue(1);
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(client, 'return 1', 0)).resolves.toBe(1);
    await expect(evalScript(client, 'return 1', 0)).resolves.toBe(1);
    expect(evalsha).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(2);
  });
  test('memoizes an unsupported EVALSHA command', async () => {
    const evalsha = jest.fn().mockRejectedValue(new Error('ERR unknown command EVALSHA'));
    const evalCommand = jest.fn().mockResolvedValue(1);
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(client, 'return 2', 0)).resolves.toBe(1);
    await expect(evalScript(client, 'return 2', 0)).resolves.toBe(1);
    expect(evalsha).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(2);
  });

  test('propagates non-NOSCRIPT EVALSHA failures without falling back', async () => {
    const failure = new Error('READONLY replica cannot accept writes');
    const evalsha = jest.fn().mockRejectedValue(failure);
    const evalCommand = jest.fn();
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(client, 'return 1', 0)).rejects.toBe(failure);
    expect(evalCommand).not.toHaveBeenCalled();
  });

  test('uses a successful EVALSHA result with a cluster-compatible client', async () => {
    const evalsha = jest.fn().mockResolvedValue(7);
    const evalCommand = jest.fn();
    const clusterClient = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(clusterClient, 'return 7', 0)).resolves.toBe(7);
    expect(evalsha).toHaveBeenCalledWith(expect.any(String), 0);
    expect(evalCommand).not.toHaveBeenCalled();
  });
});
