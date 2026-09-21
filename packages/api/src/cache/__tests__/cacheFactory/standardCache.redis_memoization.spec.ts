import { CacheKeys, Time } from 'librechat-data-provider';

const mockKeyvRedisInstance = {
  namespace: '',
  keyPrefixSeparator: '',
};

const mockKeyvRedisConstructor = jest.fn().mockImplementation(() => mockKeyvRedisInstance);

jest.mock('@keyv/redis', () => ({
  default: mockKeyvRedisConstructor,
}));

const mockRedisClient = {
  on: jest.fn(),
  emit: jest.fn(),
};

jest.mock('../../redisClients', () => ({
  handleKeyvRedisError: jest.fn(),
  keyvRedisClient: mockRedisClient,
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

describe('standardCache - Redis memoization', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadFactory() {
    jest.doMock('../../cacheConfig', () => ({
      cacheConfig: {
        FORCED_IN_MEMORY_CACHE_NAMESPACES: [],
        REDIS_KEY_PREFIX: 'test_prefix',
        GLOBAL_PREFIX_SEPARATOR: '>>',
      },
    }));
    return import('../../cacheFactory');
  }

  it('returns the same Redis Keyv instance for repeated calls with the same namespace', async () => {
    const { standardCache } = await loadFactory();
    const a = standardCache('test-redis-ns');
    const b = standardCache('test-redis-ns');
    expect(a).toBe(b);
    expect(mockKeyvRedisConstructor).toHaveBeenCalledTimes(1);
  });

  it('returns different instances for different namespaces in Redis mode', async () => {
    const { standardCache } = await loadFactory();
    const a = standardCache('redis-ns-one');
    const b = standardCache('redis-ns-two');
    expect(a).not.toBe(b);
    expect(mockKeyvRedisConstructor).toHaveBeenCalledTimes(2);
  });

  it('first caller TTL wins for a given Redis namespace', async () => {
    const { standardCache } = await loadFactory();
    const first = standardCache('redis-ttl-ns', 500);
    const second = standardCache('redis-ttl-ns', 99999);
    expect(first).toBe(second);

    type KeyvWithOpts = typeof first & { opts: { ttl?: number } };
    expect((first as KeyvWithOpts).opts.ttl).toBe(500);
  });

  it('falls back to in-memory memoization if namespace is in FORCED_IN_MEMORY_CACHE_NAMESPACES', async () => {
    jest.doMock('../../cacheConfig', () => ({
      cacheConfig: {
        FORCED_IN_MEMORY_CACHE_NAMESPACES: ['forced-mem-ns'],
        REDIS_KEY_PREFIX: '',
        GLOBAL_PREFIX_SEPARATOR: '>>',
      },
    }));
    const { standardCache } = await import('../../cacheFactory');
    const a = standardCache('forced-mem-ns');
    const b = standardCache('forced-mem-ns');
    expect(a).toBe(b);
    expect(mockKeyvRedisConstructor).not.toHaveBeenCalled();
  });
});
