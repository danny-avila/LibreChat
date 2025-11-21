import type Keyv from 'keyv';
import { fromPairs } from 'lodash';
import { standardCache, keyvRedisClient } from '~/cache';
import { ParsedServerConfig } from '~/mcp/types';
import { BaseRegistryCache } from './BaseRegistryCache';

/**
 * Redis-backed implementation of MCP server configurations cache for distributed deployments.
 * Stores server configs in Redis with namespace isolation by owner (App, User, or specific user ID).
 * Enables data sharing across multiple server instances in a cluster environment.
 * Supports optional leader-only write operations to prevent race conditions during initialization.
 * Data persists across server restarts and is accessible from any instance in the cluster.
 */
export class ServerConfigsCacheRedis extends BaseRegistryCache {
  protected readonly cache: Keyv;
  private readonly owner: string;
  private readonly leaderOnly: boolean;

  constructor(owner: string, leaderOnly: boolean) {
    super();
    this.owner = owner;
    this.leaderOnly = leaderOnly;
    this.cache = standardCache(`${this.PREFIX}::Servers::${owner}`);
  }

  public async add(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck(`add ${this.owner} MCP servers`);
    const exists = await this.cache.has(serverName);
    if (exists)
      throw new Error(
        `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
      );
    const success = await this.cache.set(serverName, config);
    this.successCheck(`add ${this.owner} server "${serverName}"`, success);
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck(`update ${this.owner} MCP servers`);
    const exists = await this.cache.has(serverName);
    if (!exists)
      throw new Error(
        `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
      );
    const success = await this.cache.set(serverName, config);
    this.successCheck(`update ${this.owner} server "${serverName}"`, success);
  }

  public async remove(serverName: string): Promise<void> {
    if (this.leaderOnly) await this.leaderCheck(`remove ${this.owner} MCP servers`);
    const success = await this.cache.delete(serverName);
    this.successCheck(`remove ${this.owner} server "${serverName}"`, success);
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    return this.cache.get(serverName);
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    // Use Redis SCAN iterator directly (non-blocking, production-ready)
    // Note: Keyv uses a single colon ':' between namespace and key, even if GLOBAL_PREFIX_SEPARATOR is '::'
    const pattern = `*${this.cache.namespace}:*`;
    const entries: Array<[string, ParsedServerConfig]> = [];

    // Use scanIterator from Redis client
    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
        // Extract the actual key name (last part after final colon)
        // Full key format: "prefix::namespace:keyName"
        const lastColonIndex = key.lastIndexOf(':');
        const keyName = key.substring(lastColonIndex + 1);
        const value = await this.cache.get(keyName);
        if (value) {
          entries.push([keyName, value as ParsedServerConfig]);
        }
      }
    } else {
      throw new Error('Redis client with scanIterator not available.');
    }

    return fromPairs(entries);
  }
}
