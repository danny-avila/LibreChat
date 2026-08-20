import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { ReadThroughTransforms } from './ReadThroughAllCache';
import { standardCache } from '~/cache';

/** Invalidation state a per-server miss observed, so a fill that finishes after
 *  a targeted delete (or clear) can be fenced instead of repopulating the
 *  entry with the pre-mutation value. No expiry: a fence is removed when its
 *  fill settles or overwritten by the next miss for the key. */
interface PendingFill {
  globalVersion: number;
  keyVersion: number;
}

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
 * Fills are fenced by the invalidation versions observed at their miss: when a
 * mutation deletes the key (or resets the namespace) while the caller is still
 * fetching from YAML/Mongo, the completed value is dropped rather than written
 * back over the invalidation for every replica to see.
 *
 * Store failures never reject: a Redis outage degrades reads to a miss and
 * writes to a skip so the shared store stays an optimization, not a
 * dependency, on the request path.
 */
export class ReadThroughCache<T> {
  private readonly cache: Keyv;
  private readonly ttl: number;
  private readonly transforms?: ReadThroughTransforms<T>;
  /** Bumped by {@link delete} per key and by {@link clear} for all keys. */
  private readonly keyVersions = new Map<string, number>();
  private readonly pendingFills = new Map<string, PendingFill>();
  private globalVersion = 0;

  constructor(namespace: string, ttl: number, transforms?: ReadThroughTransforms<T>) {
    this.cache = standardCache(namespace, ttl);
    this.ttl = ttl;
    this.transforms = transforms;
  }

  private get enabled(): boolean {
    return this.ttl > 0;
  }

  private recordPendingFill(key: string): void {
    this.pendingFills.set(key, {
      globalVersion: this.globalVersion,
      keyVersion: this.keyVersions.get(key) ?? 0,
    });
  }

  /** True when an invalidation landed since the recorded miss. */
  private fillIsStale(key: string): boolean {
    const fill = this.pendingFills.get(key);
    if (fill == null) {
      return false;
    }
    return (
      fill.globalVersion !== this.globalVersion ||
      fill.keyVersion !== (this.keyVersions.get(key) ?? 0)
    );
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
      this.recordPendingFill(key);
      return { hit: false, value: undefined };
    }
    if (raw === undefined) {
      this.recordPendingFill(key);
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
      this.recordPendingFill(key);
      return { hit: false, value: undefined };
    }
  }

  async set(key: string, value: T): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      if (this.fillIsStale(key)) {
        /** Fenced: an invalidation completed while this value was being
         *  computed; writing it would undo the mutation for every replica. */
        return;
      }
      try {
        const stored = this.transforms?.encode ? await this.transforms.encode(value) : value;
        await this.cache.set(key, stored);
      } catch (error) {
        logger.warn('[ReadThroughCache] Failed to write cache entry:', error);
      }
    } finally {
      this.pendingFills.delete(key);
    }
  }

  async delete(key: string): Promise<void> {
    this.keyVersions.set(key, (this.keyVersions.get(key) ?? 0) + 1);
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
    this.globalVersion += 1;
    try {
      await this.cache.clear();
    } catch (error) {
      logger.warn('[ReadThroughCache] Failed to clear cache:', error);
    }
  }
}
