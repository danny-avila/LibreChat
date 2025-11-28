import { ServerConfigsCacheFactory } from '../ServerConfigsCacheFactory';
import { ServerConfigsCacheInMemory } from '../ServerConfigsCacheInMemory';
import { ServerConfigsCacheRedis } from '../ServerConfigsCacheRedis';
import { cacheConfig } from '~/cache';

// Mock the cache implementations
jest.mock('../ServerConfigsCacheInMemory');
jest.mock('../ServerConfigsCacheRedis');

// Mock the cache config module
jest.mock('~/cache', () => ({
  cacheConfig: {
    USE_REDIS: false,
  },
}));

describe('ServerConfigsCacheFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should return ServerConfigsCacheRedis when USE_REDIS is true', () => {
      // Arrange
      cacheConfig.USE_REDIS = true;

      // Act
      const cache = ServerConfigsCacheFactory.create('App', true);

      // Assert
      expect(cache).toBeInstanceOf(ServerConfigsCacheRedis);
      expect(ServerConfigsCacheRedis).toHaveBeenCalledWith('App', true);
    });

    it('should return ServerConfigsCacheInMemory when USE_REDIS is false', () => {
      // Arrange
      cacheConfig.USE_REDIS = false;

      // Act
      const cache = ServerConfigsCacheFactory.create('App', false);

      // Assert
      expect(cache).toBeInstanceOf(ServerConfigsCacheInMemory);
      expect(ServerConfigsCacheInMemory).toHaveBeenCalled();
    });

    it('should pass correct parameters to ServerConfigsCacheRedis', () => {
      // Arrange
      cacheConfig.USE_REDIS = true;

      // Act
      ServerConfigsCacheFactory.create('CustomNamespace', true);

      // Assert
      expect(ServerConfigsCacheRedis).toHaveBeenCalledWith('CustomNamespace', true);
    });

    it('should create ServerConfigsCacheInMemory without parameters when USE_REDIS is false', () => {
      // Arrange
      cacheConfig.USE_REDIS = false;

      // Act
      ServerConfigsCacheFactory.create('App', false);

      // Assert
      // In-memory cache doesn't use namespace/leaderOnly parameters
      expect(ServerConfigsCacheInMemory).toHaveBeenCalledWith();
    });
  });
});
