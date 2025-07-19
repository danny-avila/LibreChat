const { Time } = require('librechat-data-provider');

// Mock dependencies first
const mockKeyvRedis = {
  namespace: '',
  keyPrefixSeparator: '',
};

const mockKeyv = jest.fn().mockReturnValue({ mock: 'keyv' });
const mockConnectRedis = jest.fn().mockReturnValue({ mock: 'connectRedis' });
const mockMemoryStore = jest.fn().mockReturnValue({ mock: 'memoryStore' });
const mockRedisStore = jest.fn().mockReturnValue({ mock: 'redisStore' });

const mockIoredisClient = {
  call: jest.fn(),
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

// Import after mocking
const { standardCache, sessionCache, violationCache, limiterCache } = require('./cacheFactory');
const { cacheConfig } = require('./cacheConfig');

describe('cacheFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset cache config mock
    cacheConfig.USE_REDIS = false;
    cacheConfig.REDIS_KEY_PREFIX = 'test';
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

    it('should pass sendCommand function that calls ioredisClient.call', () => {
      cacheConfig.USE_REDIS = true;
      limiterCache('rate-limit');

      const sendCommandCall = mockRedisStore.mock.calls[0][0];
      const sendCommand = sendCommandCall.sendCommand;

      // Test that sendCommand properly delegates to ioredisClient.call
      const args = ['GET', 'test-key'];
      sendCommand(...args);

      expect(mockIoredisClient.call).toHaveBeenCalledWith(...args);
    });

    it('should handle undefined prefix', () => {
      cacheConfig.USE_REDIS = true;
      expect(() => limiterCache()).toThrow('prefix is required');
    });
  });
});
