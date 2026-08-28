import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { createConcurrencyLimiter } from '~/utils/promise';
import { getServerCustomUserVars } from '../auth';

const RECOVERY_CONCURRENCY = 3;

export interface MCPServerCatalogRecoveryInput {
  serverName: string;
  serverConfig: ParsedServerConfig;
}

export interface MCPServerCatalogRecoveryDeps {
  loadUserMCPAuthMap: (
    userId: string,
    serverNames: readonly string[],
  ) => Promise<Record<string, Record<string, string>>>;
  discoverServerTools: (options: ToolDiscoveryOptions) => Promise<{ tools: Tool[] | null }>;
  formatServerTools: (serverName: string, tools: Tool[]) => LCAvailableTools;
}

export interface MCPServerCatalogSnapshot {
  tools: LCAvailableTools | null;
  publicationGeneration?: string;
  publicationRevision?: string;
}

export interface MCPServerCatalogLoaderDeps extends MCPServerCatalogRecoveryDeps {
  getCachedServerTools: (
    userId: string,
    serverName: string,
    serverConfig: ParsedServerConfig,
  ) => Promise<LCAvailableTools | null>;
  getServerToolFunctionsSnapshot: (
    userId: string,
    serverName: string,
    serverConfig: ParsedServerConfig,
  ) => Promise<MCPServerCatalogSnapshot>;
  cacheServerTools: (params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig: ParsedServerConfig;
    publicationGeneration?: string;
    publicationRevision?: string;
  }) => Promise<void>;
}

export interface MCPServerCatalogLoaderResult {
  serverTools: Map<string, LCAvailableTools>;
  serversWithoutTools: string[];
}

/**
 * Passively discovers cold MCP catalogs for one request. Results are intentionally not cached:
 * discovery connections do not own a publication generation, so publishing them could overwrite
 * a newer user or app catalog. Callers may still serve the isolated result to the current user.
 */
export async function recoverMCPServerCatalogs(
  params: { user: IUser; servers: readonly MCPServerCatalogRecoveryInput[] },
  deps: MCPServerCatalogRecoveryDeps,
): Promise<Map<string, LCAvailableTools>> {
  const { user, servers } = params;
  if (servers.length === 0) {
    return new Map();
  }

  const serverNames = servers.map(({ serverName }) => serverName);
  const userMCPAuthMap = await deps.loadUserMCPAuthMap(user.id, serverNames);
  const recover = createConcurrencyLimiter(RECOVERY_CONCURRENCY);
  const results = await Promise.all(
    servers.map(({ serverName, serverConfig }) =>
      recover(async (): Promise<[string, LCAvailableTools | null]> => {
        try {
          const result = await deps.discoverServerTools({
            user,
            serverName,
            configServers: { [serverName]: serverConfig },
            customUserVars: getServerCustomUserVars(userMCPAuthMap, serverName),
          });
          return [
            serverName,
            result.tools == null ? null : deps.formatServerTools(serverName, result.tools),
          ];
        } catch (error) {
          logger.error(`[MCP catalog recovery] Failed to discover tools for ${serverName}:`, error);
          return [serverName, null];
        }
      }),
    ),
  );

  return new Map(results.filter((entry): entry is [string, LCAvailableTools] => entry[1] != null));
}

/** Loads cached, connected, then passive MCP catalogs for a marketplace-style list request. */
export async function loadMCPServerCatalogs(
  params: { user: IUser; servers: readonly MCPServerCatalogRecoveryInput[] },
  deps: MCPServerCatalogLoaderDeps,
): Promise<MCPServerCatalogLoaderResult> {
  const { user, servers } = params;
  const cached = await Promise.all(
    servers.map(async ({ serverName, serverConfig }) => {
      try {
        const tools = await deps.getCachedServerTools(user.id, serverName, serverConfig);
        return { serverName, serverConfig, tools, source: 'cache' as const };
      } catch (error) {
        logger.error(`[MCP catalog loader] Failed to read cached tools for ${serverName}:`, error);
        return { serverName, serverConfig, tools: null, source: 'cache' as const };
      }
    }),
  );

  const snapshots = await Promise.all(
    cached.map(async (entry) => {
      if (entry.tools != null) {
        return entry;
      }
      try {
        const snapshot = await deps.getServerToolFunctionsSnapshot(
          user.id,
          entry.serverName,
          entry.serverConfig,
        );
        return { ...entry, ...snapshot, source: 'snapshot' as const };
      } catch (error) {
        logger.error(
          `[MCP catalog loader] Failed to read connected tools for ${entry.serverName}:`,
          error,
        );
        return { ...entry, tools: null, source: 'snapshot' as const };
      }
    }),
  );

  const coldServers = snapshots
    .filter(({ tools }) => tools == null)
    .map(({ serverName, serverConfig }) => ({ serverName, serverConfig }));
  let recovered = new Map<string, LCAvailableTools>();
  if (coldServers.length > 0) {
    try {
      recovered = await recoverMCPServerCatalogs({ user, servers: coldServers }, deps);
    } catch (error) {
      logger.error('[MCP catalog loader] Failed to recover cold server catalogs:', error);
    }
  }

  const serverTools = new Map<string, LCAvailableTools>();
  const serversWithoutTools: string[] = [];
  for (const snapshot of snapshots) {
    const tools = snapshot.tools ?? recovered.get(snapshot.serverName);
    if (tools == null) {
      serversWithoutTools.push(snapshot.serverName);
      continue;
    }
    serverTools.set(snapshot.serverName, tools);

    if (snapshot.source !== 'snapshot' || snapshot.tools == null) {
      continue;
    }
    void deps
      .cacheServerTools({
        userId: user.id,
        serverName: snapshot.serverName,
        serverTools: snapshot.tools,
        serverConfig: snapshot.serverConfig,
        publicationGeneration: snapshot.publicationGeneration,
        publicationRevision: snapshot.publicationRevision,
      })
      .catch((error) =>
        logger.error(
          `[MCP catalog loader] Failed to cache tools for ${snapshot.serverName}:`,
          error,
        ),
      );
  }

  return { serverTools, serversWithoutTools };
}
