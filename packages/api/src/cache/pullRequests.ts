import { CacheKeys } from 'librechat-data-provider';
import type { PullRequestLookupStore } from '~/pulls/types';
import type { cacheConfig } from './cacheConfig';

/** The commands the store sends; the single-node and the cluster client both provide them. */
type StoreCommands = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
};

export type PullRequestStoreClient = {
  withCommandOptions(options: { timeout: number }): StoreCommands;
};

/** The deployment's cache settings the store follows: whether Redis is on, and its key prefix. */
export type PullRequestStoreConfig = Pick<
  typeof cacheConfig,
  'USE_REDIS' | 'FORCED_IN_MEMORY_CACHE_NAMESPACES' | 'REDIS_KEY_PREFIX' | 'GLOBAL_PREFIX_SEPARATOR'
>;

/**
 * The store pull request lookups share between replicas, or `undefined` when there is nothing to
 * share it through: without Redis, or with the namespace forced in memory, each replica's own
 * cache already is the whole cache.
 *
 * Every command carries the caller's timeout as its deadline. A command still unsent when it
 * passes, such as one held in the offline queue while Redis is disconnected, is taken out of the
 * queue and rejected, so a Redis outage does not pile up commands to replay on reconnect.
 */
export function createPullRequestLookupStore({
  client,
  config,
}: {
  client: PullRequestStoreClient | null;
  config: PullRequestStoreConfig;
}): PullRequestLookupStore | undefined {
  if (
    client == null ||
    !config.USE_REDIS ||
    config.FORCED_IN_MEMORY_CACHE_NAMESPACES?.includes(CacheKeys.PULL_REQUESTS)
  ) {
    return undefined;
  }
  const prefix = config.REDIS_KEY_PREFIX
    ? `${config.REDIS_KEY_PREFIX}${config.GLOBAL_PREFIX_SEPARATOR}${CacheKeys.PULL_REQUESTS}:`
    : `${CacheKeys.PULL_REQUESTS}:`;
  return {
    get: async (key, timeoutMs) => {
      const raw = await client.withCommandOptions({ timeout: timeoutMs }).get(prefix + key);
      return raw == null ? undefined : JSON.parse(raw);
    },
    set: async (key, value, ttlMs, timeoutMs) => {
      await client
        .withCommandOptions({ timeout: timeoutMs })
        .set(prefix + key, JSON.stringify(value), { PX: Math.max(1, Math.ceil(ttlMs)) });
    },
  };
}
