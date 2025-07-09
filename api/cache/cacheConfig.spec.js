const fs = require('fs');

describe('cacheConfig', () => {
  let originalEnv;
  let originalReadFileSync;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalReadFileSync = fs.readFileSync;

    // Clear all related env vars first
    delete process.env.REDIS_URI;
    delete process.env.REDIS_CA;
    delete process.env.REDIS_KEY_PREFIX_VAR;
    delete process.env.REDIS_KEY_PREFIX;
    delete process.env.USE_REDIS;

    // Clear require cache
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.readFileSync = originalReadFileSync;
    jest.resetModules();
  });

  describe('REDIS_KEY_PREFIX validation and resolution', () => {
    test('should throw error when both REDIS_KEY_PREFIX_VAR and REDIS_KEY_PREFIX are set', () => {
      process.env.REDIS_KEY_PREFIX_VAR = 'DEPLOYMENT_ID';
      process.env.REDIS_KEY_PREFIX = 'manual-prefix';

      expect(() => {
        require('./cacheConfig');
      }).toThrow('Only either REDIS_KEY_PREFIX_VAR or REDIS_KEY_PREFIX can be set.');
    });

    test('should resolve REDIS_KEY_PREFIX from variable reference', () => {
      process.env.REDIS_KEY_PREFIX_VAR = 'DEPLOYMENT_ID';
      process.env.DEPLOYMENT_ID = 'test-deployment-123';

      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_KEY_PREFIX).toBe('test-deployment-123');
    });

    test('should use direct REDIS_KEY_PREFIX value', () => {
      process.env.REDIS_KEY_PREFIX = 'direct-prefix';

      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_KEY_PREFIX).toBe('direct-prefix');
    });

    test('should default to empty string when no prefix is configured', () => {
      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_KEY_PREFIX).toBe('');
    });

    test('should handle empty variable reference', () => {
      process.env.REDIS_KEY_PREFIX_VAR = 'EMPTY_VAR';
      process.env.EMPTY_VAR = '';

      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_KEY_PREFIX).toBe('');
    });

    test('should handle undefined variable reference', () => {
      process.env.REDIS_KEY_PREFIX_VAR = 'UNDEFINED_VAR';

      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_KEY_PREFIX).toBe('');
    });
  });

  describe('USE_REDIS and REDIS_URI validation', () => {
    test('should throw error when USE_REDIS is enabled but REDIS_URI is not set', () => {
      process.env.USE_REDIS = 'true';

      expect(() => {
        require('./cacheConfig');
      }).toThrow('USE_REDIS is enabled but REDIS_URI is not set.');
    });

    test('should not throw error when USE_REDIS is enabled and REDIS_URI is set', () => {
      process.env.USE_REDIS = 'true';
      process.env.REDIS_URI = 'redis://localhost:6379';

      expect(() => {
        require('./cacheConfig');
      }).not.toThrow();
    });

    test('should handle empty REDIS_URI when USE_REDIS is enabled', () => {
      process.env.USE_REDIS = 'true';
      process.env.REDIS_URI = '';

      expect(() => {
        require('./cacheConfig');
      }).toThrow('USE_REDIS is enabled but REDIS_URI is not set.');
    });
  });

  describe('REDIS_CA file reading', () => {
    test('should be null when REDIS_CA is not set', () => {
      const { cacheConfig } = require('./cacheConfig');
      expect(cacheConfig.REDIS_CA).toBeNull();
    });
  });
});
