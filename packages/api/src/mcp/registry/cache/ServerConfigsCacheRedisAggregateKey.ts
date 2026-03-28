import type Keyv from 'keyv';
import type { IServerConfigsRepositoryInterface } from '~/mcp/registry/ServerConfigsRepositoryInterface';
import type { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { BaseRegistryCache } from './BaseRegistryCache';
import { cacheConfig, standardCache } from '~/cache';

/**
 * Redis-backed MCP server configs cache that stores all entries under a single aggregate key.
 *
 * Unlike {@link ServerConfigsCacheRedis} which uses SCAN + batch-GET for `getAll()`, this
 * implementation stores the entire config map as a single JSON value in Redis. This makes
 * `getAll()` a single O(1) GET regardless of keyspace size, eliminating the 60s+ stalls
 * caused by SCAN under concurrent load in large deployments (see GitHub #11624, #12408).
 *
 * Trade-offs:
 * - `add/update/remove` use a serialized read-modify-write on the aggregate key via a
 *   promise-based mutex. This prevents concurrent writes from racing within a single
 *   process (e.g., during `Promise.allSettled` initialization of multiple servers).
 * - The entire config map is serialized/deserialized on every operation. With typical MCP
 *   deployments (~5-50 servers), the JSON payload is small (10-50KB).
 * - Cross-instance visibility is preserved: all instances read/write the same Redis key,
 *   so reinspection results propagate automatically after readThroughCache TTL expiry.
 *
 * IMPORTANT: The promise-based writeLock serializes writes within a single Node.js process
 * only. Concurrent writes from separate instances race at the Redis level (last-write-wins).
 * This is acceptable because writes are performed exclusively by the leader during
 * initialization via {@link MCPServersInitializer}. `reinspectServer` is manual and rare.
 * Callers must enforce this single-writer invariant externally.
 */
const AGGREGATE_KEY = '__all__';

export class ServerConfigsCacheRedisAggregateKey
  extends BaseRegistryCache
  implements IServerConfigsRepositoryInterface
{
  protected readonly cache: Keyv;
  private writeLock: Promise<void> = Promise.resolve();

  /**
   * In-memory snapshot of the aggregate key to avoid redundant Redis GETs.
   * `getAll()` is called 20+ times per chat request (once per tool, per server
   * config lookup, per connection check) but the data doesn't change within a
   * request cycle. The snapshot collapses all reads within the TTL window into
   * a single Redis GET. Invalidated on every write (`add`, `update`, `remove`, `reset`).
   *
   * NOTE: In multi-instance deployments, the effective max staleness for cross-instance
   * writes is up to 2×MCP_REGISTRY_CACHE_TTL. This happens when readThroughCacheAll
   * (MCPServersRegistry) is populated from a snapshot that is nearly expired. For the
   * default 5000ms TTL, worst-case cross-instance propagation is ~10s. This is acceptable
   * given the single-writer invariant (leader-only initialization, rare manual reinspection).
   */
  private localSnapshot: Record<string, ParsedServerConfig> | null = null;
  /** Milliseconds since epoch. 0 = epoch = always expired on first check. */
  private localSnapshotExpiry = 0;

  private readonly namespace: string;

  constructor(namespace: string, leaderOnly: boolean) {
    super(leaderOnly);
    this.namespace = namespace;
    this.cache = standardCache(`${this.PREFIX}::Servers::${namespace}`);
  }

  private invalidateLocalSnapshot(): void {
    this.localSnapshot = null;
    this.localSnapshotExpiry = 0;
  }

  /**
   * Serializes write operations to prevent concurrent read-modify-write races.
   * Reads (`get`, `getAll`) are not serialized — they can run concurrently.
   * Always invalidates the local snapshot in `finally` to guarantee cleanup
   * even when the write callback throws (e.g., Redis SET failure).
   */
  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previousLock = this.writeLock;
    let resolve!: () => void;
    this.writeLock = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      await previousLock;
      return await fn();
    } finally {
      this.invalidateLocalSnapshot();
      resolve();
    }
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    const ttl = cacheConfig.MCP_REGISTRY_CACHE_TTL;
    if (ttl > 0) {
      const now = Date.now();
      if (this.localSnapshot !== null && now < this.localSnapshotExpiry) {
        return this.localSnapshot;
      }
    }

    const result =
      ((await this.cache.get(AGGREGATE_KEY)) as Record<string, ParsedServerConfig> | undefined) ??
      {};

    if (ttl > 0) {
      this.localSnapshot = result;
      this.localSnapshotExpiry = Date.now() + ttl;
    }
    return result;
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    const all = await this.getAll();
    return all[serverName];
  }

  public async add(serverName: string, config: ParsedServerConfig): Promise<AddServerResult> {
    if (this.leaderOnly) await this.leaderCheck('add MCP servers');
    return this.withWriteLock(async () => {
      // Force fresh Redis read so the read-modify-write uses current data,
      // not a snapshot that may predate this write. Distinct from the finally-block
      // invalidation which cleans up after the write completes or throws.
      this.invalidateLocalSnapshot();
      const all = await this.getAll();
      if (all[serverName]) {
        throw new Error(
          `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
        );
      }
      const storedConfig = { ...config, updatedAt: Date.now() };
      const newAll = { ...all, [serverName]: storedConfig };
      const success = await this.cache.set(AGGREGATE_KEY, newAll);
      this.successCheck(`add ${this.namespace} server "${serverName}"`, success);
      return { serverName, config: storedConfig };
    });
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('update MCP servers');
    return this.withWriteLock(async () => {
      this.invalidateLocalSnapshot(); // Force fresh Redis read (see add() comment)
      const all = await this.getAll();
      if (!all[serverName]) {
        throw new Error(
          `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
        );
      }
      const newAll = { ...all, [serverName]: { ...config, updatedAt: Date.now() } };
      const success = await this.cache.set(AGGREGATE_KEY, newAll);
      this.successCheck(`update ${this.namespace} server "${serverName}"`, success);
    });
  }

  public async upsert(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('upsert MCP servers');
    return this.withWriteLock(async () => {
      this.invalidateLocalSnapshot();
      const all = await this.getAll();
      const newAll = { ...all, [serverName]: { ...config, updatedAt: Date.now() } };
      const success = await this.cache.set(AGGREGATE_KEY, newAll);
      this.successCheck(`upsert ${this.namespace} server "${serverName}"`, success);
    });
  }

  public async remove(serverName: string): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('remove MCP servers');
    return this.withWriteLock(async () => {
      this.invalidateLocalSnapshot(); // Force fresh Redis read (see add() comment)
      const all = await this.getAll();
      if (!all[serverName]) {
        throw new Error(`Failed to remove server "${serverName}" in cache.`);
      }
      const { [serverName]: _, ...newAll } = all;
      const success = await this.cache.set(AGGREGATE_KEY, newAll);
      this.successCheck(`remove ${this.namespace} server "${serverName}"`, success);
    });
  }

  /**
   * Resets the aggregate key directly instead of using SCAN-based `cache.clear()`.
   * Only one key (`__all__`) ever exists in this namespace, so a targeted delete is
   * more efficient and consistent with the PR's goal of eliminating SCAN operations.
   *
   * NOTE: Intentionally not serialized via `withWriteLock`. `reset()` is only called
   * during lifecycle transitions (test teardown, full reinitialization via
   * `MCPServersInitializer`) where no concurrent writes are in flight.
   */
  public override async reset(): Promise<void> {
    if (this.leaderOnly) {
      await this.leaderCheck(`reset ${this.namespace} MCP servers cache`);
    }
    await this.cache.delete(AGGREGATE_KEY);
    this.invalidateLocalSnapshot();
  }
}
