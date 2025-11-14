import { PrivateServerConfigsCacheFactory } from '../PrivateServerConfigs/PrivateServerConfigsCacheFactory';
import { PrivateServerConfigsCacheInMemory } from '../PrivateServerConfigs/PrivateServerConfigsCacheInMemory';
import { PrivateServerConfigsCacheRedis } from '../PrivateServerConfigs/PrivateServerConfigsCacheRedis';
import { cacheConfig } from '~/cache';

// Mock the cache implementations
jest.mock('../PrivateServerConfigs/PrivateServerConfigsCacheInMemory');
jest.mock('../PrivateServerConfigs/PrivateServerConfigsCacheRedis');

// Mock the cache config module
jest.mock('~/cache', () => ({
  cacheConfig: {
    USE_REDIS: false,
  },
}));

describe('PrivateServerConfigsCacheFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should return PrivateServerConfigsCacheRedis when USE_REDIS is true', () => {
      // Arrange
      cacheConfig.USE_REDIS = true;

      // Act
      const cache = PrivateServerConfigsCacheFactory.create();

      // Assert
      expect(cache).toBeInstanceOf(PrivateServerConfigsCacheRedis);
      expect(PrivateServerConfigsCacheRedis).toHaveBeenCalled();
    });

    it('should return PrivateServerConfigsCacheInMemory when USE_REDIS is false', () => {
      // Arrange
      cacheConfig.USE_REDIS = false;

      // Act
      const cache = PrivateServerConfigsCacheFactory.create();

      // Assert
      expect(cache).toBeInstanceOf(PrivateServerConfigsCacheInMemory);
      expect(PrivateServerConfigsCacheInMemory).toHaveBeenCalled();
    });

    it('should create PrivateServerConfigsCacheInMemory without parameters when USE_REDIS is false', () => {
      // Arrange
      cacheConfig.USE_REDIS = false;

      // Act
      PrivateServerConfigsCacheFactory.create();

      // Assert
      // Private cache doesn't use any parameters
      expect(PrivateServerConfigsCacheInMemory).toHaveBeenCalledWith();
    });

    it('should create PrivateServerConfigsCacheRedis without parameters when USE_REDIS is true', () => {
      // Arrange
      cacheConfig.USE_REDIS = true;

      // Act
      PrivateServerConfigsCacheFactory.create();

      // Assert
      // Private cache doesn't use any parameters
      expect(PrivateServerConfigsCacheRedis).toHaveBeenCalledWith();
    });
  });
});
