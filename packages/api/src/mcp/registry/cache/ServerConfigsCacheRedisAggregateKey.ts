import { logger } from '@librechat/data-schemas';
import type Keyv from 'keyv';
import type { IServerConfigsRepositoryInterface } from '~/mcp/registry/ServerConfigsRepositoryInterface';
import type { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { BaseRegistryCache } from './BaseRegistryCache';
import { standardCache } from '~/cache';

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

  constructor(namespace: string, leaderOnly: boolean) {
    super(leaderOnly);
    this.cache = standardCache(`${this.PREFIX}::Servers::${namespace}`);
  }

  /**
   * Serializes write operations to prevent concurrent read-modify-write races.
   * Reads (`get`, `getAll`) are not serialized — they can run concurrently.
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
      resolve();
    }
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    const startTime = Date.now();
    const result = (await this.cache.get(AGGREGATE_KEY)) as
      | Record<string, ParsedServerConfig>
      | undefined;
    const elapsed = Date.now() - startTime;
    logger.debug(
      `[ServerConfigsCacheRedisAggregateKey] getAll: fetched ${result ? Object.keys(result).length : 0} configs in ${elapsed}ms`,
    );
    return result ?? {};
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    const all = await this.getAll();
    return all[serverName];
  }

  public async add(serverName: string, config: ParsedServerConfig): Promise<AddServerResult> {
    if (this.leaderOnly) await this.leaderCheck('add MCP servers');
    return this.withWriteLock(async () => {
      const all = await this.getAll();
      if (all[serverName]) {
        throw new Error(
          `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
        );
      }
      const storedConfig = { ...config, updatedAt: Date.now() };
      all[serverName] = storedConfig;
      const success = await this.cache.set(AGGREGATE_KEY, all);
      this.successCheck(`add App server "${serverName}"`, success);
      return { serverName, config: storedConfig };
    });
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('update MCP servers');
    return this.withWriteLock(async () => {
      const all = await this.getAll();
      if (!all[serverName]) {
        throw new Error(
          `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
        );
      }
      all[serverName] = { ...config, updatedAt: Date.now() };
      const success = await this.cache.set(AGGREGATE_KEY, all);
      this.successCheck(`update App server "${serverName}"`, success);
    });
  }

  public async remove(serverName: string): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('remove MCP servers');
    return this.withWriteLock(async () => {
      const all = await this.getAll();
      if (!all[serverName]) {
        throw new Error(`Failed to remove server "${serverName}" in cache.`);
      }
      delete all[serverName];
      const success = await this.cache.set(AGGREGATE_KEY, all);
      this.successCheck(`remove App server "${serverName}"`, success);
    });
  }

  /**
   * Resets the aggregate key directly instead of using SCAN-based `cache.clear()`.
   * Only one key (`__all__`) ever exists in this namespace, so a targeted delete is
   * more efficient and consistent with the PR's goal of eliminating SCAN operations.
   */
  public override async reset(): Promise<void> {
    if (this.leaderOnly) {
      await this.leaderCheck('reset App MCP servers cache');
    }
    await this.cache.delete(AGGREGATE_KEY);
  }
}
