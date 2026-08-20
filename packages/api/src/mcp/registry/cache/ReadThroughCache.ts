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

  /** Single decoded read: `hit` distinguishes a stored value (which may
   *  legitimately be absent) from a miss, so callers can negative-cache. An
   *  undecodable entry (e.g. after a credentials-key rotation) self-heals: it
   *  is deleted and reported as a miss so the caller refetches. */
  async getEntry(key: string): Promise<{ hit: boolean; value: T | undefined }> {
    if (!this.enabled) {
      return { hit: false, value: undefined };
    }
    let raw: unknown;
    try {
      raw = await this.cache.get(key);
    } catch (error) {
      logger.warn('[ReadThroughCache] Store read failed; treating as a miss:', error);
      return { hit: false, value: undefined };
    }
    if (raw === undefined) {
      return { hit: false, value: undefined };
    }
    if (!this.transforms?.decode) {
      return { hit: true, value: raw as T };
    }
    try {
      return { hit: true, value: await this.transforms.decode(raw as string) };
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to decode cached entry; deleting and missing:', error);
      await this.delete(key);
      return { hit: false, value: undefined };
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
