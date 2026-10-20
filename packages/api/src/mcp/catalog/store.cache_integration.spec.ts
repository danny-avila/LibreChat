import IoRedis from 'ioredis';
import { randomUUID } from 'crypto';
import { CacheKeys } from 'librechat-data-provider';
import type { RedisClientsModule } from '~/cache/__tests__/redisClients.helper';
import { closeRedisClients } from '~/cache/__tests__/redisClients.helper';

/**
 * Runs the MCP catalog store as a Redis ACL user restricted to `REDIS_KEY_PREFIX`,
 * the setup a managed Redis (e.g. ElastiCache) uses to share one cluster across
 * deployments. Every key the store touches must carry the prefix or Redis rejects
 * the command with NOPERM.
 */
describe('MCP catalog store under a prefix-restricted ACL user', () => {
  const testPrefix = `Catalog-ACL-Test-${randomUUID().slice(0, 8)}`;
  const aclUser = `catalog-acl-${randomUUID().slice(0, 8)}`;
  const aclPassword = randomUUID();
  let admin: IoRedis;
  let originalEnv: NodeJS.ProcessEnv;
  let redisClients: RedisClientsModule | undefined;

  beforeAll(async () => {
    admin = new IoRedis('redis://127.0.0.1:6379');
    await admin.call(
      'ACL',
      'SETUSER',
      aclUser,
      'on',
      `>${aclPassword}`,
      `~${testPrefix}*`,
      '+@all',
    );
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = testPrefix;
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = `redis://${aclUser}:${aclPassword}@127.0.0.1:6379`;
    jest.resetModules();
  });

  afterEach(async () => {
    if (redisClients) {
      await closeRedisClients(redisClients);
      redisClients = undefined;
    }
    const keys = await admin.keys(`${testPrefix}*`);
    if (keys.length > 0) {
      await admin.del(...keys);
    }
    process.env = originalEnv;
  });

  afterAll(async () => {
    await admin.call('ACL', 'DELUSER', aclUser);
    admin.disconnect();
  });

  const createStore = async () => {
    const cache = await import('~/cache');
    redisClients = await import('~/cache/redisClients');
    const { createMCPCatalogStore } = await import('./store');
    return createMCPCatalogStore({
      cacheConfig: cache.cacheConfig,
      ioredisClient: cache.ioredisClient,
      keyvRedisClient: cache.keyvRedisClient ? { eval: cache.evalKeyvRedisScript } : null,
      waitForRedis: cache.waitForKeyvRedisClient,
      getCache: () => cache.standardCache(CacheKeys.TOOL_CACHE),
    });
  };

  test('writes and reads the global tool cache', async () => {
    const store = await createStore();
    const tools = { search: { type: 'function', function: { name: 'search' } } };

    await expect(store.setCachedTools(tools)).resolves.toBe(true);
    await expect(store.getCachedTools()).resolves.toEqual(tools);
  });

  test('creates a per-server publication generation', async () => {
    const store = await createStore();

    const generation = await store.getMCPToolsCacheGeneration({
      userId: 'user-1',
      serverName: 'server-1',
    });

    expect(typeof generation).toBe('string');
    expect(generation).not.toHaveLength(0);
  });
});
