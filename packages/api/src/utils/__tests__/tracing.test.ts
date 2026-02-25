import { AsyncLocalStorage } from 'node:async_hooks';

const TRACING_ALS_KEY = Symbol.for('ls:tracing_async_local_storage');
const typedGlobal = globalThis as typeof globalThis & Record<symbol, AsyncLocalStorage<unknown>>;

let originalStorage: AsyncLocalStorage<unknown> | undefined;

beforeEach(() => {
  originalStorage = typedGlobal[TRACING_ALS_KEY];
  jest.restoreAllMocks();
});

afterEach(() => {
  if (originalStorage) {
    typedGlobal[TRACING_ALS_KEY] = originalStorage;
  } else {
    delete typedGlobal[TRACING_ALS_KEY];
  }
  delete process.env.LANGCHAIN_TRACING_V2;
});

async function freshImport(): Promise<typeof import('../tracing')> {
  jest.resetModules();
  return import('../tracing');
}

describe('runOutsideTracing', () => {
  it('clears the ALS context to undefined inside fn', async () => {
    const als = new AsyncLocalStorage<string>();
    typedGlobal[TRACING_ALS_KEY] = als as AsyncLocalStorage<unknown>;

    const { runOutsideTracing } = await freshImport();

    let captured: string | undefined = 'NOT_CLEARED';
    als.run('should-not-propagate', () => {
      runOutsideTracing(() => {
        captured = als.getStore();
      });
    });

    expect(captured).toBeUndefined();
  });

  it('returns the value produced by fn (sync)', async () => {
    const als = new AsyncLocalStorage<string>();
    typedGlobal[TRACING_ALS_KEY] = als as AsyncLocalStorage<unknown>;

    const { runOutsideTracing } = await freshImport();

    const result = als.run('ctx', () => runOutsideTracing(() => 42));
    expect(result).toBe(42);
  });

  it('returns the promise produced by fn (async)', async () => {
    const als = new AsyncLocalStorage<string>();
    typedGlobal[TRACING_ALS_KEY] = als as AsyncLocalStorage<unknown>;

    const { runOutsideTracing } = await freshImport();

    const result = await als.run('ctx', () =>
      runOutsideTracing(async () => {
        await Promise.resolve();
        return 'async-value';
      }),
    );
    expect(result).toBe('async-value');
  });

  it('propagates sync errors thrown inside fn', async () => {
    const als = new AsyncLocalStorage<string>();
    typedGlobal[TRACING_ALS_KEY] = als as AsyncLocalStorage<unknown>;

    const { runOutsideTracing } = await freshImport();

    expect(() =>
      runOutsideTracing(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('propagates async rejections from fn', async () => {
    const als = new AsyncLocalStorage<string>();
    typedGlobal[TRACING_ALS_KEY] = als as AsyncLocalStorage<unknown>;

    const { runOutsideTracing } = await freshImport();

    await expect(
      runOutsideTracing(async () => {
        throw new Error('async-boom');
      }),
    ).rejects.toThrow('async-boom');
  });

  it('falls back to fn() when ALS is not on globalThis', async () => {
    delete typedGlobal[TRACING_ALS_KEY];

    const { runOutsideTracing } = await freshImport();

    const result = runOutsideTracing(() => 'fallback');
    expect(result).toBe('fallback');
  });

  it('does not warn when LANGCHAIN_TRACING_V2 is not set', async () => {
    delete typedGlobal[TRACING_ALS_KEY];
    delete process.env.LANGCHAIN_TRACING_V2;

    const warnSpy = jest.fn();
    jest.resetModules();
    jest.doMock('@librechat/data-schemas', () => ({
      logger: { warn: warnSpy },
    }));
    const { runOutsideTracing } = await import('../tracing');

    runOutsideTracing(() => 'ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once when LANGCHAIN_TRACING_V2 is set but ALS is missing', async () => {
    delete typedGlobal[TRACING_ALS_KEY];
    process.env.LANGCHAIN_TRACING_V2 = 'true';

    const warnSpy = jest.fn();
    jest.resetModules();
    jest.doMock('@librechat/data-schemas', () => ({
      logger: { warn: warnSpy },
    }));
    const { runOutsideTracing } = await import('../tracing');

    runOutsideTracing(() => 'first');
    runOutsideTracing(() => 'second');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LANGCHAIN_TRACING_V2 is set but ALS not found'),
    );
  });
});
