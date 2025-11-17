import type * as t from '~/mcp/types';
import { ServerConfigsCache, ServerConfigsCacheFactory } from '../ServerConfigsCacheFactory';
import { logger } from '@librechat/data-schemas';

export abstract class PrivateServerConfigsCacheBase {
  protected readonly PREFIX = 'MCP::ServersRegistry::Servers';
  protected caches: Map<string, ServerConfigsCache> = new Map();

  public async add(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.add(serverName, config);
  }

  public async update(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.update(serverName, config);
  }

  /**
   * Get a specific server config from a user's cache.
   */
  public async get(userId: string, serverName: string): Promise<t.ParsedServerConfig | undefined> {
    const cache = this.getOrCreatePrivateUserCache(userId);
    return await cache.get(serverName);
  }

  /**
   * Get all server configs for a user.
   */
  public async getAll(userId: string): Promise<Record<string, t.ParsedServerConfig>> {
    const cache = this.getOrCreatePrivateUserCache(userId);
    return await cache.getAll();
  }

  /**
   * Check if a user has a cache instance loaded.
   */
  public abstract has(userId: string): Promise<boolean>;

  public async remove(userId: string, serverName: string): Promise<void> {
    const userCache = this.getOrCreatePrivateUserCache(userId);
    await userCache.remove(serverName);
  }

  public async reset(userId: string): Promise<void> {
    const cache = this.getOrCreatePrivateUserCache(userId);
    return cache.reset();
  }

  // ============= BATCH OPERATION PRIMITIVES =============
  // Simple primitives for MCPPrivateServerLoader orchestration - no business logic

  /**
   * Update server config in ALL user caches that already have it.
   * Efficient: Uses pattern-based scan, skips users who don't have it.
   * Use case: Metadata changed (command, args, env)
   */
  public abstract updateServerConfigIfExists(
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void>;

  /**
   * Add server config ONLY to users whose caches are already initialized.
   * Skips users without initialized caches (doesn't create new caches).
   * Use case: Granting access to existing users
   */
  public abstract addServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void>;

  /**
   * Remove server config ONLY from users whose caches exist.
   * Ignores users without initialized caches.
   * Use case: Revoking access from users
   */
  public abstract removeServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
  ): Promise<void>;

  /**
   * Find all users who have this server in their cache.
   * Primitive for determining affected users.
   */
  public abstract findUsersWithServer(serverName: string): Promise<string[]>;

  /**
   * Clear all private server configs for all users (nuclear option).
   * Use sparingly - typically only for testing or full reset.
   */
  public abstract resetAll(): Promise<void>;

  protected getOrCreatePrivateUserCache(userId: string): ServerConfigsCache {
    if (!userId) {
      logger.error('userId is required to get or create private user cache');
      throw new Error('userId is required to get or create private user cache');
    }
    if (!this.caches.has(userId)) {
      const cache = ServerConfigsCacheFactory.create(userId, false);
      this.caches.set(userId, cache);
    }
    return this.caches.get(userId)!;
  }
}
