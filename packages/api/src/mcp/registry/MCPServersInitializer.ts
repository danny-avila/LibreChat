import { registryStatusCache as statusCache } from './cache/RegistryStatusCache';
import { isLeader } from '~/cluster';
import { withTimeout } from '~/utils';
import { logger } from '@librechat/data-schemas';
import { MCPServerInspector } from './MCPServerInspector';
import { ParsedServerConfig } from '~/mcp/types';
import { sanitizeUrlForLogging } from '~/mcp/utils';
import type * as t from '~/mcp/types';
import { mcpServersRegistry as registry } from './MCPServersRegistry';

const MCP_INIT_TIMEOUT_MS =
  process.env.MCP_INIT_TIMEOUT_MS != null ? parseInt(process.env.MCP_INIT_TIMEOUT_MS) : 30_000;

/**
 * Handles initialization of MCP servers at application startup with distributed coordination.
 * In cluster environments, ensures only the leader node performs initialization while followers wait.
 * Connects to each configured MCP server, inspects capabilities and tools, then caches the results.
 * Categorizes servers as either shared app servers (auto-started) or shared user servers (OAuth/on-demand).
 * Uses a timeout mechanism to prevent hanging on unresponsive servers during initialization.
 */
export class MCPServersInitializer {
  /**
   * Initializes MCP servers with distributed leader-follower coordination.
   *
   * Design rationale:
   * - Handles leader crash scenarios: If the leader crashes during initialization, all followers
   *   will independently attempt initialization after a 3-second delay. The first to become leader
   *   will complete the initialization.
   * - Only the leader performs the actual initialization work (reset caches, inspect servers).
   *   When complete, the leader signals completion via `statusCache`, allowing followers to proceed.
   * - Followers wait and poll `statusCache` until the leader finishes, ensuring only one node
   *   performs the expensive initialization operations.
   */
  public static async initialize(rawConfigs: t.MCPServers): Promise<void> {
    if (await statusCache.isInitialized()) return;

    if (await isLeader()) {
      // Leader performs initialization
      await statusCache.reset();
      await registry.reset();
      const serverNames = Object.keys(rawConfigs);
      await Promise.allSettled(
        serverNames.map((serverName) =>
          withTimeout(
            MCPServersInitializer.initializeServer(serverName, rawConfigs[serverName]),
            MCP_INIT_TIMEOUT_MS,
            `${MCPServersInitializer.prefix(serverName)} Server initialization timed out`,
            logger.error,
          ),
        ),
      );
      await statusCache.setInitialized(true);
    } else {
      // Followers try again after a delay if not initialized
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.initialize(rawConfigs);
    }
  }

  /** Initializes a single server with all its metadata and adds it to appropriate collections */
  private static async initializeServer(
    serverName: string,
    rawConfig: t.MCPOptions,
  ): Promise<void> {
    try {
      const config = await MCPServerInspector.inspect(serverName, rawConfig);

      if (config.startup === false || config.requiresOAuth) {
        await registry.sharedUserServers.add(serverName, config);
      } else {
        await registry.sharedAppServers.add(serverName, config);
      }
      MCPServersInitializer.logParsedConfig(serverName, config);
    } catch (error) {
      logger.error(`${MCPServersInitializer.prefix(serverName)} Failed to initialize:`, error);
    }
  }

  // Logs server configuration summary after initialization
  private static logParsedConfig(serverName: string, config: ParsedServerConfig): void {
    const prefix = MCPServersInitializer.prefix(serverName);
    logger.info(`${prefix} -------------------------------------------------┐`);
    logger.info(`${prefix} URL: ${config.url ? sanitizeUrlForLogging(config.url) : 'N/A'}`);
    logger.info(`${prefix} OAuth Required: ${config.requiresOAuth}`);
    logger.info(`${prefix} Capabilities: ${config.capabilities}`);
    logger.info(`${prefix} Tools: ${config.tools}`);
    logger.info(`${prefix} Server Instructions: ${config.serverInstructions}`);
    logger.info(`${prefix} Initialized in: ${config.initDuration ?? 'N/A'}ms`);
    logger.info(`${prefix} -------------------------------------------------┘`);
  }

  // Returns formatted log prefix for server messages
  private static prefix(serverName: string): string {
    return `[MCP][${serverName}]`;
  }
}
