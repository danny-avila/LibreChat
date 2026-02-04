import type Keyv from 'keyv';
import { fromPairs } from 'lodash';
import { standardCache, keyvRedisClient } from '~/cache';
import { ParsedServerConfig, AddServerResult } from '~/mcp/types';
import { BaseRegistryCache } from './BaseRegistryCache';
import { IServerConfigsRepositoryInterface } from '../ServerConfigsRepositoryInterface';

/**
 * Redis-backed implementation of MCP server configurations cache for distributed deployments.
 * Stores server configs in Redis with namespace isolation.
 * Enables data sharing across multiple server instances in a cluster environment.
 * Supports optional leader-only write operations to prevent race conditions during initialization.
 * Data persists across server restarts and is accessible from any instance in the cluster.
 */
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

    const pattern = `*${this.cache.namespace}:*`;

    const keys: string[] = [];
    for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
      keys.push(key);
    }

    if (keys.length === 0) {
      return {};
    }

    const keyNames = keys.map((key) => {
      const lastColonIndex = key.lastIndexOf(':');
      return key.substring(lastColonIndex + 1);
    });

    const configs = await Promise.all(keyNames.map((keyName) => this.cache.get(keyName)));

    const entries: Array<[string, ParsedServerConfig]> = [];
    for (let i = 0; i < keyNames.length; i++) {
      const config = configs[i] as ParsedServerConfig | undefined;
      if (config) {
        entries.push([keyNames[i], config]);
      }
    }

    return fromPairs(entries);
  }
}
