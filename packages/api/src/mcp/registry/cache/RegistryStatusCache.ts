import { standardCache } from '~/cache';
import { BaseRegistryCache } from './BaseRegistryCache';

// Status keys
const INITIALIZED = 'INITIALIZED';

/**
 * Cache for tracking MCP Servers Registry metadata and status across distributed instances.
 * Uses Redis-backed storage to coordinate state between leader and follower nodes.
 * Currently, tracks initialization status to ensure only the leader performs initialization
 * while followers wait for completion. Designed to be extended with additional registry
 * metadata as needed (e.g., last update timestamps, version info, health status).
 * This cache is only meant to be used internally by registry management components.
 */
class RegistryStatusCache extends BaseRegistryCache {
  protected readonly cache = standardCache(`${this.PREFIX}::Status`);

  public async isInitialized(): Promise<boolean> {
    return (await this.get(INITIALIZED)) === true;
  }

  public async setInitialized(value: boolean): Promise<void> {
    await this.set(INITIALIZED, value);
  }

  private async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.cache.get(key);
  }

  private async set(key: string, value: string | number | boolean, ttl?: number): Promise<void> {
    await this.leaderCheck('set MCP Servers Registry status');
    const success = await this.cache.set(key, value, ttl);
    this.successCheck(`set status key "${key}"`, success);
  }
}

export const registryStatusCache = new RegistryStatusCache();
