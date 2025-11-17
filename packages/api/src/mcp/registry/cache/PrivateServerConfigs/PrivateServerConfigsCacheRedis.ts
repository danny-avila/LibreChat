import { ParsedServerConfig } from '~/mcp/types';
import { keyvRedisClient } from '~/cache';
import { PrivateServerConfigsCacheBase } from './PrivateServerConfigsCacheBase';
import { logger } from '@librechat/data-schemas';
import { cacheConfig } from '~/cache/cacheConfig';

export class PrivateServerConfigsCacheRedis extends PrivateServerConfigsCacheBase {
  public async has(userId: string): Promise<boolean> {
    if (!userId || !keyvRedisClient || !('scanIterator' in keyvRedisClient)) {
      return false;
    }

    const pattern = `*${this.PREFIX}::${userId}:*`;

    for await (const _key of keyvRedisClient.scanIterator({
      MATCH: pattern,
      COUNT: 1,
    })) {
      return true;
    }

    return false; // No keys found - cache not initialized
  }

  public async updateServerConfigIfExists(
    serverName: string,
    config: ParsedServerConfig,
  ): Promise<void> {
    if (!keyvRedisClient || !('scanIterator' in keyvRedisClient)) {
      logger.warn('[MCP][PrivateServers][Redis] Redis SCAN not available');
      return;
    }

    const pattern = this.generateScanKeyPattern(serverName);
    const keysToUpdate: string[] = [];

    try {
      // Efficient: Pattern-based scan for specific serverName
      // All cache keys that have the serverName
      for await (const key of keyvRedisClient.scanIterator({
        MATCH: pattern,
        COUNT: cacheConfig.REDIS_SCAN_COUNT,
      })) {
        keysToUpdate.push(key);
      }

      if (keysToUpdate.length > 0) {
        const updatedConfig = { ...config, lastUpdatedAt: Date.now() };
        const keyvFormat = { value: updatedConfig, expires: null };
        const serializedConfig = JSON.stringify(keyvFormat);

        // Batch update using pipeline with XX flag (only update if key still exists)
        const chunkSize = cacheConfig.REDIS_UPDATE_CHUNK_SIZE;
        for (let i = 0; i < keysToUpdate.length; i += chunkSize) {
          const chunk = keysToUpdate.slice(i, i + chunkSize);
          const multi = keyvRedisClient.multi();
          for (const key of chunk) {
            multi.set(key, serializedConfig, { XX: true });
          }
          await multi.exec();
        }

        logger.info(
          `[MCP][PrivateServers][Redis] Propagated config update for "${serverName}" to ${keysToUpdate.length} users`,
        );
      } else {
        logger.debug(`[MCP][PrivateServers][Redis] No users have "${serverName}"`);
      }
    } catch (error) {
      logger.error(`[MCP][PrivateServers][Redis] Error updating "${serverName}"`, error);
      throw error;
    }
  }

  public async addServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
    config: ParsedServerConfig,
  ): Promise<void> {
    if (!keyvRedisClient) return;

    // Optimized: Single SCAN to get all users with initialized caches
    const allUsersWithCaches = await this.getAllUserIds();

    // Filter to only users with initialized caches
    const eligibleUserIds = userIds.filter((id) => allUsersWithCaches.has(id));

    if (eligibleUserIds.length === 0) {
      logger.info(
        `[MCP][PrivateServers][Redis] No initialized users to grant access to "${serverName}"`,
      );
      return;
    }

    // Batch add using pipeline with NX (only set if key doesn't exist)
    const updatedConfig = { ...config, lastUpdatedAt: Date.now() };
    const keyvFormat = { value: updatedConfig, expires: null };
    const serializedConfig = JSON.stringify(keyvFormat);

    const globalPrefix = cacheConfig.REDIS_KEY_PREFIX;
    const separator = cacheConfig.GLOBAL_PREFIX_SEPARATOR;

    const chunkSize = cacheConfig.REDIS_UPDATE_CHUNK_SIZE;
    for (let i = 0; i < eligibleUserIds.length; i += chunkSize) {
      const chunk = eligibleUserIds.slice(i, i + chunkSize);
      const multi = keyvRedisClient.multi();
      for (const userId of chunk) {
        const namespace = `${this.PREFIX}::${userId}`;
        const fullKey = globalPrefix
          ? `${globalPrefix}${separator}${namespace}:${serverName}`
          : `${namespace}:${serverName}`;
        multi.set(fullKey, serializedConfig, { NX: true });
      }
      await multi.exec();
    }

    logger.info(
      `[MCP][PrivateServers][Redis] Granted access to "${serverName}" for ${eligibleUserIds.length}/${userIds.length} initialized users`,
    );
  }

  public async removeServerConfigIfCacheExists(
    userIds: string[],
    serverName: string,
  ): Promise<void> {
    if (!keyvRedisClient) return;

    // Optimized: Direct key construction - no SCAN needed!
    // Build full Redis keys directly since we know userId and serverName
    const globalPrefix = cacheConfig.REDIS_KEY_PREFIX;
    const separator = cacheConfig.GLOBAL_PREFIX_SEPARATOR;
    const keysToDelete: string[] = [];

    for (const userId of userIds) {
      // Construct the full Redis key
      const namespace = `${this.PREFIX}::${userId}`;
      const fullKey = globalPrefix
        ? `${globalPrefix}${separator}${namespace}:${serverName}`
        : `${namespace}:${serverName}`;
      keysToDelete.push(fullKey);
    }

    // Batch delete using DEL (Redis ignores non-existent keys)
    if (keysToDelete.length > 0) {
      const chunkSize = cacheConfig.REDIS_DELETE_CHUNK_SIZE || 100;
      let removedCount = 0;

      for (let i = 0; i < keysToDelete.length; i += chunkSize) {
        const chunk = keysToDelete.slice(i, i + chunkSize);
        const deleted = await keyvRedisClient.del(chunk);
        removedCount += deleted;
      }

      logger.info(
        `[MCP][PrivateServers][Redis] Revoked access to "${serverName}" from ${removedCount}/${userIds.length} users`,
      );
    }
  }

  public async findUsersWithServer(serverName: string): Promise<string[]> {
    if (!keyvRedisClient || !('scanIterator' in keyvRedisClient)) {
      return [];
    }

    const userIds: string[] = [];
    const pattern = this.generateScanKeyPattern(serverName);

    try {
      for await (const key of keyvRedisClient.scanIterator({
        MATCH: pattern,
        COUNT: cacheConfig.REDIS_SCAN_COUNT,
      })) {
        const userId = this.extractUserIdFromKey(key);
        if (userId) {
          userIds.push(userId);
        }
      }
    } catch (error) {
      logger.error(`[MCP][PrivateServers][Redis] Error finding users with "${serverName}"`, error);
    }

    return userIds;
  }

  /**
   * Scans Redis to find all unique userIds that have private server configs.
   * This method is used for efficient batch operations (add/update/delete) across all users.
   *
   * Performance note: This scans all private server config keys in Redis.
   * Use sparingly as it can be expensive with many users.
   */
  private async getAllUserIds(): Promise<Set<string>> {
    if (!keyvRedisClient || !('scanIterator' in keyvRedisClient)) {
      logger.warn('[MCP][PrivateServerConfigs][Redis] Redis SCAN not available');
      return new Set();
    }

    const userIds = new Set<string>();
    // Pattern to match all private server configs: MCP::ServersRegistry::Servers::*:*
    const pattern = `*${this.PREFIX}::*:*`;

    try {
      for await (const key of keyvRedisClient.scanIterator({
        MATCH: pattern,
        COUNT: cacheConfig.REDIS_SCAN_COUNT,
      })) {
        const userId = this.extractUserIdFromKey(key);
        if (userId) {
          userIds.add(userId);
        }
      }
    } catch (error) {
      logger.error('[MCP][PrivateServerConfigs][Redis] Error scanning for userIds', error);
      throw error;
    }

    return userIds;
  }

  /**
   * Extract userId from a Redis key.
   * Key format: MCP::ServersRegistry::Servers::userId:serverName
   */
  private extractUserIdFromKey(key: string): string | null {
    // Remove any global prefix, then extract userId
    const keyWithoutGlobalPrefix = key.includes(this.PREFIX)
      ? key.substring(key.indexOf(this.PREFIX))
      : key;

    const withoutPrefix = keyWithoutGlobalPrefix.replace(`${this.PREFIX}::`, '');
    const lastColonIndex = withoutPrefix.lastIndexOf(':');
    if (lastColonIndex === -1) return null;

    return withoutPrefix.substring(0, lastColonIndex);
  }

  /**
   * Clear ALL servers from ALL user caches (nuclear option).
   */
  public async resetAll(): Promise<void> {
    if (!keyvRedisClient || !('scanIterator' in keyvRedisClient)) return;

    // Pattern to match all private user server configs
    // Format: MCP::ServersRegistry::Servers::userId:serverName
    const pattern = `*${this.PREFIX}::*:*`;

    const keysToDelete: string[] = [];

    for await (const key of keyvRedisClient.scanIterator({
      MATCH: pattern,
      COUNT: cacheConfig.REDIS_SCAN_COUNT,
    })) {
      keysToDelete.push(key);
    }

    if (keysToDelete.length > 0) {
      const chunkSize = cacheConfig.REDIS_DELETE_CHUNK_SIZE;
      for (let i = 0; i < keysToDelete.length; i += chunkSize) {
        const chunk = keysToDelete.slice(i, i + chunkSize);
        await keyvRedisClient.del(chunk);
      }
    }
    logger.info(`[MCP][Cache][Redis] Cleared all user caches: ${keysToDelete.length} entries`);
  }

  private generateScanKeyPattern(serverName: string): string {
    return `*${this.PREFIX}::*:${serverName}`;
  }
}
