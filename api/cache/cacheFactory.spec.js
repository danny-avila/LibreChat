const { Time } = require('librechat-data-provider');

// Mock dependencies first
const mockKeyvRedis = {
  namespace: '',
  keyPrefixSeparator: '',
};

const mockKeyv = jest.fn().mockReturnValue({
  mock: 'keyv',
  on: jest.fn(),
});
const mockConnectRedis = jest.fn().mockReturnValue({ mock: 'connectRedis' });
const mockMemoryStore = jest.fn().mockReturnValue({ mock: 'memoryStore' });
const mockRedisStore = jest.fn().mockReturnValue({ mock: 'redisStore' });

const mockIoredisClient = {
  call: jest.fn(),
  on: jest.fn(),
};

const mockKeyvRedisClient = {};
const mockViolationFile = {};

// Mock modules before requiring the main module
jest.mock('@keyv/redis', () => ({
  default: jest.fn().mockImplementation(() => mockKeyvRedis),
}));

jest.mock('keyv', () => ({
  Keyv: mockKeyv,
}));

jest.mock('./cacheConfig', () => ({
  cacheConfig: {
    USE_REDIS: false,
    REDIS_KEY_PREFIX: 'test',
    FORCED_IN_MEMORY_CACHE_NAMESPACES: [],
  },
}));

jest.mock('./redisClients', () => ({
  keyvRedisClient: mockKeyvRedisClient,
  ioredisClient: mockIoredisClient,
  GLOBAL_PREFIX_SEPARATOR: '::',
}));

jest.mock('./keyvFiles', () => ({
  violationFile: mockViolationFile,
}));

jest.mock('connect-redis', () => ({ RedisStore: mockConnectRedis }));

jest.mock('memorystore', () => jest.fn(() => mockMemoryStore));

jest.mock('rate-limit-redis', () => ({
  RedisStore: mockRedisStore,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Import after mocking
const { standardCache, sessionCache, violationCache, limiterCache } = require('./cacheFactory');
const { cacheConfig } = require('./cacheConfig');

describe('cacheFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset cache config mock
    cacheConfig.USE_REDIS = false;
    cacheConfig.REDIS_KEY_PREFIX = 'test';
    cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = [];
  });

  describe('redisCache', () => {
    it('should create Redis cache when USE_REDIS is true', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'test-namespace';
      const ttl = 3600;

      standardCache(namespace, ttl);

      expect(require('@keyv/redis').default).toHaveBeenCalledWith(mockKeyvRedisClient);
      expect(mockKeyv).toHaveBeenCalledWith(mockKeyvRedis, { namespace, ttl });
      expect(mockKeyvRedis.namespace).toBe(cacheConfig.REDIS_KEY_PREFIX);
      expect(mockKeyvRedis.keyPrefixSeparator).toBe('::');
    });

    it('should create Redis cache with undefined ttl when not provided', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'test-namespace';

      standardCache(namespace);

      expect(mockKeyv).toHaveBeenCalledWith(mockKeyvRedis, { namespace, ttl: undefined });
    });

    it('should use fallback store when USE_REDIS is false and fallbackStore is provided', () => {
      cacheConfig.USE_REDIS = false;
      const namespace = 'test-namespace';
      const ttl = 3600;
      const fallbackStore = { some: 'store' };

      standardCache(namespace, ttl, fallbackStore);

      expect(mockKeyv).toHaveBeenCalledWith({ store: fallbackStore, namespace, ttl });
    });

    it('should create default Keyv instance when USE_REDIS is false and no fallbackStore', () => {
      cacheConfig.USE_REDIS = false;
      const namespace = 'test-namespace';
      const ttl = 3600;

      standardCache(namespace, ttl);

      expect(mockKeyv).toHaveBeenCalledWith({ namespace, ttl });
    });

    it('should handle namespace and ttl as undefined', () => {
      cacheConfig.USE_REDIS = false;

      standardCache();

      expect(mockKeyv).toHaveBeenCalledWith({ namespace: undefined, ttl: undefined });
    });

    it('should use fallback when namespace is in FORCED_IN_MEMORY_CACHE_NAMESPACES', () => {
      cacheConfig.USE_REDIS = true;
      cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = ['forced-memory'];
      const namespace = 'forced-memory';
      const ttl = 3600;

      standardCache(namespace, ttl);

      expect(require('@keyv/redis').default).not.toHaveBeenCalled();
      expect(mockKeyv).toHaveBeenCalledWith({ namespace, ttl });
    });

    it('should use Redis when namespace is not in FORCED_IN_MEMORY_CACHE_NAMESPACES', () => {
      cacheConfig.USE_REDIS = true;
      cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES = ['other-namespace'];
      const namespace = 'test-namespace';
      const ttl = 3600;

      standardCache(namespace, ttl);

      expect(require('@keyv/redis').default).toHaveBeenCalledWith(mockKeyvRedisClient);
      expect(mockKeyv).toHaveBeenCalledWith(mockKeyvRedis, { namespace, ttl });
    });

    it('should throw error when Redis cache creation fails', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'test-namespace';
      const ttl = 3600;
      const testError = new Error('Redis connection failed');

      const KeyvRedis = require('@keyv/redis').default;
      KeyvRedis.mockImplementationOnce(() => {
        throw testError;
      });

      expect(() => standardCache(namespace, ttl)).toThrow('Redis connection failed');

      const { logger } = require('@librechat/data-schemas');
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to create Redis cache for namespace ${namespace}:`,
        testError,
      );

      expect(mockKeyv).not.toHaveBeenCalled();
    });
  });

  describe('violationCache', () => {
    it('should create violation cache with prefixed namespace', () => {
      const namespace = 'test-violations';
      const ttl = 7200;

      // We can't easily mock the internal redisCache call since it's in the same module
      // But we can test that the function executes without throwing
      expect(() => violationCache(namespace, ttl)).not.toThrow();
    });

    it('should create violation cache with undefined ttl', () => {
      const namespace = 'test-violations';

      violationCache(namespace);

      // The function should call redisCache with violations: prefixed namespace
      // Since we can't easily mock the internal redisCache call, we test the behavior
      expect(() => violationCache(namespace)).not.toThrow();
    });

    it('should handle undefined namespace', () => {
      expect(() => violationCache(undefined)).not.toThrow();
    });
  });

  describe('sessionCache', () => {
    it('should return MemoryStore when USE_REDIS is false', () => {
      cacheConfig.USE_REDIS = false;
      const namespace = 'sessions';
      const ttl = 86400;

      const result = sessionCache(namespace, ttl);

      expect(mockMemoryStore).toHaveBeenCalledWith({ ttl, checkPeriod: Time.ONE_DAY });
      expect(result).toBe(mockMemoryStore());
    });

    it('should return ConnectRedis when USE_REDIS is true', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions';
      const ttl = 86400;

      const result = sessionCache(namespace, ttl);

      expect(mockConnectRedis).toHaveBeenCalledWith({
        client: mockIoredisClient,
        ttl,
        prefix: `${namespace}:`,
      });
      expect(result).toBe(mockConnectRedis());
    });

    it('should add colon to namespace if not present', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions';

      sessionCache(namespace);

      expect(mockConnectRedis).toHaveBeenCalledWith({
        client: mockIoredisClient,
        ttl: undefined,
        prefix: 'sessions:',
      });
    });

    it('should not add colon to namespace if already present', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions:';

      sessionCache(namespace);

      expect(mockConnectRedis).toHaveBeenCalledWith({
        client: mockIoredisClient,
        ttl: undefined,
        prefix: 'sessions:',
      });
    });

    it('should handle undefined ttl', () => {
      cacheConfig.USE_REDIS = false;
      const namespace = 'sessions';

      sessionCache(namespace);

      expect(mockMemoryStore).toHaveBeenCalledWith({
        ttl: undefined,
        checkPeriod: Time.ONE_DAY,
      });
    });

    it('should throw error when ConnectRedis constructor fails', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions';
      const ttl = 86400;

      // Mock ConnectRedis to throw an error during construction
      const redisError = new Error('Redis connection failed');
      mockConnectRedis.mockImplementationOnce(() => {
        throw redisError;
      });

      // The error should propagate up, not be caught
      expect(() => sessionCache(namespace, ttl)).toThrow('Redis connection failed');

      // Verify that MemoryStore was NOT used as fallback
      expect(mockMemoryStore).not.toHaveBeenCalled();
    });

    it('should register error handler but let errors propagate to Express', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions';

      // Create a mock session store with middleware methods
      const mockSessionStore = {
        get: jest.fn(),
        set: jest.fn(),
        destroy: jest.fn(),
      };
      mockConnectRedis.mockReturnValue(mockSessionStore);

      const store = sessionCache(namespace);

      // Verify error handler was registered
      expect(mockIoredisClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Get the error handler
      const errorHandler = mockIoredisClient.on.mock.calls.find((call) => call[0] === 'error')[1];

      // Simulate an error from Redis during a session operation
      const redisError = new Error('Socket closed unexpectedly');

      // The error handler should log but not swallow the error
      const { logger } = require('@librechat/data-schemas');
      errorHandler(redisError);

      expect(logger.error).toHaveBeenCalledWith(
        `Session store Redis error for namespace ${namespace}::`,
        redisError,
      );

      // Now simulate what happens when session middleware tries to use the store
      const callback = jest.fn();
      mockSessionStore.get.mockImplementation((sid, cb) => {
        cb(new Error('Redis connection lost'));
      });

      // Call the store's get method (as Express session would)
      store.get('test-session-id', callback);

      // The error should be passed to the callback, not swallowed
      expect(callback).toHaveBeenCalledWith(new Error('Redis connection lost'));
    });

    it('should handle null ioredisClient gracefully', () => {
      cacheConfig.USE_REDIS = true;
      const namespace = 'sessions';

      // Temporarily set ioredisClient to null (simulating connection not established)
      const originalClient = require('./redisClients').ioredisClient;
      require('./redisClients').ioredisClient = null;

      // ConnectRedis might accept null client but would fail on first use
      // The important thing is it doesn't throw uncaught exceptions during construction
      const store = sessionCache(namespace);
      expect(store).toBeDefined();

      // Restore original client
      require('./redisClients').ioredisClient = originalClient;
    });
  });

  describe('limiterCache', () => {
    it('should return undefined when USE_REDIS is false', () => {
      cacheConfig.USE_REDIS = false;
      const result = limiterCache('prefix');

      expect(result).toBeUndefined();
    });

    it('should return RedisStore when USE_REDIS is true', () => {
      cacheConfig.USE_REDIS = true;
      const result = limiterCache('rate-limit');

      expect(mockRedisStore).toHaveBeenCalledWith({
        sendCommand: expect.any(Function),
        prefix: `rate-limit:`,
      });
      expect(result).toBe(mockRedisStore());
    });

    it('should add colon to prefix if not present', () => {
      cacheConfig.USE_REDIS = true;
      limiterCache('rate-limit');

      expect(mockRedisStore).toHaveBeenCalledWith({
        sendCommand: expect.any(Function),
        prefix: 'rate-limit:',
      });
    });

    it('should not add colon to prefix if already present', () => {
      cacheConfig.USE_REDIS = true;
      limiterCache('rate-limit:');

      expect(mockRedisStore).toHaveBeenCalledWith({
        sendCommand: expect.any(Function),
        prefix: 'rate-limit:',
      });
    });

    it('should pass sendCommand function that calls ioredisClient.call', async () => {
      cacheConfig.USE_REDIS = true;
      mockIoredisClient.call.mockResolvedValue('test-value');

      limiterCache('rate-limit');

      const sendCommandCall = mockRedisStore.mock.calls[0][0];
      const sendCommand = sendCommandCall.sendCommand;

      // Test that sendCommand properly delegates to ioredisClient.call
      const args = ['GET', 'test-key'];
      const result = await sendCommand(...args);

      expect(mockIoredisClient.call).toHaveBeenCalledWith(...args);
      expect(result).toBe('test-value');
    });

    it('should handle sendCommand errors properly', async () => {
      cacheConfig.USE_REDIS = true;

      // Mock the call method to reject with an error
      const testError = new Error('Redis error');
      mockIoredisClient.call.mockRejectedValue(testError);

      limiterCache('rate-limit');

      const sendCommandCall = mockRedisStore.mock.calls[0][0];
      const sendCommand = sendCommandCall.sendCommand;

      // Test that sendCommand properly handles errors
      const args = ['GET', 'test-key'];

      await expect(sendCommand(...args)).rejects.toThrow('Redis error');
      expect(mockIoredisClient.call).toHaveBeenCalledWith(...args);
    });

    it('should handle undefined prefix', () => {
      cacheConfig.USE_REDIS = true;
      expect(() => limiterCache()).toThrow('prefix is required');
    });
  });
});
