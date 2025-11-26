// Mock dependencies BEFORE imports to avoid hoisting issues
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('~/cache', () => ({
  standardCache: jest.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (...args: any[]) => mockGet(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: (...args: any[]) => mockSet(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: (...args: any[]) => mockDelete(...args),
  })),
  keyvRedisClient: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: (...args: any[]) => mockRedisSet(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    del: (...args: any[]) => mockRedisDel(...args),
  },
}));

jest.mock('~/cache/cacheConfig', () => ({
  cacheConfig: {
    REDIS_KEY_PREFIX: '',
    GLOBAL_PREFIX_SEPARATOR: '::',
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/cluster', () => ({
  isLeader: jest.fn().mockResolvedValue(true),
}));

import { privateServersLoadStatusCache as loadStatusCache } from '../PrivateServersLoadStatusCache';
import { logger } from '@librechat/data-schemas';

describe('PrivateServersLoadStatusCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isLoaded()', () => {
    it('should return true when user servers are loaded', async () => {
      mockGet.mockResolvedValue(true);

      const result = await loadStatusCache.isLoaded('user1');

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOADED::user1');
    });

    it('should return false when user servers are not loaded', async () => {
      mockGet.mockResolvedValue(undefined);

      const result = await loadStatusCache.isLoaded('user1');

      expect(result).toBe(false);
      expect(mockGet).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOADED::user1');
    });

    it('should return false when loaded flag is explicitly false', async () => {
      mockGet.mockResolvedValue(false);

      const result = await loadStatusCache.isLoaded('user1');

      expect(result).toBe(false);
    });
  });

  describe('setLoaded()', () => {
    it('should set loaded flag with default TTL', async () => {
      mockSet.mockResolvedValue(true);

      await loadStatusCache.setLoaded('user1');

      expect(mockSet).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOADED::user1', true, 3600_000);
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Marked user user1 as loaded (TTL: 3600000ms)',
      );
    });

    it('should set loaded flag with custom TTL', async () => {
      mockSet.mockResolvedValue(true);

      await loadStatusCache.setLoaded('user1', 7200000);

      expect(mockSet).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOADED::user1', true, 7200_000);
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Marked user user1 as loaded (TTL: 7200000ms)',
      );
    });

    it('should throw error if cache.set fails', async () => {
      mockSet.mockResolvedValue(false);

      await expect(loadStatusCache.setLoaded('user1')).rejects.toThrow();
    });
  });

  describe('acquireLoadLock()', () => {
    it('should acquire lock successfully when no lock exists (using Redis SET NX)', async () => {
      mockRedisSet.mockResolvedValue('OK'); // Redis SET NX returns 'OK' on success

      const result = await loadStatusCache.acquireLoadLock('user1');

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'MCP::ServersRegistry::PrivateServersLoadStatus:USER_PRIVATE_SERVERS_LOAD_LOCK::user1',
        expect.any(String), // Timestamp as string
        { NX: true, PX: 30000 },
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Acquired load lock for user user1 (TTL: 30000ms)',
      );
    });

    it('should fail to acquire lock when lock already exists (Redis returns null)', async () => {
      mockRedisSet.mockResolvedValue(null); // Redis SET NX returns null if key exists

      const result = await loadStatusCache.acquireLoadLock('user1');

      expect(result).toBe(false);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'MCP::ServersRegistry::PrivateServersLoadStatus:USER_PRIVATE_SERVERS_LOAD_LOCK::user1',
        expect.any(String),
        { NX: true, PX: 30000 },
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Load lock already held for user user1',
      );
    });

    it('should acquire lock with custom TTL', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const result = await loadStatusCache.acquireLoadLock('user1', 60_000);

      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'MCP::ServersRegistry::PrivateServersLoadStatus:USER_PRIVATE_SERVERS_LOAD_LOCK::user1',
        expect.any(String),
        { NX: true, PX: 60_000 },
      );
    });

    it('should return false if Redis SET fails with error', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis error'));

      const result = await loadStatusCache.acquireLoadLock('user1');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Error acquiring lock for user user1:',
        expect.any(Error),
      );
    });
  });

  describe('releaseLoadLock()', () => {
    it('should release lock successfully', async () => {
      await loadStatusCache.releaseLoadLock('user1');

      expect(mockDelete).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOAD_LOCK::user1');
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Released load lock for user user1',
      );
    });

    it('should not throw error if lock does not exist', async () => {
      mockDelete.mockResolvedValue(undefined);

      await expect(loadStatusCache.releaseLoadLock('user1')).resolves.not.toThrow();
    });
  });

  describe('waitForLoad()', () => {
    let mockDateNow: jest.SpyInstance;
    let currentTime: number;

    beforeEach(() => {
      jest.useFakeTimers();
      currentTime = 1000000; // Starting time
      mockDateNow = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    });

    afterEach(() => {
      jest.useRealTimers();
      mockDateNow.mockRestore();
    });

    it('should return true when loading completes within timeout', async () => {
      let checkCount = 0;
      mockGet.mockImplementation(async () => {
        checkCount++;
        return checkCount >= 3; // Return true on third check
      });

      const waitPromise = loadStatusCache.waitForLoad('user1', 500, 100);

      // Simulate time passing
      for (let i = 0; i < 3; i++) {
        currentTime += 100;
        await jest.advanceTimersByTimeAsync(100);
      }

      const result = await waitPromise;

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] User user1 loading completed by another process',
      );
    });

    it('should return false when timeout is reached', async () => {
      mockGet.mockResolvedValue(false); // Never becomes true

      const waitPromise = loadStatusCache.waitForLoad('user1', 300, 100);

      // Advance time past the timeout
      currentTime += 400;
      await jest.advanceTimersByTimeAsync(400);

      const result = await waitPromise;

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Timeout waiting for user user1 loading (waited 300ms)',
      );
    });

    it('should use default timeout and check interval', async () => {
      mockGet.mockResolvedValue(true);

      const waitPromise = loadStatusCache.waitForLoad('user1');

      currentTime += 100;
      await jest.advanceTimersByTimeAsync(100);

      const result = await waitPromise;

      expect(result).toBe(true);
    });

    it('should poll at specified intervals', async () => {
      let checkCount = 0;
      mockGet.mockImplementation(async () => {
        checkCount++;
        return checkCount >= 4; // Return true on fourth check
      });

      const waitPromise = loadStatusCache.waitForLoad('user1', 1000, 200);

      // Advance time for each poll
      for (let i = 0; i < 4; i++) {
        currentTime += 200;
        await jest.advanceTimersByTimeAsync(200);
      }

      const result = await waitPromise;

      expect(result).toBe(true);
      expect(checkCount).toBe(4);
    });
  });

  describe('clearLoaded()', () => {
    it('should clear loaded status for a user', async () => {
      await loadStatusCache.clearLoaded('user1');

      expect(mockDelete).toHaveBeenCalledWith('USER_PRIVATE_SERVERS_LOADED::user1');
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP][LoadStatusCache] Cleared loaded status for user user1',
      );
    });

    it('should not throw error if loaded status does not exist', async () => {
      mockDelete.mockResolvedValue(undefined);

      await expect(loadStatusCache.clearLoaded('user1')).resolves.not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple users independently', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const lock1 = await loadStatusCache.acquireLoadLock('user1');
      const lock2 = await loadStatusCache.acquireLoadLock('user2');

      expect(lock1).toBe(true);
      expect(lock2).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'MCP::ServersRegistry::PrivateServersLoadStatus:USER_PRIVATE_SERVERS_LOAD_LOCK::user1',
        expect.any(String),
        { NX: true, PX: 30000 },
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'MCP::ServersRegistry::PrivateServersLoadStatus:USER_PRIVATE_SERVERS_LOAD_LOCK::user2',
        expect.any(String),
        { NX: true, PX: 30000 },
      );
    });

    it('should handle concurrent operations on same user', async () => {
      mockRedisSet
        .mockResolvedValueOnce('OK') // First lock attempt succeeds
        .mockResolvedValueOnce(null); // Second lock attempt fails (key exists)

      const [lock1, lock2] = await Promise.all([
        loadStatusCache.acquireLoadLock('user1'),
        loadStatusCache.acquireLoadLock('user1'),
      ]);

      // One should succeed, one should fail (order not guaranteed)
      expect([lock1, lock2].sort()).toEqual([false, true]);
    });
  });
});
