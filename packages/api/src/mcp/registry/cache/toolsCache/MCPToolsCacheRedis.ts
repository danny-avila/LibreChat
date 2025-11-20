import type Keyv from 'keyv';
import { fromPairs } from 'lodash';
import { LCAvailableTools } from '~/mcp/types';
import { IMCPToolsCache, CachedTools } from './IMCPToolsCache';
import { standardCache, keyvRedisClient } from '~/cache';
import { BaseRegistryCache } from '../BaseRegistryCache';

export class MCPToolsCacheRedis extends BaseRegistryCache implements IMCPToolsCache {
  protected readonly cache: Keyv;
  private readonly userId: string;
  constructor(userId: string) {
    super();
    this.userId = userId;
    this.cache = standardCache(`${this.PREFIX}::Tools::${userId}`);
  }
  async add(serverName: string, tools: LCAvailableTools): Promise<void> {
    const exists = await this.cache.has(serverName);
    if (exists) {
      throw new Error(
        `Server "${serverName}" already exists in cache that belongs to user with Id ${this.userId}. Use update() to modify existing tools.`,
      );
    }
    const cachedTools: CachedTools = {
      tools,
      cachedAt: Date.now(),
    };
    const success = await this.cache.set(serverName, cachedTools);
    this.successCheck(
      `add server "${serverName}" tools into user's cache. User ID - "${this.userId}" `,
      success,
    );
  }

  async update(serverName: string, tools: LCAvailableTools): Promise<void> {
    if (!(await this.cache.has(serverName))) {
      throw new Error(`Server ${serverName} not found in tools cache. Use add() instead`);
    }
    const cachedTools: CachedTools = {
      tools,
      cachedAt: Date.now(),
    };
    const success = await this.cache.set(serverName, cachedTools);
    this.successCheck(
      `update server "${serverName}" tools into user's cache. User ID - "${this.userId}" `,
      success,
    );
  }

  async remove(serverName: string): Promise<void> {
    const success = await this.cache.delete(serverName);
    this.successCheck(
      `remove server "${serverName}" tools from user's cache. User ID - "${this.userId}" `,
      success,
    );
  }

  async get(serverName: string): Promise<CachedTools | undefined> {
    return this.cache.get(serverName);
  }

  async getAll(): Promise<Record<string, CachedTools>> {
    const pattern = `*${this.cache.namespace}:*`;
    const entries: Array<[string, CachedTools]> = [];

    if (keyvRedisClient && 'scanIterator' in keyvRedisClient) {
      for await (const key of keyvRedisClient.scanIterator({ MATCH: pattern })) {
        const lastColonIndex = key.lastIndexOf(':');
        const keyName = key.substring(lastColonIndex + 1);
        const cachedTools = (await this.cache.get(keyName)) as CachedTools | undefined;
        if (cachedTools) {
          entries.push([keyName, cachedTools]);
        }
      }
    }

    return fromPairs(entries);
  }

  async reset(): Promise<void> {
    this.cache.clear();
  }
}
