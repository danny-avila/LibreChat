import { Keyv } from 'keyv';

jest.mock('@keyv/redis', () => ({
  default: jest.fn(),
}));

jest.mock('../../redisClients', () => ({
  handleKeyvRedisError: jest.fn(),
  keyvRedisClient: null,
  ioredisClient: null,
}));

jest.mock('../../redisUtils', () => ({
  batchDeleteKeys: jest.fn(),
  scanKeys: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('standardCache - Redis-path memoization (issue #16148)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  const sharedClient = { status: 'ready' } as unknown as object;

  // A minimal but *valid* KeyvStoreAdapter stand-in: Keyv 5.x requires
  // get+set+delete+clear, otherwise it throws "Invalid storage adapter".
  const makeStoreMock = () => ({
    get: jest.fn(async () => undefined),
    set: jest.fn(async () => undefined),
    delete: jest.fn(async () => true),
    clear: jest.fn(async () => undefined),
  });

  async function loadFactory() {
    jest.doMock('../../cacheConfig', () => ({
      cacheConfig: {
        FORCED_IN_MEMORY_CACHE_NAMESPACES: [],
        REDIS_KEY_PREFIX: 'Test-Prefix',
        GLOBAL_PREFIX_SEPARATOR: '>>',
      },
    }));
    jest.doMock('../../redisClients', () => ({
      handleKeyvRedisError: jest.fn(),
      keyvRedisClient: sharedClient,
      ioredisClient: null,
    }));
    return import('../../cacheFactory');
  }

  function getKeyvRedisMock(): jest.Mock {
    return (jest.requireMock('@keyv/redis').default ?? null) as unknown as jest.Mock;
  }

  it('returns the same instance for repeated calls with the same namespace', async () => {
    const { standardCache } = await loadFactory();
    const a = standardCache('redis-ns');
    const b = standardCache('redis-ns');
    expect(a).toBe(b);
  });

  it('constructs KeyvRedis exactly once per namespace (no listener leak)', async () => {
    const { standardCache } = await loadFactory();
    const KeyvRedisMock = getKeyvRedisMock();
    KeyvRedisMock.mockImplementation(() => ({}));

    standardCache('leak-ns');
    standardCache('leak-ns');
    standardCache('leak-ns');

    expect(KeyvRedisMock).toHaveBeenCalledTimes(1);
  });

  it('constructs KeyvRedis once per distinct namespace, with the shared client', async () => {
    const { standardCache } = await loadFactory();
    const KeyvRedisMock = getKeyvRedisMock();
    KeyvRedisMock.mockImplementation(() => ({}));

    const a = standardCache('redis-ns-one');
    const b = standardCache('redis-ns-two');

    expect(a).not.toBe(b);
    expect(KeyvRedisMock).toHaveBeenCalledTimes(2);
    expect(KeyvRedisMock).toHaveBeenNthCalledWith(1, sharedClient);
    expect(KeyvRedisMock).toHaveBeenNthCalledWith(2, sharedClient);
  });

  it('reuses the same KeyvRedis store instance for the same namespace', async () => {
    const { standardCache } = await loadFactory();
    getKeyvRedisMock().mockImplementation(makeStoreMock);

    const a = standardCache('store-ns') as Keyv & { opts: { store: object } };
    const b = standardCache('store-ns') as Keyv & { opts: { store: object } };

    expect(b.opts.store).toBe(a.opts.store);
  });

  it('applies the key prefix config to the store', async () => {
    const { standardCache } = await loadFactory();
    // The mock must look like a valid KeyvStoreAdapter (have `.get`), otherwise
    // Keyv's constructor discards it and falls back to an internal Map.
    getKeyvRedisMock().mockImplementation(makeStoreMock);

    const cache = standardCache('prefix-ns') as Keyv & { opts: { store: Record<string, unknown> } };
    standardCache('prefix-ns');

    expect(cache.opts.store['namespace']).toBe('Test-Prefix');
    expect(cache.opts.store['keyPrefixSeparator']).toBe('>>');
  });

  it('first caller TTL wins for a given namespace', async () => {
    const { standardCache } = await loadFactory();
    getKeyvRedisMock().mockImplementation(makeStoreMock);

    const first = standardCache('redis-ttl-ns', 500);
    const second = standardCache('redis-ttl-ns', 99999);
    expect(first).toBe(second);

    type KeyvWithOpts = typeof first & { opts: { ttl?: number } };
    expect((first as KeyvWithOpts).opts.ttl).toBe(500);
  });

  it('forced in-memory namespaces bypass the Redis memoization map', async () => {
    jest.doMock('../../cacheConfig', () => ({
      cacheConfig: {
        FORCED_IN_MEMORY_CACHE_NAMESPACES: ['ROLES'],
        REDIS_KEY_PREFIX: 'Test-Prefix',
        GLOBAL_PREFIX_SEPARATOR: '>>',
      },
    }));
    jest.doMock('../../redisClients', () => ({
      handleKeyvRedisError: jest.fn(),
      keyvRedisClient: sharedClient,
      ioredisClient: null,
    }));
    const { standardCache } = await import('../../cacheFactory');
    const KeyvRedisMock = getKeyvRedisMock();

    const a = standardCache('ROLES', 5000);
    const b = standardCache('ROLES', 9999);

    expect(KeyvRedisMock).not.toHaveBeenCalled();
    expect(a).toBe(b);
  });
});
