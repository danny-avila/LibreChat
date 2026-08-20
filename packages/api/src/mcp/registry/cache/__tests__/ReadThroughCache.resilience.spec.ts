import { randomUUID } from 'crypto';
import { ReadThroughAllCache } from '../ReadThroughAllCache';
import { ReadThroughCache } from '../ReadThroughCache';

interface MockStore {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
  clear: jest.Mock;
}

/** Stores created by the mocked `standardCache`, keyed by namespace, so tests
 *  can drive the exact boundary failures and interleavings the real Redis
 *  client cannot be asked to produce deterministically. */
const mockStores = new Map<string, MockStore>();

jest.mock('~/cache', () => {
  const actual = jest.requireActual('~/cache');
  return {
    ...actual,
    standardCache: (namespace: string) => {
      const store: MockStore = {
        get: jest.fn(async () => undefined),
        set: jest.fn(async () => true),
        delete: jest.fn(async () => true),
        clear: jest.fn(async () => undefined),
      };
      mockStores.set(namespace, store);
      return store;
    },
  };
});

function storesFor(namespace: string): { entry: MockStore; generation: MockStore } {
  const entry = mockStores.get(namespace);
  const generation = mockStores.get(`${namespace}::generation`);
  if (!entry || !generation) {
    throw new Error(`stores not created for ${namespace}`);
  }
  return { entry, generation };
}

function storeFor(namespace: string): MockStore {
  const store = mockStores.get(namespace);
  if (!store) {
    throw new Error(`store not created for ${namespace}`);
  }
  return store;
}

describe('read-through cache resilience', () => {
  test('entry store failure on get degrades to a miss', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { entry } = storesFor(namespace);
    entry.get.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(cache.get('user-1')).resolves.toBeUndefined();
  });

  test('generation store failure on get degrades to a miss', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { generation } = storesFor(namespace);
    generation.get.mockRejectedValue(new Error('redis unavailable'));

    await expect(cache.get('user-1')).resolves.toBeUndefined();
  });

  test('a generation failure cannot revive generation-zero entries', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { entry, generation } = storesFor(namespace);
    entry.get.mockResolvedValue('stale-from-generation-0');
    generation.get.mockRejectedValue(new Error('transient'));

    /** The unreadable generation must be a miss, not a fallback to "0", or an
     *  unexpired pre-invalidation entry could be served for another TTL. */
    await expect(cache.get('user-1')).resolves.toBeUndefined();
    expect(entry.get).not.toHaveBeenCalled();
  });

  test('store failure on set never rejects and keeps the process-local memo', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { entry, generation } = storesFor(namespace);
    entry.set.mockRejectedValue(new Error('redis unavailable'));
    generation.set.mockRejectedValue(new Error('redis unavailable'));

    await expect(cache.set('user-1', 'computed')).resolves.toBeUndefined();
    /** The memo still serves the caller's own computed value; only the
     *  cross-instance sharing is lost while the store is unavailable. */
    await expect(cache.get('user-1')).resolves.toBe('computed');
  });

  test('generation write failure on invalidateAll never rejects', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { generation } = storesFor(namespace);
    generation.set.mockRejectedValue(new Error('redis unavailable'));

    await expect(cache.invalidateAll()).resolves.toBeUndefined();
  });

  test('an invalidation landing mid-read is not memoized', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { entry, generation } = storesFor(namespace);
    entry.get.mockResolvedValue('pre-mutation-value');
    /** First read sees g1; the recheck after the entry fetch observes the
     *  invalidation that landed in between. */
    generation.get.mockResolvedValueOnce('g1').mockResolvedValue('g2');

    await expect(cache.get('user-1')).resolves.toBeUndefined();

    /** The value was never memoized, so the next read recomputes from the
     *  store under the new generation rather than replaying the stale hit. */
    entry.get.mockClear();
    generation.get.mockResolvedValueOnce('g2').mockResolvedValueOnce('g2');
    await expect(cache.get('user-1')).resolves.toBe('pre-mutation-value');
    expect(entry.get).toHaveBeenCalledWith('g2::user-1');
  });

  test('an invalidation landing mid-set skips the memo', async () => {
    const namespace = `rtac-r-${randomUUID()}`;
    const cache = new ReadThroughAllCache<string>(namespace, 60_000);
    const { generation } = storesFor(namespace);
    generation.get.mockResolvedValueOnce('g1').mockResolvedValue('g2');

    await cache.set('user-1', 'fresh');

    /** Generation flipped while the write was in flight, so the memo must not
     *  serve the just-written value for a full TTL window. */
    await expect(cache.get('user-1')).resolves.toBeUndefined();
  });
});

describe('per-server ReadThroughCache resilience', () => {
  test('ttl of 0 disables the cache entirely', async () => {
    const namespace = `rtc-r-${randomUUID()}`;
    const cache = new ReadThroughCache<string>(namespace, 0);
    const store = storeFor(namespace);

    await cache.set('server::user', 'never-cached');
    await expect(cache.getEntry('server::user')).resolves.toEqual({
      hit: false,
      value: undefined,
    });
    expect(store.set).not.toHaveBeenCalled();
  });

  test('store failures degrade to misses and skipped writes', async () => {
    const namespace = `rtc-r-${randomUUID()}`;
    const cache = new ReadThroughCache<string>(namespace, 60_000);
    const store = storeFor(namespace);
    store.get.mockRejectedValue(new Error('redis unavailable'));
    store.set.mockRejectedValue(new Error('redis unavailable'));
    store.delete.mockRejectedValue(new Error('redis unavailable'));

    await expect(cache.getEntry('server::user')).resolves.toEqual({
      hit: false,
      value: undefined,
    });
    await expect(cache.set('server::user', 'value')).resolves.toBeUndefined();
    await expect(cache.delete('server::user')).resolves.toBeUndefined();
  });

  test('transforms keep the store ciphertext while serving plaintext', async () => {
    const namespace = `rtc-r-${randomUUID()}`;
    const cache = new ReadThroughCache<string>(namespace, 60_000, {
      encode: (value) => Buffer.from(value).toString('base64'),
      decode: (raw) => Buffer.from(raw, 'base64').toString('utf8'),
    });

    await cache.set('server::user', 'secret-value');

    const store = storeFor(namespace);
    const [, stored] = store.set.mock.calls[0];
    expect(String(stored)).not.toContain('secret-value');
    store.get.mockResolvedValueOnce(stored);
    await expect(cache.getEntry('server::user')).resolves.toEqual({
      hit: true,
      value: 'secret-value',
    });
  });

  test('an undecodable entry is deleted and reported as a miss', async () => {
    const namespace = `rtc-r-${randomUUID()}`;
    const cache = new ReadThroughCache<string>(namespace, 60_000, {
      encode: (value) => value,
      decode: () => {
        throw new Error('key rotation');
      },
    });
    const store = storeFor(namespace);
    store.get.mockResolvedValueOnce('stale-ciphertext');

    await expect(cache.getEntry('server::user')).resolves.toEqual({
      hit: false,
      value: undefined,
    });
    expect(store.delete).toHaveBeenCalledWith('server::user');
  });
});
