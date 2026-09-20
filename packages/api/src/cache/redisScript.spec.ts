import Redis from 'ioredis';
import { evalScript, type RedisScriptArg, type RedisScriptClient } from './redisScript';

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

    const first = evalScript(client, 'return ARGV[1]', 1, '{stream-a}chunks', 'first');
    await fallbackStarted;
    const second = evalScript(client, 'return ARGV[1]', 1, '{stream-a}chunks', 'second');
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
      const result = `fallback-result-${loadCount}`;
      if (loadCount === 1) {
        signalFirstLoadStarted();
        await firstLoadFinished;
      }
      return result;
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
  test('serializes different scripts during a cold load', async () => {
    let releaseBatchLoad!: () => void;
    const batchLoadFinished = new Promise<void>((resolve) => {
      releaseBatchLoad = resolve;
    });
    let signalBatchLoadStarted!: () => void;
    const batchLoadStarted = new Promise<void>((resolve) => {
      signalBatchLoadStarted = resolve;
    });
    const commandOrder: string[] = [];
    const evalsha = jest.fn(() => {
      if (evalsha.mock.calls.length === 1) {
        commandOrder.push('batch-evalsha');
        return Promise.reject(new Error('NOSCRIPT No matching script'));
      }
      commandOrder.push('direct-evalsha');
      return Promise.resolve('direct-result');
    });
    const evalCommand = jest.fn(async (script: string) => {
      commandOrder.push(`eval:${script}`);
      signalBatchLoadStarted();
      await batchLoadFinished;
      return 'batch-result';
    });
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const batch = evalScript(client, 'batch-script', 1, '{stream-a}chunks', 'batch');
    await batchLoadStarted;
    const direct = evalScript(client, 'direct-script', 1, '{stream-a}chunks', 'direct');
    await Promise.resolve();

    expect(evalsha).toHaveBeenCalledTimes(1);
    releaseBatchLoad();
    await expect(batch).resolves.toBe('batch-result');
    await expect(direct).resolves.toBe('direct-result');
    expect(commandOrder).toEqual(['batch-evalsha', 'eval:batch-script', 'direct-evalsha']);
  });
  test('gates same-key direct calls before a cold EVALSHA miss returns', async () => {
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let signalFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const commandOrder: string[] = [];
    const evalsha = jest.fn((sha: string, _numberOfKeys: number, ...args: RedisScriptArg[]) => {
      commandOrder.push(`${sha}:${args[args.length - 1]}`);
      if (evalsha.mock.calls.length === 1) {
        signalFirstStarted();
        return firstFinished.then(() => 'batch-result');
      }
      return Promise.resolve('direct-result');
    });
    const evalCommand = jest.fn();
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const batch = evalScript(client, 'batch-script-before-miss', 1, '{stream-a}chunks', 'batch');
    await firstStarted;
    const direct = evalScript(client, 'direct-script-before-miss', 1, '{stream-a}chunks', 'direct');
    await Promise.resolve();

    expect(evalsha).toHaveBeenCalledTimes(1);
    releaseFirst();
    await expect(batch).resolves.toBe('batch-result');
    await expect(direct).resolves.toBe('direct-result');
    expect(evalCommand).not.toHaveBeenCalled();
    expect(commandOrder).toHaveLength(2);
  });
  test('does not serialize cold loads for unrelated hash tags', async () => {
    let releaseFirstLoad!: () => void;
    const firstLoadFinished = new Promise<void>((resolve) => {
      releaseFirstLoad = resolve;
    });
    let signalFirstLoadStarted!: () => void;
    const firstLoadStarted = new Promise<void>((resolve) => {
      signalFirstLoadStarted = resolve;
    });
    const evalsha = jest.fn(() => {
      if (evalsha.mock.calls.length === 1) {
        return Promise.reject(new Error('NOSCRIPT No matching script'));
      }
      return Promise.resolve('unrelated-result');
    });
    const evalCommand = jest.fn(async () => {
      signalFirstLoadStarted();
      await firstLoadFinished;
      return 'first-result';
    });
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const first = evalScript(client, 'first-script', 1, '{stream-a}chunks', 'first');
    await firstLoadStarted;
    const unrelated = evalScript(client, 'other-script', 1, '{stream-b}chunks', 'other');

    await expect(unrelated).resolves.toBe('unrelated-result');
    expect(evalsha).toHaveBeenCalledTimes(2);
    releaseFirstLoad();
    await expect(first).resolves.toBe('first-result');
  });
  test('does not share a failed cold load with a waiting caller', async () => {
    let releaseFirstLoad!: () => void;
    const firstLoadFinished = new Promise<void>((resolve) => {
      releaseFirstLoad = resolve;
    });
    let signalFirstLoadStarted!: () => void;
    const firstLoadStarted = new Promise<void>((resolve) => {
      signalFirstLoadStarted = resolve;
    });
    const evalsha = jest.fn().mockRejectedValue(new Error('NOSCRIPT No matching script'));
    const evalCommand = jest
      .fn()
      .mockImplementationOnce(async () => {
        signalFirstLoadStarted();
        await firstLoadFinished;
        throw new Error('EVAL load failed');
      })
      .mockResolvedValueOnce('waiter-result');
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    const first = evalScript(client, 'return ARGV[1]', 1, '{stream-a}chunks', 'first');
    await firstLoadStarted;
    const second = evalScript(client, 'return ARGV[1]', 1, '{stream-a}chunks', 'second');
    releaseFirstLoad();

    await expect(first).rejects.toThrow('EVAL load failed');
    await expect(second).resolves.toBe('waiter-result');
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

  test('does not reload a confirmed SHA after a permission error', async () => {
    const failure = new Error("NOPERM this user has no permissions to run the 'EVALSHA' command");
    const evalsha = jest.fn().mockResolvedValueOnce('warm').mockRejectedValueOnce(failure);
    const evalCommand = jest.fn();
    const client = { evalsha, eval: evalCommand } as unknown as RedisScriptClient;

    await expect(evalScript(client, 'return 1', 0)).resolves.toBe('warm');
    await expect(evalScript(client, 'return 1', 0)).rejects.toBe(failure);
    expect(evalCommand).not.toHaveBeenCalled();
  });

  test('confirms cluster script SHAs per hash tag before allowing a warm script', async () => {
    let releaseFallback!: () => void;
    const fallbackFinished = new Promise<void>((resolve) => {
      releaseFallback = resolve;
    });
    let signalFallbackStarted!: () => void;
    const fallbackStarted = new Promise<void>((resolve) => {
      signalFallbackStarted = resolve;
    });
    const order: string[] = [];
    const evalsha = jest
      .fn()
      .mockImplementationOnce(async () => {
        order.push('first@slot-a');
        return 'first-a';
      })
      .mockImplementationOnce(async () => {
        order.push('second@slot-b');
        return 'second-b';
      })
      .mockImplementationOnce(async () => {
        order.push('first@slot-b');
        throw new Error('NOSCRIPT No matching script');
      })
      .mockImplementationOnce(async () => {
        order.push('second@slot-b-warm');
        return 'second-b-warm';
      });
    const evalCommand = jest.fn(async () => {
      order.push('eval:first@slot-b');
      signalFallbackStarted();
      await fallbackFinished;
      return 'first-b';
    });
    const clusterClient = {
      isCluster: true,
      evalsha,
      eval: evalCommand,
    } as unknown as RedisScriptClient;

    await expect(
      evalScript(clusterClient, 'first-script', 1, '{slot-a}key', 'first'),
    ).resolves.toBe('first-a');
    await expect(
      evalScript(clusterClient, 'second-script', 1, '{slot-b}key', 'second'),
    ).resolves.toBe('second-b');

    const crossMaster = evalScript(clusterClient, 'first-script', 1, '{slot-b}key', 'first');
    await fallbackStarted;
    const warmTarget = evalScript(clusterClient, 'second-script', 1, '{slot-b}key', 'second');
    await Promise.resolve();
    expect(evalsha).toHaveBeenCalledTimes(3);

    releaseFallback();
    await expect(crossMaster).resolves.toBe('first-b');
    await expect(warmTarget).resolves.toBe('second-b-warm');
    expect(order).toEqual([
      'first@slot-a',
      'second@slot-b',
      'first@slot-b',
      'eval:first@slot-b',
      'second@slot-b-warm',
    ]);
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

describe('confirmed Redis script recovery', () => {
  function createClient() {
    const client = new Redis({ lazyConnect: true });
    const evalsha = jest.spyOn(client, 'evalsha').mockResolvedValue(1);
    const evalCommand = jest.spyOn(client, 'eval').mockResolvedValue(1);
    return { client, evalsha, evalCommand };
  }

  test('falls back directly after a confirmed SHA misses', async () => {
    const { client, evalsha, evalCommand } = createClient();
    await evalScript(client, 'return 1', 1, '{recovery}key');
    evalsha.mockRejectedValueOnce(new Error('NOSCRIPT No matching script'));

    await expect(evalScript(client, 'return 1', 1, '{recovery}key')).resolves.toBe(1);
    expect(evalsha).toHaveBeenCalledTimes(2);
    expect(evalCommand).toHaveBeenCalledTimes(1);
    await expect(evalScript(client, 'return 1', 1, '{recovery}key')).resolves.toBe(1);
    expect(evalsha).toHaveBeenCalledTimes(3);
    expect(evalCommand).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])(
    'keeps queued calls in FIFO order after a stale load (failed: %s)',
    async (failLoad) => {
      const { client, evalsha, evalCommand } = createClient();
      await evalScript(client, 'batch', 1, '{recovery}chunks');
      await evalScript(client, 'direct', 1, '{recovery}job');
      let rejectMiss!: (error: Error) => void;
      evalsha.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectMiss = reject;
          }),
      );
      const order: string[] = [];
      evalCommand.mockImplementationOnce(async () => {
        order.push('batch');
        if (failLoad) {
          throw new Error('load failed');
        }
        return 1;
      });
      evalsha.mockImplementation(async (...args) => {
        order.push(String(args[3]));
        return 1;
      });

      const first = evalScript(client, 'batch', 1, '{recovery}chunks', 'first');
      const firstResult = first.catch((error: Error) => error);
      const second = evalScript(client, 'direct', 1, '{recovery}job', 'second');
      const third = evalScript(client, 'direct', 1, '{recovery}job', 'third');
      expect(evalsha).toHaveBeenCalledTimes(3);
      rejectMiss(new Error('NOSCRIPT No matching script'));
      expect(await firstResult).toEqual(failLoad ? new Error('load failed') : 1);
      await expect(second).resolves.toBe(1);
      await expect(third).resolves.toBe(1);
      expect(order).toEqual(['batch', 'second', 'third']);
    },
  );

  test('does not let an eval-only caller overtake the capability fallback', async () => {
    const { client, evalsha, evalCommand } = createClient();
    let release!: () => void;
    let started!: () => void;
    const fallbackStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fallbackFinished = new Promise<void>((resolve) => {
      release = resolve;
    });
    evalsha.mockRejectedValueOnce(new Error('NOPERM no permissions for EVALSHA'));
    const order: string[] = [];
    evalCommand
      .mockImplementationOnce(async () => {
        started();
        await fallbackFinished;
        order.push('first');
        return 1;
      })
      .mockImplementationOnce(async () => {
        order.push('second');
        return 2;
      });
    const first = evalScript(client, 'first', 1, '{recovery}key');
    await fallbackStarted;
    const second = evalScript(client, 'second', 1, '{recovery}key');
    expect(evalCommand).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(['first', 'second']);
    expect(evalsha).toHaveBeenCalledTimes(1);
  });
});
