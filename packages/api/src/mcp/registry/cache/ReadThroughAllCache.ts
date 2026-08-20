import { Keyv } from 'keyv';
import { randomUUID } from 'crypto';
import { standardCache } from '~/cache';

/** Namespace-internal key holding the active generation tag. */
const GENERATION_KEY = '__generation__';

interface MemoEntry<T> {
  generation: string;
  value: T;
  expiresAt: number;
}

/**
 * Redis-capable read-through cache for per-user aggregate config maps.
 *
 * The backing store comes from {@link standardCache}, so entries live in Redis
 * when it is configured (shared across instances, see #14016) and in process
 * memory otherwise. Invalidation never scans the keyspace:
 * {@link invalidateAll} swaps the active generation tag for a fresh UUID,
 * orphaning every entry written under a previous generation, and the store TTL
 * reclaims them. This mirrors the aggregate-key lesson from #11624/#12408,
 * where SCAN-based invalidation stalled large deployments.
 *
 * A process-local memo absorbs repeated reads within one TTL window, the same
 * pattern as the local snapshot in `ServerConfigsCacheRedisAggregateKey`, added
 * because the registry resolves all-server configs many times per chat request.
 * Cross-instance worst-case staleness is therefore bounded by the memo TTL,
 * matching the documented 2x MCP_REGISTRY_CACHE_TTL trade-off.
 */
export class ReadThroughAllCache<T> {
  private readonly cache: Keyv;
  private readonly ttl: number;
  private readonly memo = new Map<string, MemoEntry<T>>();

  constructor(namespace: string, ttl: number) {
    this.cache = standardCache(namespace, ttl);
    this.ttl = ttl;
  }

  private entryKey(generation: string, key: string): string {
    return `${generation}::${key}`;
  }

  private async readGeneration(): Promise<string> {
    const generation = await this.cache.get(GENERATION_KEY);
    return typeof generation === 'string' ? generation : '0';
  }

  async get(key: string): Promise<T | undefined> {
    const memoized = this.memo.get(key);
    if (memoized != null && Date.now() < memoized.expiresAt) {
      return memoized.value;
    }
    const generation = await this.readGeneration();
    const value = (await this.cache.get(this.entryKey(generation, key))) as T | undefined;
    if (value !== undefined && this.ttl > 0) {
      this.memo.set(key, { generation, value, expiresAt: Date.now() + this.ttl });
    } else {
      this.memo.delete(key);
    }
    return value;
  }

  async set(key: string, value: T): Promise<void> {
    const generation = await this.readGeneration();
    await this.cache.set(this.entryKey(generation, key), value);
    if (this.ttl > 0) {
      this.memo.set(key, { generation, value, expiresAt: Date.now() + this.ttl });
    }
  }

  /** Orphans every entry written so far without scanning the keyspace. */
  async invalidateAll(): Promise<void> {
    /** A fresh UUID cannot regress: two racing invalidations may overwrite each
     *  other's tag, but neither can resurrect a prior generation's entries. */
    await this.cache.set(GENERATION_KEY, randomUUID());
    this.memo.clear();
  }
}
