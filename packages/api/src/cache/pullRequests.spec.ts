import { createServer } from 'node:net';
import { CacheKeys } from 'librechat-data-provider';
import { createClient, TimeoutError } from '@redis/client';
import type { PullRequestStoreClient } from './pullRequests';
import { createPullRequestLookupStore } from './pullRequests';
import { cacheConfig } from './cacheConfig';

jest.mock('./cacheConfig', () => ({
  cacheConfig: {
    USE_REDIS: true,
    FORCED_IN_MEMORY_CACHE_NAMESPACES: [] as string[],
    REDIS_KEY_PREFIX: '',
    GLOBAL_PREFIX_SEPARATOR: '::',
  },
}));
jest.mock('./redisClients', () => ({ keyvRedisClient: null }));

const config = cacheConfig as {
  USE_REDIS: boolean;
  FORCED_IN_MEMORY_CACHE_NAMESPACES: string[];
  REDIS_KEY_PREFIX: string;
};

function fakeClient() {
  const values = new Map<string, string>();
  const commands = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => values.set(key, value)),
  };
  const client = { withCommandOptions: jest.fn(() => commands) };
  return { client, commands, values };
}

/** A port nothing listens on, so a client there stays disconnected. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address == null || typeof address === 'string') throw new Error('no port');
  return address.port;
}

describe('createPullRequestLookupStore', () => {
  beforeEach(() => {
    config.USE_REDIS = true;
    config.FORCED_IN_MEMORY_CACHE_NAMESPACES = [];
    config.REDIS_KEY_PREFIX = '';
  });

  it('is absent without Redis, so nothing is shared', () => {
    config.USE_REDIS = false;
    expect(createPullRequestLookupStore(fakeClient().client)).toBeUndefined();
  });

  it('is absent without a Redis client', () => {
    expect(createPullRequestLookupStore(null)).toBeUndefined();
  });

  it('is absent when the namespace is forced in memory', () => {
    config.FORCED_IN_MEMORY_CACHE_NAMESPACES = [CacheKeys.PULL_REQUESTS];
    expect(createPullRequestLookupStore(fakeClient().client)).toBeUndefined();
  });

  it('round-trips JSON under the namespace with the lifetime and the deadline', async () => {
    config.REDIS_KEY_PREFIX = 'tenant';
    const { client, commands } = fakeClient();
    const store = createPullRequestLookupStore(client);
    await store?.set('k', { until: 2 }, 5_000.4, 40);
    const key = `tenant::${CacheKeys.PULL_REQUESTS}:k`;
    expect(commands.set).toHaveBeenCalledWith(key, '{"until":2}', { PX: 5_001 });
    expect(client.withCommandOptions).toHaveBeenLastCalledWith({ timeout: 40 });
    await expect(store?.get('k', 30)).resolves.toEqual({ until: 2 });
    expect(client.withCommandOptions).toHaveBeenLastCalledWith({ timeout: 30 });
    await expect(store?.get('missing', 30)).resolves.toBeUndefined();
  });

  it('rejects a failed command', async () => {
    const { client, commands } = fakeClient();
    commands.get.mockRejectedValueOnce(new Error('down'));
    await expect(createPullRequestLookupStore(client)?.get('k', 30)).rejects.toThrow('down');
  });

  it('drops a command queued while Redis is unreachable at its deadline', async () => {
    const redis = createClient({
      socket: { host: '127.0.0.1', port: await closedPort(), reconnectStrategy: () => 60_000 },
    });
    redis.on('error', () => undefined);
    /** Never settles: the client keeps waiting to reconnect until it is destroyed. */
    void redis.connect().catch(() => undefined);
    try {
      const store = createPullRequestLookupStore(redis as unknown as PullRequestStoreClient);
      const started = Date.now();
      await expect(store?.get('k', 50)).rejects.toBeInstanceOf(TimeoutError);
      await expect(store?.set('k', { until: 1 }, 1_000, 50)).rejects.toBeInstanceOf(TimeoutError);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      redis.destroy();
    }
  });
});
