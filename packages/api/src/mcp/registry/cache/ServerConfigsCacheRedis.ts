import type Keyv from 'keyv';
import { fromPairs } from 'lodash';
import { standardCache, keyvRedisClient, ioredisClient, cacheConfig } from '~/cache';
import { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { BaseRegistryCache } from './BaseRegistryCache';
import { IServerConfigsRepositoryInterface } from '../ServerConfigsRepositoryInterface';

/**
 * Lua script for atomic add-to-index operation.
 * Preserves Keyv's JSON wrapper format: {"value": [...], "expires": null}
 *
 * KEYS[1] = index key
 * ARGV[1] = server name to add
 *
 * Returns 1 if added, 0 if already exists
 */
const LUA_ADD_TO_INDEX = `
local raw = redis.call('GET', KEYS[1])
local index = {}
if raw then
  local data = cjson.decode(raw)
  if data and data.value then
    index = data.value
  end
end
for i, name in ipairs(index) do
  if name == ARGV[1] then
    return 0
  end
end
table.insert(index, ARGV[1])
local wrapped = cjson.encode({value = index, expires = cjson.null})
redis.call('SET', KEYS[1], wrapped)
return 1
`;

/**
 * Lua script for atomic remove-from-index operation.
 * Preserves Keyv's JSON wrapper format: {"value": [...], "expires": null}
 *
 * KEYS[1] = index key
 * ARGV[1] = server name to remove
 *
 * Returns 1 if removed, 0 if not found
 */
const LUA_REMOVE_FROM_INDEX = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local data = cjson.decode(raw)
if not data or not data.value then
  return 0
end
local index = data.value
local newIndex = {}
local found = false
for i, name in ipairs(index) do
  if name == ARGV[1] then
    found = true
  else
    table.insert(newIndex, name)
  end
end
if not found then
  return 0
end
local wrapped = cjson.encode({value = newIndex, expires = cjson.null})
redis.call('SET', KEYS[1], wrapped)
return 1
`;

/**
 * Redis-backed implementation of MCP server configurations cache for distributed deployments.
 * Stores server configs in Redis with namespace isolation.
 * Enables data sharing across multiple server instances in a cluster environment.
 * Supports optional leader-only write operations to prevent race conditions during initialization.
 * Data persists across server restarts and is accessible from any instance in the cluster.
 *
 * For sharded backends (Redis Cluster or ElastiCache Serverless with REDIS_SINGLE_KEY_OPS),
 * an index key is maintained to track all server names, avoiding SCAN operations that may
 * miss keys distributed across different shards.
 */
export class ServerConfigsCacheRedis
  extends BaseRegistryCache
  implements IServerConfigsRepositoryInterface
{
  protected readonly cache: Keyv;
  private readonly namespace: string;
  /**
   * Whether to use index-based operations instead of SCAN.
   * Required for Redis Cluster or sharded backends like ElastiCache Serverless.
   */
  private readonly useIndex: boolean;

  constructor(namespace: string, leaderOnly: boolean) {
    super(leaderOnly);
    this.namespace = namespace;
    this.cache = standardCache(`${this.PREFIX}::Servers::${namespace}`);
    this.useIndex = cacheConfig.USE_REDIS_CLUSTER || cacheConfig.REDIS_SINGLE_KEY_OPS;
  }

  /**
   * Retrieves the current server name index from cache.
   * Returns empty array if index doesn't exist.
   */
  private async getIndex(): Promise<string[]> {
    const index = await this.cache.get(cacheConfig.MCP_SERVER_INDEX_KEY);
    return Array.isArray(index) ? index : [];
  }

  /**
   * Adds a server name to the index if not already present.
   * Uses atomic Lua script to prevent race conditions during parallel initialization.
   */
  private async addToIndex(serverName: string): Promise<void> {
    // Use atomic Lua script via ioredis to prevent race conditions
    // ioredis auto-prepends keyPrefix, so we only need namespace:key
    if (ioredisClient) {
      const fullKey = `${this.cache.namespace}:${cacheConfig.MCP_SERVER_INDEX_KEY}`;
      await ioredisClient.call('EVAL', LUA_ADD_TO_INDEX, 1, fullKey, serverName);
      return;
    }
    // Fallback: non-atomic operation (only used if ioredis unavailable)
    const index = await this.getIndex();
    if (!index.includes(serverName)) {
      index.push(serverName);
      await this.cache.set(cacheConfig.MCP_SERVER_INDEX_KEY, index);
    }
  }

  /**
   * Removes a server name from the index.
   * Uses atomic Lua script to prevent race conditions.
   */
  private async removeFromIndex(serverName: string): Promise<void> {
    // Use atomic Lua script via ioredis to prevent race conditions
    // ioredis auto-prepends keyPrefix, so we only need namespace:key
    if (ioredisClient) {
      const fullKey = `${this.cache.namespace}:${cacheConfig.MCP_SERVER_INDEX_KEY}`;
      await ioredisClient.call('EVAL', LUA_REMOVE_FROM_INDEX, 1, fullKey, serverName);
      return;
    }
    // Fallback: non-atomic operation (only used if ioredis unavailable)
    const index = await this.getIndex();
    const newIndex = index.filter((name) => name !== serverName);
    if (newIndex.length !== index.length) {
      await this.cache.set(cacheConfig.MCP_SERVER_INDEX_KEY, newIndex);
    }
  }

  public async add(serverName: string, config: ParsedServerConfig): Promise<AddServerResult> {
    if (this.leaderOnly) await this.leaderCheck(`add ${this.namespace} MCP servers`);
    const exists = await this.cache.has(serverName);
    if (exists)
      throw new Error(
        `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
      );
    const storedConfig = { ...config, updatedAt: Date.now() };
    const success = await this.cache.set(serverName, storedConfig);
    this.successCheck(`add ${this.namespace} server "${serverName}"`, success);

    // Maintain index for sharded backends (cluster mode or single-key ops)
    if (this.useIndex) {
      await this.addToIndex(serverName);
    }

    return { serverName, config: storedConfig };
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck(`update ${this.namespace} MCP servers`);
    const exists = await this.cache.has(serverName);
    if (!exists)
      throw new Error(
        `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
      );
    const success = await this.cache.set(serverName, { ...config, updatedAt: Date.now() });
    this.successCheck(`update ${this.namespace} server "${serverName}"`, success);
  }

  public async remove(serverName: string): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck(`remove ${this.namespace} MCP servers`);
    const success = await this.cache.delete(serverName);
    this.successCheck(`remove ${this.namespace} server "${serverName}"`, success);

    // Keep index in sync for sharded backends
    if (this.useIndex) {
      await this.removeFromIndex(serverName);
    }
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    return this.cache.get(serverName);
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    const entries: Array<[string, ParsedServerConfig]> = [];

    if (this.useIndex) {
      // Index-based retrieval for sharded backends (cluster mode or ElastiCache Serverless)
      // SCAN only hits one shard on ElastiCache Serverless, so we use an index key instead
      const serverNames = await this.getIndex();
      for (const serverName of serverNames) {
        const config = (await this.cache.get(serverName)) as ParsedServerConfig | undefined;
        if (config) {
          entries.push([serverName, config]);
        }
      }
    } else {
      // Use Redis SCAN iterator directly (non-blocking, production-ready)
      // Note: Keyv uses a single colon ':' between namespace and key, even if GLOBAL_PREFIX_SEPARATOR is '::'
      const pattern = `*${this.cache.namespace}:*`;

      // Use scanIterator from Redis client
      if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
        for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
          // Extract the actual key name (last part after final colon)
          // Full key format: "prefix::namespace:keyName"
          const lastColonIndex = key.lastIndexOf(':');
          const keyName = key.substring(lastColonIndex + 1);
          const config = (await this.cache.get(keyName)) as ParsedServerConfig | undefined;
          if (config) {
            entries.push([keyName, config]);
          }
        }
      } else {
        throw new Error('Redis client with scanIterator not available.');
      }
    }

    return fromPairs(entries);
  }
}
