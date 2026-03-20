import type Keyv from 'keyv';
import { fromPairs } from 'lodash';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from '~/mcp/registry/ServerConfigsRepositoryInterface';
import type { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { standardCache, keyvRedisClient } from '~/cache';
import { BaseRegistryCache } from './BaseRegistryCache';

/**
 * Redis-backed implementation of MCP server configurations cache for distributed deployments.
 * Stores server configs in Redis with namespace isolation.
 * Enables data sharing across multiple server instances in a cluster environment.
 * Supports optional leader-only write operations to prevent race conditions during initialization.
 * Data persists across server restarts and is accessible from any instance in the cluster.
 */
const BATCH_SIZE = 100;

export class ServerConfigsCacheRedis
  extends BaseRegistryCache
  implements IServerConfigsRepositoryInterface
{
  protected readonly cache: Keyv;
  private readonly namespace: string;

  constructor(namespace: string, leaderOnly: boolean) {
    super(leaderOnly);
    this.namespace = namespace;
    this.cache = standardCache(`${this.PREFIX}::Servers::${namespace}`);
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
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    return this.cache.get(serverName);
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    if (!keyvRedisClient || !('scanIterator' in keyvRedisClient)) {
      throw new Error('Redis client with scanIterator not available.');
    }

    const startTime = Date.now();
    const pattern = `*${this.cache.namespace}:*`;

    const keys: string[] = [];
    for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
      keys.push(key);
    }

    if (keys.length === 0) {
      logger.debug(`[ServerConfigsCacheRedis] getAll(${this.namespace}): no keys found`);
      return {};
    }

    /** Extract keyName from full Redis key format: "prefix::namespace:keyName" */
    const keyNames = keys.map((key) => key.substring(key.lastIndexOf(':') + 1));

    const entries: Array<[string, ParsedServerConfig]> = [];

    for (let i = 0; i < keyNames.length; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, keyNames.length);
      const promises: Promise<ParsedServerConfig | undefined>[] = [];

      for (let j = i; j < batchEnd; j++) {
        promises.push(this.cache.get(keyNames[j]));
      }

      const configs = await Promise.all(promises);

      for (let j = 0; j < configs.length; j++) {
        if (configs[j]) {
          entries.push([keyNames[i + j], configs[j]!]);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.debug(
      `[ServerConfigsCacheRedis] getAll(${this.namespace}): fetched ${entries.length} configs in ${elapsed}ms`,
    );

    return fromPairs(entries);
  }
}
