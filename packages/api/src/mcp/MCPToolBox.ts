import { logger } from '@librechat/data-schemas';
import { MCPToolsCacheFactory } from '~/mcp/registry/cache/toolsCache/MCPToolsCacheFactory';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { mcpServersRegistry as registry } from '~/mcp/registry/MCPServersRegistry';
import type { IMCPToolsCache } from '~/mcp/registry/cache/toolsCache/IMCPToolsCache';
import type { MCPConnection } from '~/mcp/connection';
import type * as t from './types';

/**
 * MCPToolBox manages per-user MCP tool caching with staleness detection.
 *
 * Architecture:
 * - Follows same pattern as ConnectionsRepository
 * - MCPManager holds Map<userId, MCPToolBox> (parallel to userConnections)
 * - Cleaned up together with idle user connections
 * - InMemory cache lives within toolbox instance, persists during session
 *
 * Staleness Detection:
 * - Tools cached with timestamp (cachedAt)
 * - On retrieval, compares cached.cachedAt vs config.cachedAt
 * - Refetches if config was updated after tools were cached
 * - Registry-aware: Only serves tools for servers user has access to
 */
export class MCPToolBox {
  private readonly toolsCache: IMCPToolsCache;
  private readonly ownerId: string | undefined;

  constructor(ownerId?: string) {
    this.ownerId = ownerId;
    this.toolsCache = MCPToolsCacheFactory.create(ownerId || 'app');
  }

  /**
   * Gets tools for a specific server with staleness detection.
   * If cached tools are older than the server config, refetches from connection.
   */
  public async getToolsForServer(
    serverName: string,
    connection: MCPConnection,
  ): Promise<t.LCAvailableTools> {
    const serverConfig = await registry.getServerConfig(serverName, this.ownerId);
    if (!serverConfig) {
      const scope = this.ownerId ? `user ${this.ownerId}` : 'app-level';
      throw new Error(`Server "${serverName}" not found in registry for ${scope}`);
    }

    const cached = await this.toolsCache.get(serverName);

    const isStale = cached && serverConfig.cachedAt && cached.cachedAt < serverConfig.cachedAt;

    if (isStale) {
      logger.info(`[MCPToolBox] Tools stale for server "${serverName}", refetching`, {
        ownerId: this.ownerId,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        configCachedAt: serverConfig.cachedAt
          ? new Date(serverConfig.cachedAt).toISOString()
          : undefined,
      });
    }

    if (!cached || isStale) {
      const freshTools = await MCPServerInspector.getToolFunctions(serverName, connection);
      if (cached) {
        await this.toolsCache.update(serverName, freshTools);
      } else {
        await this.toolsCache.add(serverName, freshTools);
      }
      return freshTools;
    }

    return cached.tools;
  }

  /**
   * Gets all available tools across all accessible servers.
   * Only fetches tools for servers owner has access to via the registry.
   */
  public async getAllTools(connections: Map<string, MCPConnection>): Promise<t.LCAvailableTools> {
    const allTools: t.LCAvailableTools = {};

    const serverConfigs = await registry.getAllServerConfigs(this.ownerId);

    for (const [serverName, connection] of connections.entries()) {
      if (!serverConfigs[serverName]) {
        continue;
      }

      try {
        const tools = await this.getToolsForServer(serverName, connection);
        Object.assign(allTools, tools);
      } catch (error) {
        logger.warn(`[MCPToolBox] Error fetching tools for server "${serverName}"`, error);
      }
    }

    return allTools;
  }

  /**
   * Removes tools from cache when server is removed or owner loses access.
   */
  public async removeServerTools(serverName: string): Promise<void> {
    await this.toolsCache.remove(serverName);
  }

  /**
   * Clears all cached tools for this owner.
   * Called during cleanup when user connections are idle.
   */
  public async reset(): Promise<void> {
    await this.toolsCache.reset();
  }
}
