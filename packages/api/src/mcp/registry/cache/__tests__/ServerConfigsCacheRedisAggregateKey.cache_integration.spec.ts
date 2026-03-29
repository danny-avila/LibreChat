import { expect } from '@playwright/test';
import type { ParsedServerConfig } from '~/mcp/types';

describe('ServerConfigsCacheRedisAggregateKey Integration Tests', () => {
  let ServerConfigsCacheRedisAggregateKey: typeof import('../ServerConfigsCacheRedisAggregateKey').ServerConfigsCacheRedisAggregateKey;
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];

  let cache: InstanceType<
    typeof import('../ServerConfigsCacheRedisAggregateKey').ServerConfigsCacheRedisAggregateKey
  >;

  const mockConfig1 = {
    type: 'stdio',
    command: 'node',
    args: ['server1.js'],
    env: { TEST: 'value1' },
  } as ParsedServerConfig;

  const mockConfig2 = {
    type: 'stdio',
    command: 'python',
    args: ['server2.py'],
    env: { TEST: 'value2' },
  } as ParsedServerConfig;

  const mockConfig3 = {
    type: 'sse',
    url: 'http://localhost:3000',
    requiresOAuth: true,
  } as ParsedServerConfig;

  beforeAll(async () => {
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.USE_REDIS_CLUSTER = process.env.USE_REDIS_CLUSTER ?? 'true';
    process.env.REDIS_URI =
      process.env.REDIS_URI ??
      'redis://127.0.0.1:7001,redis://127.0.0.1:7002,redis://127.0.0.1:7003';
    process.env.REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'AggregateKey-IntegrationTest';

    const cacheModule = await import('../ServerConfigsCacheRedisAggregateKey');
    const redisClients = await import('~/cache/redisClients');

    ServerConfigsCacheRedisAggregateKey = cacheModule.ServerConfigsCacheRedisAggregateKey;
    keyvRedisClient = redisClients.keyvRedisClient;

    if (!keyvRedisClient) throw new Error('Redis client is not initialized');
    await redisClients.keyvRedisClientReady;
  });

  beforeEach(() => {
    cache = new ServerConfigsCacheRedisAggregateKey('agg-test', false);
  });

  afterEach(async () => {
    await cache.reset();
  });

  afterAll(async () => {
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
  });

  describe('add and get operations', () => {
    it('should add and retrieve a server config', async () => {
      await cache.add('server1', mockConfig1);
      const result = await cache.get('server1');
      expect(result).toMatchObject(mockConfig1);
    });

    it('should return undefined for non-existent server', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should throw error when adding duplicate server', async () => {
      await cache.add('server1', mockConfig1);
      await expect(cache.add('server1', mockConfig2)).rejects.toThrow(
        'Server "server1" already exists in cache. Use update() to modify existing configs.',
      );
    });

    it('should handle multiple server configs', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      await cache.add('server3', mockConfig3);

      expect(await cache.get('server1')).toMatchObject(mockConfig1);
      expect(await cache.get('server2')).toMatchObject(mockConfig2);
      expect(await cache.get('server3')).toMatchObject(mockConfig3);
    });
  });

  describe('getAll operation', () => {
    it('should return empty object when no servers exist', async () => {
      const result = await cache.getAll();
      expect(result).toMatchObject({});
    });

    it('should return all server configs', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      await cache.add('server3', mockConfig3);

      const result = await cache.getAll();
      expect(result).toMatchObject({
        server1: mockConfig1,
        server2: mockConfig2,
        server3: mockConfig3,
      });
    });

    it('should reflect additions in getAll', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      let result = await cache.getAll();
      expect(Object.keys(result).length).toBe(2);

      await cache.add('server3', mockConfig3);
      result = await cache.getAll();
      expect(Object.keys(result).length).toBe(3);
      expect(result.server3).toMatchObject(mockConfig3);
    });
  });

  describe('update operation', () => {
    it('should update an existing server config', async () => {
      await cache.add('server1', mockConfig1);
      expect(await cache.get('server1')).toMatchObject(mockConfig1);

      await cache.update('server1', mockConfig2);
      const result = await cache.get('server1');
      expect(result).toMatchObject(mockConfig2);
    });

    it('should throw error when updating non-existent server', async () => {
      await expect(cache.update('non-existent', mockConfig1)).rejects.toThrow(
        'Server "non-existent" does not exist in cache. Use add() to create new configs.',
      );
    });

    it('should reflect updates in getAll', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      await cache.update('server1', mockConfig3);
      const result = await cache.getAll();
      expect(result.server1).toMatchObject(mockConfig3);
      expect(result.server2).toMatchObject(mockConfig2);
    });
  });

  describe('remove operation', () => {
    it('should remove an existing server config', async () => {
      await cache.add('server1', mockConfig1);
      expect(await cache.get('server1')).toMatchObject(mockConfig1);

      await cache.remove('server1');
      expect(await cache.get('server1')).toBeUndefined();
    });

    it('should throw error when removing non-existent server', async () => {
      await expect(cache.remove('non-existent')).rejects.toThrow(
        'Failed to remove server "non-existent" in cache.',
      );
    });

    it('should remove server from getAll results', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      let result = await cache.getAll();
      expect(Object.keys(result).length).toBe(2);

      await cache.remove('server1');
      result = await cache.getAll();
      expect(Object.keys(result).length).toBe(1);
      expect(result.server1).toBeUndefined();
      expect(result.server2).toMatchObject(mockConfig2);
    });

    it('should allow re-adding a removed server', async () => {
      await cache.add('server1', mockConfig1);
      await cache.remove('server1');
      await cache.add('server1', mockConfig3);

      const result = await cache.get('server1');
      expect(result).toMatchObject(mockConfig3);
    });
  });

  describe('concurrent write safety', () => {
    it('should handle concurrent add calls without data loss', async () => {
      const configCount = 20;
      const promises = Array.from({ length: configCount }, (_, i) =>
        cache.add(`server-${i}`, {
          type: 'stdio',
          command: `cmd-${i}`,
          args: [`arg-${i}`],
        } as ParsedServerConfig),
      );

      const results = await Promise.allSettled(promises);
      const failures = results.filter((r) => r.status === 'rejected');
      expect(failures).toHaveLength(0);

      const result = await cache.getAll();
      expect(Object.keys(result).length).toBe(configCount);
      for (let i = 0; i < configCount; i++) {
        expect(result[`server-${i}`]).toBeDefined();
        const config = result[`server-${i}`] as { command?: string };
        expect(config.command).toBe(`cmd-${i}`);
      }
    });

    it('should handle concurrent getAll calls', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      await cache.add('server3', mockConfig3);

      const concurrency = 50;
      const promises = Array.from({ length: concurrency }, () => cache.getAll());
      const results = await Promise.all(promises);

      for (const result of results) {
        expect(Object.keys(result).length).toBe(3);
        expect(result.server1).toMatchObject(mockConfig1);
        expect(result.server2).toMatchObject(mockConfig2);
        expect(result.server3).toMatchObject(mockConfig3);
      }
    });
  });

  describe('reset operation', () => {
    it('should clear all configs', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      expect(Object.keys(await cache.getAll()).length).toBe(2);

      await cache.reset();

      const result = await cache.getAll();
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('local snapshot behavior', () => {
    it('should collapse repeated getAll calls into a single Redis GET within TTL', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);

      // Prime the snapshot
      await cache.getAll();

      // Spy on the underlying Keyv cache to count Redis calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheGetSpy = jest.spyOn((cache as any).cache, 'get');

      await cache.getAll();
      await cache.getAll();
      await cache.getAll();

      // Snapshot should be served; Redis should NOT have been called
      expect(cacheGetSpy.mock.calls).toHaveLength(0);
      cacheGetSpy.mockRestore();
    });

    it('should invalidate snapshot after add', async () => {
      await cache.add('server1', mockConfig1);
      const before = await cache.getAll();
      expect(Object.keys(before).length).toBe(1);

      await cache.add('server2', mockConfig2);
      const after = await cache.getAll();
      expect(Object.keys(after).length).toBe(2);
    });

    it('should invalidate snapshot after update and preserve other entries', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      expect((await cache.getAll()).server1).toMatchObject(mockConfig1);

      await cache.update('server1', mockConfig3);
      const after = await cache.getAll();
      expect(after.server1).toMatchObject(mockConfig3);
      expect(after.server2).toMatchObject(mockConfig2);
    });

    it('should invalidate snapshot after remove', async () => {
      await cache.add('server1', mockConfig1);
      await cache.add('server2', mockConfig2);
      expect(Object.keys(await cache.getAll()).length).toBe(2);

      await cache.remove('server1');
      const after = await cache.getAll();
      expect(Object.keys(after).length).toBe(1);
      expect(after.server1).toBeUndefined();
      expect(after.server2).toMatchObject(mockConfig2);
    });

    it('should invalidate snapshot after reset', async () => {
      await cache.add('server1', mockConfig1);
      expect(Object.keys(await cache.getAll()).length).toBe(1);

      await cache.reset();
      expect(Object.keys(await cache.getAll()).length).toBe(0);
    });

    it('should not retroactively modify previously returned snapshot references', async () => {
      await cache.add('server1', mockConfig1);

      // Prime the snapshot
      const snapshot = await cache.getAll();
      expect(Object.keys(snapshot).length).toBe(1);

      // Add a second server — the original snapshot reference should be unmodified
      await cache.add('server2', mockConfig2);
      expect(Object.keys(snapshot).length).toBe(1);
      expect(snapshot.server2).toBeUndefined();
    });

    it('should hit Redis again after snapshot TTL expires', async () => {
      await cache.add('server1', mockConfig1);
      await cache.getAll(); // prime snapshot

      // Force-expire the snapshot without sleeping
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any).localSnapshotExpiry = Date.now() - 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheGetSpy = jest.spyOn((cache as any).cache, 'get');
      const result = await cache.getAll();
      expect(cacheGetSpy.mock.calls).toHaveLength(1);
      expect(Object.keys(result).length).toBe(1);
      cacheGetSpy.mockRestore();
    });
  });
});
