import { CacheKeys } from 'librechat-data-provider';
import { createPullRequestLookupStore } from './pullRequests';
import { standardCache } from './cacheFactory';
import { cacheConfig } from './cacheConfig';

jest.mock('./cacheConfig', () => ({
  cacheConfig: { USE_REDIS: true, FORCED_IN_MEMORY_CACHE_NAMESPACES: [] as string[] },
}));
jest.mock('./cacheFactory', () => ({ standardCache: jest.fn() }));

const config = cacheConfig as { USE_REDIS: boolean; FORCED_IN_MEMORY_CACHE_NAMESPACES: string[] };

describe('createPullRequestLookupStore', () => {
  beforeEach(() => {
    config.USE_REDIS = true;
    config.FORCED_IN_MEMORY_CACHE_NAMESPACES = [];
    jest.mocked(standardCache).mockReset();
  });

  it('is absent without Redis, so nothing is shared', () => {
    config.USE_REDIS = false;
    expect(createPullRequestLookupStore()).toBeUndefined();
    expect(standardCache).not.toHaveBeenCalled();
  });

  it('is absent when the namespace is forced in memory', () => {
    config.FORCED_IN_MEMORY_CACHE_NAMESPACES = [CacheKeys.PULL_REQUESTS];
    expect(createPullRequestLookupStore()).toBeUndefined();
  });

  it('reads and writes the Redis cache with the given lifetime, and rejects its failures', async () => {
    const cache = {
      get: jest.fn().mockResolvedValue({ until: 1 }),
      set: jest.fn().mockResolvedValue(true),
    };
    jest
      .mocked(standardCache)
      .mockReturnValue(cache as unknown as ReturnType<typeof standardCache>);
    const store = createPullRequestLookupStore();
    expect(standardCache).toHaveBeenCalledWith(CacheKeys.PULL_REQUESTS, undefined, undefined, {
      throwOnErrors: true,
    });
    await expect(store?.get('k')).resolves.toEqual({ until: 1 });
    await expect(store?.set('k', { until: 2 }, 5_000)).resolves.toBeUndefined();
    expect(cache.set).toHaveBeenCalledWith('k', { until: 2 }, 5_000);
    cache.get.mockRejectedValueOnce(new Error('down'));
    await expect(store?.get('k')).rejects.toThrow('down');
  });
});
