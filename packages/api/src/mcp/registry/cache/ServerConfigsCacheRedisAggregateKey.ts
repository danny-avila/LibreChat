import type Keyv from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from '~/mcp/registry/ServerConfigsRepositoryInterface';
import type { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { standardCache } from '~/cache';
import { BaseRegistryCache } from './BaseRegistryCache';

/**
 * Redis-backed MCP server configs cache that stores all entries under a single aggregate key.
 *
 * Unlike {@link ServerConfigsCacheRedis} which uses SCAN + batch-GET for `getAll()`, this
 * implementation stores the entire config map as a single JSON value in Redis. This makes
 * `getAll()` a single O(1) GET regardless of keyspace size, eliminating the 60s+ stalls
 * caused by SCAN under concurrent load in large deployments (see GitHub #11624, #12408).
 *
 * Trade-offs:
 * - `add/update/remove` use read-modify-write on the aggregate key (not atomic). This is
 *   acceptable because writes are rare: leader-only at startup, manual reinspection at runtime.
 * - The entire config map is serialized/deserialized on every operation. With typical MCP
 *   deployments (~5-50 servers), the JSON payload is small (10-50KB).
 * - Cross-instance visibility is preserved: all instances read/write the same Redis key,
 *   so reinspection results propagate automatically after readThroughCache TTL expiry.
 */
const AGGREGATE_KEY = '__all__';

export class ServerConfigsCacheRedisAggregateKey
  extends BaseRegistryCache
  implements IServerConfigsRepositoryInterface
{
  protected readonly cache: Keyv;

  constructor(namespace: string, leaderOnly: boolean) {
    super(leaderOnly);
    this.cache = standardCache(`${this.PREFIX}::Servers::${namespace}`);
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
    const all = await this.getAll();
    if (all[serverName]) {
      throw new Error(
        `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
      );
    }
    const storedConfig = { ...config, updatedAt: Date.now() };
    all[serverName] = storedConfig;
    await this.cache.set(AGGREGATE_KEY, all);
    return { serverName, config: storedConfig };
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('update MCP servers');
    const all = await this.getAll();
    if (!all[serverName]) {
      throw new Error(
        `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
      );
    }
    all[serverName] = { ...config, updatedAt: Date.now() };
    await this.cache.set(AGGREGATE_KEY, all);
  }

  public async remove(serverName: string): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck('remove MCP servers');
    const all = await this.getAll();
    if (!all[serverName]) {
      throw new Error(`Failed to remove server "${serverName}" in cache.`);
    }
    delete all[serverName];
    await this.cache.set(AGGREGATE_KEY, all);
  }
}
