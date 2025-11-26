import { mcpServersRegistry as registry } from './MCPServersRegistry';
import { privateServersLoadStatusCache as loadStatusCache } from './cache/PrivateServersLoadStatusCache';
import type * as t from '~/mcp/types';
import { logger } from '@librechat/data-schemas';
import { MCPServerDB } from 'librechat-data-provider';

/**
 * Handles loading and updating private MCP servers for users.
 * Static methods work directly with the registry's privateServersCache.
 * Similar pattern to MCPServersInitializer but for runtime private server management.
 */
export class MCPPrivateServerLoader {
  /**
   * Load private servers for a specific user with TTL synchronization and distributed locking.
   * Use case: User logs in, lazy-load their private servers from DB
   *
   * Handles three critical issues:
   * 1. Partial Load Prevention: Loaded flag only set after ALL servers load successfully
   * 2. TTL Synchronization: Loaded flag expires with cache entries (prevents desync)
   * 3. Race Condition Prevention: Distributed locking prevents concurrent loads
   *
   * Edge cases handled:
   * - Process crashes mid-load: Flag not set, will retry on next attempt
   * - Cache eviction: TTL ensures flag expires with cache entries
   * - Concurrent loads: Lock ensures only one process loads, others wait
   * - Users with 0 servers: Correctly handled (no cache verification needed)
   *
   * @param userId - User ID
   * @param configsLoader - a callback that fetches db servers available for a user
   * @param cacheTTL - Cache TTL in milliseconds (default: 3600000 = 1 hour)
   * @throws {Error} If userId is invalid or loading fails
   */
  public static async loadPrivateServers(
    userId: string,
    configsLoader: (userId: string) => Promise<MCPServerDB[]>,
    cacheTTL: number = 3600000, // 1 hour default
  ): Promise<void> {
    // Input validation
    if (!userId?.trim()) {
      throw new Error('[MCP][PrivateServerLoader] userId is required and cannot be empty');
    }
    if (typeof configsLoader !== 'function') {
      throw new Error('[MCP][PrivateServerLoader] configsLoader must be a function');
    }

    const alreadyLoaded = await loadStatusCache.isLoaded(userId);
    if (alreadyLoaded) {
      logger.debug(`[MCP][PrivateServerLoader] User ${userId} private servers already loaded`);
      return;
    }

    const lockAcquired = await loadStatusCache.acquireLoadLock(userId);

    if (!lockAcquired) {
      logger.debug(
        `[MCP][PrivateServerLoader] Another process is loading user ${userId}, waiting...`,
      );
      const completed = await loadStatusCache.waitForLoad(userId);

      if (completed) {
        logger.debug(`[MCP][PrivateServerLoader] User ${userId} loaded by another process`);
        return;
      } else {
        // Timeout - try to acquire lock again (maybe the other process crashed)
        logger.warn(
          `[MCP][PrivateServerLoader] Timeout waiting for user ${userId}, retrying lock acquisition`,
        );
        const retryLock = await loadStatusCache.acquireLoadLock(userId);
        if (!retryLock) {
          throw new Error(
            `[MCP][PrivateServerLoader] Failed to acquire load lock for user ${userId}`,
          );
        }
      }
    }

    // We have the lock, proceed with loading
    try {
      logger.info(`[MCP][PrivateServerLoader] Loading private servers for user ${userId}`);
      const servers = await configsLoader(userId);
      //reset cache for the user
      await registry.privateServersCache.reset(userId);

      for (const server of servers) {
        const serverName = server.mcp_id;
        const existing = await registry.privateServersCache.get(userId, serverName);
        if (!existing) {
          // Add new server config
          await registry.privateServersCache.add(userId, serverName, {
            ...server.config,
            dbId: server._id,
          });
          logger.debug(`${this.prefix(serverName)} Added private server for user ${userId}`);
        } else {
          logger.debug(
            `${this.prefix(serverName)} Private server already exists for user ${userId}`,
          );
        }
      }

      // Mark as fully loaded with TTL (synchronized with cache entries)
      await loadStatusCache.setLoaded(userId, cacheTTL);
      logger.debug(
        `[MCP][PrivateServerLoader] User ${userId} private servers fully loaded (${servers.length} servers, TTL: ${cacheTTL}ms)`,
      );
    } catch (error) {
      logger.error(
        `[MCP][PrivateServerLoader] Loading private servers for user ${userId} failed.`,
        error,
      );
      throw error;
    } finally {
      // Always release the lock, even on error
      await loadStatusCache.releaseLoadLock(userId);
    }
  }

  /**
   * Propagate metadata changes to all users who have this server or update shared cache if the server is shared with PUBLIC.
   * Use case: Admin updates server url, auth etc..
   * Efficient: Uses pattern-based scan, updates only affected users
   *
   * @param serverName - Server name
   * @param config - Updated server configuration
   */
  public static async updatePrivateServer(
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    //check if the private server is promoted to a app level or user shared level server
    const sharedServer = await registry.getServerConfig(serverName);
    if (sharedServer) {
      logger.info(`${this.prefix(serverName)} Promoted private server update`);
      // server must be removed to simplify moving from App -> Shared and Shared -> App based on the config.
      // Otherwise we need to figure out if it is an APP or a User shared and whether to migrate or not.

      await registry.removeServer(serverName);
      await registry.addSharedServer(serverName, config);
      return;
    }
    logger.info(`${this.prefix(serverName)} Propagating metadata update to all users`);
    await registry.privateServersCache.updateServerConfigIfExists(serverName, config);
  }

  /**
   * Add a private server
   * Use case: Admin / user creates an mcp server from the UI
   *
   * @param userId - userId
   * @param serverName - Server name
   * @param config - Updated server configuration
   */
  public static async addPrivateServer(
    userId: string,
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    logger.info(`${this.prefix(serverName)} add private server to user with Id ${userId}`);
    await registry.privateServersCache.add(userId, serverName, config);
  }

  /**
   * Handle permission changes - grant/revoke access.
   * Use case: Admin shares/unshares server with users
   *
   * @param serverName - Server name
   * @param allowedUserIds - Array of user IDs who should have access
   * @param config - Server configuration
   */
  public static async updatePrivateServerAccess(
    serverName: string,
    allowedUserIds: string[],
    config: t.ParsedServerConfig,
  ): Promise<void> {
    if (allowedUserIds.length === 0) {
      // Revoke from everyone
      logger.info(`${this.prefix(serverName)} Revoking access from all users`);
      const allUsers = await registry.privateServersCache.findUsersWithServer(serverName);
      await registry.privateServersCache.removeServerConfigIfCacheExists(allUsers, serverName);
      return;
    }

    logger.info(`${this.prefix(serverName)} Updating access for ${allowedUserIds.length} users`);

    // Find current state
    const currentUsers = await registry.privateServersCache.findUsersWithServer(serverName);
    const allowedSet = new Set(allowedUserIds);

    // Revoke from users no longer allowed
    const toRevoke = currentUsers.filter((id) => !allowedSet.has(id));
    if (toRevoke.length > 0) {
      logger.debug(`${this.prefix(serverName)} Revoking access from ${toRevoke.length} users`);
      await registry.privateServersCache.removeServerConfigIfCacheExists(toRevoke, serverName);
    }

    // Grant to allowed users (only initialized caches)
    logger.debug(`${this.prefix(serverName)} Granting access to ${allowedUserIds.length} users`);
    await registry.privateServersCache.addServerConfigIfCacheExists(
      allowedUserIds,
      serverName,
      config,
    );
  }

  /**
   * Promote a private server to shared (public) registry.
   * Use case: Admin shares a private server with PUBLIC
   *
   * Migrates server from private user caches to shared registry (app or user tier).
   * Removes from all private caches to avoid duplication.
   *
   * @param serverName - Server name
   * @param config - Server configuration
   */
  public static async promoteToSharedServer(
    serverName: string,
    config: t.ParsedServerConfig,
  ): Promise<void> {
    logger.info(`${this.prefix(serverName)} Promoting to shared server`);

    // 1. Add to shared registry (app or user tier based on config)
    await registry.addSharedServer(serverName, config);

    // 2. Remove from all private user caches
    const affectedUsers = await registry.privateServersCache.findUsersWithServer(serverName);
    if (affectedUsers.length > 0) {
      logger.debug(
        `${this.prefix(serverName)} Removing from ${affectedUsers.length} private user caches`,
      );
      await registry.privateServersCache.removeServerConfigIfCacheExists(affectedUsers, serverName);
    }

    logger.info(`${this.prefix(serverName)} Successfully promoted to shared server`);
  }

  /**
   * Demote a shared server to private registry.
   * Use case: Admin un-shares a server from PUBLIC
   *
   * Removes server from shared registry and adds to specified users' private caches.
   * Only adds to users with initialized caches.
   *
   * @param serverName - Server name
   * @param allowedUserIds - Array of user IDs who should have private access
   * @param config - Server configuration
   */
  public static async demoteToPrivateServer(
    serverName: string,
    allowedUserIds: string[],
    config: t.ParsedServerConfig,
  ): Promise<void> {
    logger.info(`${this.prefix(serverName)} Demoting to private server`);

    // 1. Remove from shared registries
    await registry.removeServer(serverName);

    // 2. Add to private caches for allowed users (only if caches exist)
    if (allowedUserIds.length > 0) {
      logger.debug(
        `${this.prefix(serverName)} Adding to ${allowedUserIds.length} users' private caches`,
      );
      await registry.privateServersCache.addServerConfigIfCacheExists(
        allowedUserIds,
        serverName,
        config,
      );
    }

    logger.info(`${this.prefix(serverName)} Successfully demoted to private server`);
  }

  // Returns formatted log prefix for server messages
  private static prefix(serverName: string): string {
    return `[MCP][PrivateServer][${serverName}]`;
  }
}
