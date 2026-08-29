import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { createConcurrencyLimiter } from '~/utils/promise';
import { getMissingCustomUserVars } from '../utils';
import { getServerCustomUserVars } from '../auth';

const RECOVERY_CONCURRENCY = 3;
/**
 * Passive recovery runs inline on a catalog list request, so an unreachable server must not
 * hold the response for the connection default (`initTimeout ?? 30s`). A server configured to
 * connect faster keeps its own shorter limit.
 */
const RECOVERY_TIMEOUT_MS = 5000;
/** How long a server that failed passive recovery is skipped before it is dialed again. */
const RECOVERY_COOLDOWN_MS = 60 * 1000;

export interface MCPServerCatalogRecoveryInput {
  serverName: string;
  serverConfig: ParsedServerConfig;
}

/**
 * Per-process record of servers whose passive recovery just failed. Recovered catalogs are
 * request-local, so without it every list request re-dials the same unreachable servers.
 */
export interface MCPCatalogRecoveryCooldown {
  isCoolingDown: (userId: string, serverName: string) => boolean;
  recordFailure: (userId: string, serverName: string) => void;
  recordSuccess: (userId: string, serverName: string) => void;
}

export interface MCPServerCatalogRecoveryDeps {
  loadUserMCPAuthMap: (
    userId: string,
    serverNames: readonly string[],
  ) => Promise<Record<string, Record<string, string>>>;
  discoverServerTools: (options: ToolDiscoveryOptions) => Promise<{ tools: Tool[] | null }>;
  formatServerTools: (serverName: string, tools: Tool[]) => LCAvailableTools;
  recoveryCooldown?: MCPCatalogRecoveryCooldown;
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
 * Creates the failure cooldown shared by every request in one process. Entries expire on their
 * own, and an expired sweep runs at most once per window so lookups stay amortized constant.
 */
export function createMCPCatalogRecoveryCooldown(
  cooldownMs: number = RECOVERY_COOLDOWN_MS,
): MCPCatalogRecoveryCooldown {
  const failedAt = new Map<string, number>();
  const cooldownKey = (userId: string, serverName: string): string => `${userId}:${serverName}`;
  let lastSweptAt = 0;

  const sweep = (now: number): void => {
    if (now - lastSweptAt < cooldownMs) {
      return;
    }
    lastSweptAt = now;
    for (const [key, timestamp] of failedAt) {
      if (now - timestamp >= cooldownMs) {
        failedAt.delete(key);
      }
    }
  };

  return {
    isCoolingDown: (userId, serverName) => {
      const now = Date.now();
      sweep(now);
      const timestamp = failedAt.get(cooldownKey(userId, serverName));
      return timestamp != null && now - timestamp < cooldownMs;
    },
    recordFailure: (userId, serverName) => {
      failedAt.set(cooldownKey(userId, serverName), Date.now());
    },
    recordSuccess: (userId, serverName) => {
      failedAt.delete(cooldownKey(userId, serverName));
    },
  };
}

function resolveRecoveryTimeout(serverConfig: ParsedServerConfig): number {
  const { initTimeout } = serverConfig;
  if (typeof initTimeout === 'number') {
    return Math.min(initTimeout, RECOVERY_TIMEOUT_MS);
  }
  return RECOVERY_TIMEOUT_MS;
}

/**
 * A server the config tier already marked unreachable is left to that tier's retry window, and
 * one that just failed recovery is left to its cooldown; dialing either again on this request
 * only repeats a known failure.
 */
function isRecoverable(
  userId: string,
  { serverName, serverConfig }: MCPServerCatalogRecoveryInput,
  cooldown?: MCPCatalogRecoveryCooldown,
): boolean {
  if (serverConfig.inspectionFailed) {
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: awaiting config-tier retry`);
    return false;
  }
  if (cooldown?.isCoolingDown(userId, serverName)) {
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: recent discovery failure`);
    return false;
  }
  return true;
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
  const recoverable = servers.filter((server) =>
    isRecoverable(user.id, server, deps.recoveryCooldown),
  );
  if (recoverable.length === 0) {
    return new Map();
  }

  const userMCPAuthMap = await deps.loadUserMCPAuthMap(
    user.id,
    recoverable.map(({ serverName }) => serverName),
  );

  /** A server missing its user-provided credentials fails auth on connect (see issue #10969),
   *  so discovering it would spend a doomed connection on every request. */
  const authorized: Array<
    MCPServerCatalogRecoveryInput & { customUserVars?: Record<string, string> }
  > = [];
  for (const server of recoverable) {
    const customUserVars = getServerCustomUserVars(userMCPAuthMap, server.serverName);
    const missingUserVars = getMissingCustomUserVars(server.serverConfig, customUserVars);
    if (missingUserVars.length > 0) {
      logger.debug(
        `[MCP catalog recovery] Skipping ${server.serverName}: ${missingUserVars.length} user-provided variable(s) unset`,
      );
      continue;
    }
    authorized.push({ ...server, customUserVars });
  }
  if (authorized.length === 0) {
    return new Map();
  }

  const recover = createConcurrencyLimiter(RECOVERY_CONCURRENCY);
  const results = await Promise.all(
    authorized.map(({ serverName, serverConfig, customUserVars }) =>
      recover(async (): Promise<[string, LCAvailableTools | null]> => {
        try {
          const result = await deps.discoverServerTools({
            user,
            serverName,
            configServers: { [serverName]: serverConfig },
            customUserVars,
            connectionTimeout: resolveRecoveryTimeout(serverConfig),
          });
          if (result.tools == null) {
            deps.recoveryCooldown?.recordFailure(user.id, serverName);
            return [serverName, null];
          }
          deps.recoveryCooldown?.recordSuccess(user.id, serverName);
          return [serverName, deps.formatServerTools(serverName, result.tools)];
        } catch (error) {
          deps.recoveryCooldown?.recordFailure(user.id, serverName);
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
