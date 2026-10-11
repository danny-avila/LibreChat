import { CacheKeys } from 'librechat-data-provider';
import type { PullRequestLookupStore } from '~/pulls/types';
import { standardCache } from './cacheFactory';
import { cacheConfig } from './cacheConfig';

/**
 * The store pull request lookups share between replicas, or `undefined` when there is nothing to
 * share it through: without Redis, or with the namespace forced in memory, each replica's own
 * cache already is the whole cache.
 */
export function createPullRequestLookupStore(): PullRequestLookupStore | undefined {
  if (
    !cacheConfig.USE_REDIS ||
    cacheConfig.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.PULL_REQUESTS)
  ) {
    return undefined;
  }
  /** Rejects instead of resolving a failed call as a miss, so the lookup can log it. */
  const cache = standardCache(CacheKeys.PULL_REQUESTS, undefined, undefined, {
    throwOnErrors: true,
  });
  return {
    get: (key) => cache.get(key),
    set: async (key, value, ttlMs) => {
      await cache.set(key, value, ttlMs);
    },
  };
}
