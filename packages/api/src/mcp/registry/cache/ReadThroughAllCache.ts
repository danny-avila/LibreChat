import { Keyv } from 'keyv';
import { randomUUID } from 'crypto';
import { logger, scopedCacheKey } from '@librechat/data-schemas';
import { standardCache } from '~/cache';

/** Base key holding the active generation tag; the effective key is
 *  tenant-scoped, so one tenant's mutations cannot orphan another's entries. */
const GENERATION_KEY = '__generation__';

interface MemoEntry<T> {
  value: T;
  expiresAt: number;
}

/** Generation observed when a miss started, used to fence fills that finish
 *  after an invalidation has already completed. */
interface PendingFill {
  generation: string;
  expiresAt: number;
}

/** Store-side value transforms; the shared store only ever sees `encode` output. */
export interface ReadThroughTransforms<T> {
  encode?: (value: T) => Promise<string> | string;
  decode?: (raw: string) => Promise<T> | T;
}

/**
 * Redis-capable read-through cache for per-user aggregate config maps.
 *
 * The backing store comes from {@link standardCache}, so entries live in Redis
 * when it is configured (shared across instances, see #14016) and in process
 * memory otherwise. Hot-path invalidation never scans the keyspace:
 * {@link invalidateAll} swaps the active generation tag for a fresh UUID,
 * orphaning every entry written under a previous generation, and the store TTL
 * reclaims them. This mirrors the aggregate-key lesson from #11624/#12408,
 * where SCAN-based invalidation stalled large deployments. The generation tag
 * is tenant-scoped (entries are too) and lives in its own store created
 * without a TTL so it can never expire before the entries written under it;
 * {@link invalidateAllGlobal} provides the scanning variant for genuinely
 * cross-tenant resets.
 *
 * Values may carry secrets (decrypted MCP credentials), so the caller can
 * inject {@link ReadThroughTransforms} to keep the shared store ciphertext
 * only; the process-local memo keeps working with plaintext, matching the
 * pre-Redis status quo where these values never left the process.
 *
 * A process-local memo absorbs repeated reads within one TTL window, the same
 * pattern as the local snapshot in `ServerConfigsCacheRedisAggregateKey`, added
 * because the registry resolves all-server configs many times per chat request.
 * An opportunistic sweep bounds the memo so one-time users cannot accumulate.
 * Fills are fenced by the generation observed at their miss, so a value
 * computed before an invalidation cannot be written or memoized after it.
 * Cross-instance worst-case staleness is therefore bounded by the memo TTL,
 * matching the documented 2x MCP_REGISTRY_CACHE_TTL trade-off.
 *
 * A ttl of zero or less disables the cache entirely: entries derive from ACL
 * access, and without a TTL there is no bound on how long a revoked user could
 * keep receiving a stale map.
 */
export class ReadThroughAllCache<T> {
  private readonly cache: Keyv;
  private readonly generationCache: Keyv;
  private readonly ttl: number;
  private readonly transforms?: ReadThroughTransforms<T>;
  private readonly memo = new Map<string, MemoEntry<T>>();
  private readonly pendingFills = new Map<string, PendingFill>();
  private lastSweepAt = 0;

  constructor(namespace: string, ttl: number, transforms?: ReadThroughTransforms<T>) {
    this.cache = standardCache(namespace, ttl);
    this.generationCache = standardCache(`${namespace}::generation`);
    this.ttl = ttl;
    this.transforms = transforms;
  }

  private get enabled(): boolean {
    return this.ttl > 0;
  }

  private entryKey(generation: string, key: string): string {
    return `${generation}::${key}`;
  }

  /** Never throws. Returns undefined when the generation cannot be read: that
   *  must surface as a miss, not as generation "0", which is a real first
   *  generation whose unexpired entries could otherwise be revived by a
   *  transient read failure. */
  private async readGeneration(): Promise<string | undefined> {
    let generation: unknown;
    try {
      generation = await this.generationCache.get(scopedCacheKey(GENERATION_KEY));
    } catch (error) {
      logger.warn('[ReadThroughAllCache] Generation read failed:', error);
      return undefined;
    }
    return typeof generation === 'string' ? generation : '0';
  }

  /** At most one pass per TTL window, so expired entries from one-time users
   *  cannot accumulate unboundedly between global invalidations. */
  private sweepMemo(): void {
    const now = Date.now();
    if (now - this.lastSweepAt < this.ttl) {
      return;
    }
    this.lastSweepAt = now;
    for (const [key, entry] of this.memo) {
      if (now >= entry.expiresAt) {
        this.memo.delete(key);
      }
    }
    for (const [key, fill] of this.pendingFills) {
      if (now >= fill.expiresAt) {
        this.pendingFills.delete(key);
      }
    }
  }

  async get(key: string): Promise<T | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    const memoized = this.memo.get(key);
    if (memoized != null) {
      if (Date.now() < memoized.expiresAt) {
        return memoized.value;
      }
      this.memo.delete(key);
    }
    const generation = await this.readGeneration();
    if (generation == null) {
      return undefined;
    }
    let raw: unknown;
    try {
      raw = await this.cache.get(this.entryKey(generation, key));
    } catch (error) {
      logger.warn('[ReadThroughAllCache] Store read failed; treating as a miss:', error);
      return undefined;
    }
    if (raw === undefined) {
      /** Record the miss generation so the eventual fill can be fenced when an
       *  invalidation completes while the caller is still computing. */
      this.pendingFills.set(key, {
        generation,
        expiresAt: Date.now() + this.ttl,
      });
      this.sweepMemo();
      return undefined;
    }
    let value: T;
    if (!this.transforms?.decode) {
      value = raw as T;
    } else {
      try {
        value = await this.transforms.decode(raw as string);
      } catch (error) {
        /** Fail open to a miss: an undecodable entry is stale across a key
         *  rotation, not a reason to break the request. */
        logger.warn(
          '[ReadThroughAllCache] Failed to decode cached entry; treating as a miss:',
          error,
        );
        return undefined;
      }
    }
    /** Re-check after the full read (decode included): an invalidation landing
     *  mid-read must not have its pre-mutation value memoized for a full TTL
     *  window. */
    if ((await this.readGeneration()) !== generation) {
      return undefined;
    }
    return this.memoize(key, value);
  }

  private memoize(key: string, value: T): T {
    this.memo.set(key, { value, expiresAt: Date.now() + this.ttl });
    this.sweepMemo();
    return value;
  }

  async set(key: string, value: T): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const fill = this.pendingFills.get(key);
    try {
      const current = await this.readGeneration();
      if (fill != null && current != null && current !== fill.generation) {
        /** Fenced: this value was computed before an invalidation completed, so
         *  writing it (store or memo) would resurrect the pre-mutation map. */
        return;
      }
      const generation = current ?? fill?.generation;
      if (generation != null) {
        try {
          const stored = this.transforms?.encode ? await this.transforms.encode(value) : value;
          await this.cache.set(this.entryKey(generation, key), stored);
        } catch (error) {
          /** A failed store write degrades to the memo only; the caller's result
           *  is already computed and must still be served. */
          logger.warn('[ReadThroughAllCache] Failed to write cache entry:', error);
        }
        /** Same recheck as get(): skip the memo when an invalidation landed while
         *  this write was in flight, so the next read recomputes. */
        if ((await this.readGeneration()) !== generation) {
          return;
        }
      }
      this.memo.set(key, { value, expiresAt: Date.now() + this.ttl });
      this.sweepMemo();
    } finally {
      if (fill != null) {
        this.pendingFills.delete(key);
      }
    }
  }

  /**
   * Orphans the calling tenant's entries without scanning the keyspace.
   * DB-backed MCP servers and ACL grants are tenant-scoped data, so one
   * tenant's mutation has no business evicting another tenant's entries.
   */
  async invalidateAll(): Promise<void> {
    this.memo.clear();
    if (!this.enabled) {
      return;
    }
    try {
      /** A fresh UUID cannot regress: two racing invalidations may overwrite each
       *  other's tag, but neither can resurrect a prior generation's entries. */
      await this.generationCache.set(scopedCacheKey(GENERATION_KEY), randomUUID());
    } catch (error) {
      logger.warn('[ReadThroughAllCache] Generation write failed:', error);
    }
  }

  /**
   * Clears every entry across tenants by scanning the namespace. Reserved for
   * genuinely global events (operator config changes, lifecycle resets) where
   * the SCAN cost is rare and cross-tenant eviction is the point.
   */
  async invalidateAllGlobal(): Promise<void> {
    this.memo.clear();
    this.pendingFills.clear();
    if (!this.enabled) {
      return;
    }
    try {
      await this.cache.clear();
    } catch (error) {
      logger.warn('[ReadThroughAllCache] Global clear failed:', error);
    }
  }
}
