import type Keyv from 'keyv';
import { isLeader } from '~/cluster';

/**
 * Base class for MCP registry caches that require distributed leader coordination.
 * Provides helper methods for leader-only operations and success validation.
 * All concrete implementations must provide their own Keyv cache instance.
 */
export abstract class BaseRegistryCache {
  protected readonly PREFIX = 'MCP::ServersRegistry';
  protected abstract readonly cache: Keyv;

  protected async leaderCheck(action: string): Promise<void> {
    if (!(await isLeader())) throw new Error(`Only leader can ${action}.`);
  }

  protected successCheck(action: string, success: boolean): true {
    if (!success) throw new Error(`Failed to ${action} in cache.`);
    return true;
  }

  public async reset(): Promise<void> {
    await this.leaderCheck(`reset ${this.cache.namespace} cache`);
    await this.cache.clear();
  }
}
