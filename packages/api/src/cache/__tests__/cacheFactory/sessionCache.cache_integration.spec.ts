import type { SessionData, Store, Cookie } from 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: { id: string; name: string };
    userId?: string;
  }
}

type StoreWithPrefix = Store & { prefix?: string };

const makeCookie = (maxAge: number): Cookie =>
  ({ originalMaxAge: maxAge, maxAge }) as Cookie;

describe('sessionCache', () => {
  let originalEnv: NodeJS.ProcessEnv;

  const asyncStore = (store: StoreWithPrefix) => ({
    set: (id: string, data: SessionData) =>
      new Promise<void>((resolve) => store.set(id, data, () => resolve())),
    get: (id: string) =>
      new Promise<SessionData | null | undefined>((resolve) =>
        store.get(id, (_, data) => resolve(data)),
      ),
    destroy: (id: string) => new Promise<void>((resolve) => store.destroy(id, () => resolve())),
    touch: (id: string, data: SessionData) =>
      new Promise<void>((resolve) => {
        if (store.touch) {
          store.touch(id, data, () => resolve());
        } else {
          resolve();
        }
      }),
  });

  const makeSessionData = (extra: Partial<SessionData> = {}): SessionData => ({
    cookie: makeCookie(3600000),
    ...extra,
  });

  beforeEach(() => {
    originalEnv = { ...process.env };

    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'Cache-Integration-Test';
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';
    process.env.USE_REDIS = process.env.USE_REDIS || 'true';
    process.env.USE_REDIS_CLUSTER = process.env.USE_REDIS_CLUSTER || 'false';
    process.env.REDIS_URI = process.env.REDIS_URI || 'redis://127.0.0.1:6379';

    jest.resetModules();
  });

  afterEach(async () => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('should return ConnectRedis store when USE_REDIS is true', async () => {
    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const store = cacheFactory.sessionCache('test-sessions', 3600) as StoreWithPrefix;

    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    expect(store).toBeDefined();
    expect(store.constructor.name).toBe('RedisStore');
    expect(store.prefix).toBe('test-sessions:');

    const sessionId = 'sess:123456';
    const sessionData = makeSessionData({ user: { id: 'user123', name: 'Test User' } });

    const ops = asyncStore(store);

    await ops.set(sessionId, sessionData);

    const retrieved = await ops.get(sessionId);
    expect(retrieved).toBeDefined();

    await ops.touch(sessionId, sessionData);

    await ops.destroy(sessionId);

    const afterDelete = await ops.get(sessionId);
    expect(afterDelete).toBeNull();
  });

  test('should return MemoryStore when USE_REDIS is false', async () => {
    process.env.USE_REDIS = 'false';

    const cacheFactory = await import('../../cacheFactory');
    const store = cacheFactory.sessionCache('test-sessions', 3600) as StoreWithPrefix;

    expect(store).toBeDefined();
    expect(store.constructor.name).toBe('MemoryStore');

    const sessionId = 'mem:789012';
    const sessionData = makeSessionData({ user: { id: 'user456', name: 'Memory User' } });

    const ops = asyncStore(store);

    await ops.set(sessionId, sessionData);

    const retrieved = await ops.get(sessionId);
    expect(retrieved).toBeDefined();

    await ops.destroy(sessionId);

    const afterDelete = await ops.get(sessionId);
    expect(afterDelete).toBeUndefined();
  });

  test('should handle namespace with and without trailing colon', async () => {
    const cacheFactory = await import('../../cacheFactory');

    const store1 = cacheFactory.sessionCache('namespace1') as StoreWithPrefix;
    const store2 = cacheFactory.sessionCache('namespace2:') as StoreWithPrefix;

    expect(store1.prefix).toBe('namespace1:');
    expect(store2.prefix).toBe('namespace2:');
  });

  test('should register error handler for Redis connection', async () => {
    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;

    const onSpy = jest.spyOn(ioredisClient!, 'on');

    cacheFactory.sessionCache('error-test');

    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));

    onSpy.mockRestore();
  });

  test('should handle session expiration with TTL', async () => {
    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    const ttl = 1;
    const store = cacheFactory.sessionCache('ttl-sessions', ttl) as StoreWithPrefix;

    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    const sessionId = 'ttl:12345';
    const sessionData = makeSessionData({ userId: 'ttl-user' });
    const ops = asyncStore(store);

    await ops.set(sessionId, sessionData);

    const immediate = await ops.get(sessionId);
    expect(immediate).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, (ttl + 0.5) * 1000));

    const expired = await ops.get(sessionId);
    expect(expired).toBeNull();
  });
});
