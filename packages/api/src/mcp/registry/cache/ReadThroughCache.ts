import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { ReadThroughTransforms } from './ReadThroughAllCache';
import { standardCache } from '~/cache';

/**
 * Redis-capable read-through cache for per-server config entries, the
 * single-entry counterpart to {@link ReadThroughAllCache}.
 *
 * Invalidation is by targeted deletes, so no generation tag is needed; the
 * store comes from {@link standardCache} (Redis when configured, process memory
 * otherwise), values may be kept ciphertext via {@link ReadThroughTransforms},
 * and a ttl of zero or less disables the cache entirely because entries encode
 * ACL decisions that must not outlive a revocation without a TTL bound.
 *
 * Store failures never reject: a Redis outage degrades reads to a miss and
 * writes to a skip so the shared store stays an optimization, not a
 * dependency, on the request path.
 */
export class ReadThroughCache<T> {
  private readonly cache: Keyv;
  private readonly ttl: number;
  private readonly transforms?: ReadThroughTransforms<T>;

  constructor(namespace: string, ttl: number, transforms?: ReadThroughTransforms<T>) {
    this.cache = standardCache(namespace, ttl);
    this.ttl = ttl;
    this.transforms = transforms;
  }

  private get enabled(): boolean {
    return this.ttl > 0;
  }

  /** Whether the store holds an entry for `key`, including one that decodes to
   *  an absent value; lets callers negative-cache lookups like Keyv did. */
  async has(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    try {
      return (await this.cache.get(key)) !== undefined;
    } catch (error) {
      logger.warn('[ReadThroughCache] Store read failed; treating as a miss:', error);
      return false;
    }
  }

  async get(key: string): Promise<T | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    let raw: unknown;
    try {
      raw = await this.cache.get(key);
    } catch (error) {
      logger.warn('[ReadThroughCache] Store read failed; treating as a miss:', error);
      return undefined;
    }
    if (raw === undefined) {
      return undefined;
    }
    if (!this.transforms?.decode) {
      return raw as T;
    }
    try {
      return await this.transforms.decode(raw as string);
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to decode cached entry; treating as a miss:', error);
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const stored = this.transforms?.encode ? await this.transforms.encode(value) : value;
      await this.cache.set(key, stored);
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to write cache entry:', error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await this.cache.delete(key);
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to delete cache entry:', error);
    }
  }

  /** Lifecycle resets only; not a hot-path invalidation. */
  async clear(): Promise<void> {
    try {
      await this.cache.clear();
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to clear cache:', error);
    }
  }
}
