import { registryStatusCache as statusCache } from './cache/RegistryStatusCache';
import { isLeader } from '~/cluster';
import { withTimeout } from '~/utils';
import { logger } from '@librechat/data-schemas';
import { ParsedServerConfig } from '~/mcp/types';
import { sanitizeUrlForLogging } from '~/mcp/utils';
import type * as t from '~/mcp/types';
import { MCPServersRegistry } from './MCPServersRegistry';

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
  private static hasInitializedThisProcess = false;

  /** Reset the process-level initialization flag. Only used for testing. */
  public static resetProcessFlag(): void {
    MCPServersInitializer.hasInitializedThisProcess = false;
  }

  public static async initialize(rawConfigs: t.MCPServers): Promise<void> {
    // On first call in this process, always reset and re-initialize
    // This ensures we don't use stale Redis data from previous runs
    const isFirstCallThisProcess = !MCPServersInitializer.hasInitializedThisProcess;
    // Set flag immediately so recursive calls (from followers) use Redis cache for coordination
    MCPServersInitializer.hasInitializedThisProcess = true;

    if (!isFirstCallThisProcess && (await statusCache.isInitialized())) return;

    if (await isLeader()) {
      // Leader performs initialization - always reset on first call
      await statusCache.reset();
      await MCPServersRegistry.getInstance().reset();
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
  public static async initializeServer(serverName: string, rawConfig: t.MCPOptions): Promise<void> {
    try {
      const result = await MCPServersRegistry.getInstance().addServer(
        serverName,
        rawConfig,
        'CACHE',
      );
      MCPServersInitializer.logParsedConfig(serverName, result.config);
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
