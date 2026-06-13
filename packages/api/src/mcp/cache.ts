import { logger } from '@librechat/data-schemas';
import { MCPServersRegistry } from './registry/MCPServersRegistry';
import { MCPManager } from './MCPManager';

/**
 * Clears config-source MCP server inspection cache so servers are re-inspected on next access.
 * Best-effort disconnection of app-level connections for evicted servers.
 *
 * User-level connections (used by config-source servers) are cleaned up lazily via
 * the stale-check mechanism on the next tool call — this is an accepted design tradeoff
 * since iterating all active user sessions is expensive and config mutations are rare.
 */
export async function clearMcpConfigCache(): Promise<void> {
  let registry: MCPServersRegistry;
  try {
    registry = MCPServersRegistry.getInstance();
  } catch {
    return;
  }

  let evictedServers: string[];
  try {
    evictedServers = await registry.invalidateConfigCache();
  } catch (error) {
    logger.error('[clearMcpConfigCache] Failed to invalidate config cache:', error);
    return;
  }

  if (!evictedServers.length) {
    return;
  }

  try {
    const mcpManager = MCPManager.getInstance();
    if (mcpManager?.appConnections) {
      await Promise.allSettled(
        evictedServers.map((serverName) => mcpManager.appConnections!.disconnect(serverName)),
      );
    }
  } catch {
    // MCPManager not yet initialized — connections cleaned up lazily
  }
}
