import { ParsedServerConfig } from '~/mcp/types';
import { PrivateServerConfigsCacheBase } from './PrivateServerConfigsCacheBase';
import { logger } from '@librechat/data-schemas';
import { ServerConfigsCacheInMemory } from '../ServerConfigsCacheInMemory';

export class PrivateServerConfigsCacheInMemory extends PrivateServerConfigsCacheBase {
  public async has(userId: string): Promise<boolean> {
    return this.caches.has(userId);
  }

  public async updateServerConfigIfExists(
    serverName: string,
    config: ParsedServerConfig,
  ): Promise<void> {
    let updatedCount = 0;

    for (const [userId, userCache] of this.caches.entries()) {
      const existing = await userCache.get(serverName);
      if (existing) {
        const inMemoryCache = userCache as ServerConfigsCacheInMemory;
        await inMemoryCache.set(serverName, config);
        updatedCount++;
        logger.debug(`[MCP][PrivateServers][InMemory] Updated "${serverName}" for user ${userId}`);
      }
    }

    logger.info(
      `[MCP][PrivateServers][InMemory] Propagated config update for "${serverName}" to ${updatedCount} users`,
    );
  }

  public async addServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
    config: ParsedServerConfig,
  ): Promise<void> {
    let addedCount = 0;

    for (const userId of userIds) {
      if (this.caches.has(userId)) {
        // Only if cache initialized
        const userCache = this.getOrCreatePrivateUserCache(userId);
        const inMemoryCache = userCache as ServerConfigsCacheInMemory;
        await inMemoryCache.set(serverName, config);
        addedCount++;
        logger.debug(`[MCP][PrivateServers][InMemory] Added "${serverName}" to user ${userId}`);
      }
    }

    logger.info(
      `[MCP][PrivateServers][InMemory] Granted access to "${serverName}" for ${addedCount}/${userIds.length} initialized users`,
    );
  }

  public async removeServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
  ): Promise<void> {
    let removedCount = 0;

    for (const userId of userIds) {
      if (this.caches.has(userId)) {
        try {
          const userCache = this.getOrCreatePrivateUserCache(userId);
          await userCache.remove(serverName);
          removedCount++;
          logger.debug(
            `[MCP][PrivateServers][InMemory] Removed "${serverName}" from user ${userId}`,
          );
        } catch (error) {
          // Ignore - server might not exist for this user
          logger.debug(
            `[MCP][PrivateServers][InMemory] Server "${serverName}" not found for user ${userId}`,
            error,
          );
        }
      }
    }

    logger.info(
      `[MCP][PrivateServers][InMemory] Revoked access to "${serverName}" from ${removedCount}/${userIds.length} users`,
    );
  }

  public async findUsersWithServer(serverName: string): Promise<string[]> {
    const userIds: string[] = [];

    for (const [userId, userCache] of this.caches.entries()) {
      const config = await userCache.get(serverName);
      if (config) {
        userIds.push(userId);
      }
    }

    return userIds;
  }

  /**
   * Clear ALL servers from ALL user caches (nuclear option).
   */
  public async resetAll(): Promise<void> {
    this.caches.clear();
    logger.info(`[MCP][PrivateServers][InMemory] Cleared ALL user caches`);
  }
}
