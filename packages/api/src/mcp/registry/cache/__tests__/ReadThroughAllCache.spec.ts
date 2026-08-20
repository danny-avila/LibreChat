import { randomUUID } from 'crypto';

type CacheCtor = typeof import('../ReadThroughAllCache').ReadThroughAllCache;

describe('ReadThroughAllCache (in-memory backing)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  const load = async (): Promise<CacheCtor> =>
    (await import('../ReadThroughAllCache')).ReadThroughAllCache;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.USE_REDIS = 'false';
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('stores and returns values per key', async () => {
    const Cache = await load();
    const cache = new Cache<Record<string, number>>(`rtac-${randomUUID()}`, 60_000);
    await cache.set('user-1', { a: 1 });

    await expect(cache.get('user-1')).resolves.toEqual({ a: 1 });
    await expect(cache.get('user-2')).resolves.toBeUndefined();
  });

  test('shares entries across instances of the same namespace', async () => {
    const Cache = await load();
    const namespace = `rtac-${randomUUID()}`;
    const writer = new Cache<string>(namespace, 60_000);
    const reader = new Cache<string>(namespace, 60_000);

    await writer.set('user-1', 'value-a');

    await expect(reader.get('user-1')).resolves.toBe('value-a');
  });

  test('invalidateAll orphans every entry without a keyspace scan', async () => {
    const Cache = await load();
    const namespace = `rtac-${randomUUID()}`;
    const writer = new Cache<string>(namespace, 60_000);
    /** A reader with no memoized entries: its next read must observe the new
     *  generation through the shared store, proving eviction comes from the
     *  generation tag rather than a local clear. */
    const reader = new Cache<string>(namespace, 60_000);

    await writer.set('user-1', 'value-a');
    await writer.set('user-2', 'value-b');
    await writer.invalidateAll();

    await expect(reader.get('user-1')).resolves.toBeUndefined();
    await expect(reader.get('user-2')).resolves.toBeUndefined();
  });

  test('entries expire after the ttl', async () => {
    const Cache = await load();
    const cache = new Cache<string>(`rtac-${randomUUID()}`, 40);
    await cache.set('user-1', 'ephemeral');
    await expect(cache.get('user-1')).resolves.toBe('ephemeral');

    await new Promise((resolve) => setTimeout(resolve, 80));

    await expect(cache.get('user-1')).resolves.toBeUndefined();
  });

  test('a value written after invalidateAll is served under the new generation', async () => {
    const Cache = await load();
    const cache = new Cache<string>(`rtac-${randomUUID()}`, 60_000);
    await cache.set('user-1', 'before');
    await cache.invalidateAll();
    await cache.set('user-1', 'after');

    await expect(cache.get('user-1')).resolves.toBe('after');
  });

  test('ttl of 0 disables the memo but keeps store semantics', async () => {
    const Cache = await load();
    const cache = new Cache<string>(`rtac-${randomUUID()}`, 0);
    await cache.set('user-1', 'persistent');

    await expect(cache.get('user-1')).resolves.toBe('persistent');
    await cache.invalidateAll();
    await expect(cache.get('user-1')).resolves.toBeUndefined();
  });
});
