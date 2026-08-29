import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { createConcurrencyLimiter } from '~/utils/promise';
import { getMissingCustomUserVars } from '../utils';
import { getServerCustomUserVars } from '../auth';

const RECOVERY_CONCURRENCY = 3;
/**
 * Recovery exists for a server that is reachable and authorized but whose catalog cache expired,
 * and such a server answers `tools/list` well inside this window. Anything slower is a server
 * recovery cannot rescue anyway, so failing fast costs nothing and keeps the request responsive.
 *
 * This bounds one connection attempt, which is the unit the factory actually spends:
 * `MCPConnectionFactory.discoverToolsInternal` uses it for the authenticated connection and again
 * for the unauthenticated listing, so a server's ceiling is this value times the attempts made.
 * Bounding the work rather than racing it keeps the concurrency limit honest — a slot is held for
 * exactly as long as its network operation runs.
 */
const RECOVERY_ATTEMPT_TIMEOUT_MS = 1500;

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

interface RecoveryCandidate extends MCPServerCatalogRecoveryInput {
  customUserVars?: Record<string, string>;
}

/** Bounds one connection attempt, honouring a shorter operator `initTimeout`. */
function resolveAttemptTimeout(serverConfig: ParsedServerConfig): number {
  const { initTimeout } = serverConfig;
  if (typeof initTimeout === 'number') {
    return Math.min(initTimeout, RECOVERY_ATTEMPT_TIMEOUT_MS);
  }
  return RECOVERY_ATTEMPT_TIMEOUT_MS;
}

async function discoverCandidate(
  user: IUser,
  { serverName, serverConfig, customUserVars }: RecoveryCandidate,
  deps: MCPServerCatalogRecoveryDeps,
): Promise<[string, LCAvailableTools | null]> {
  try {
    const result = await deps.discoverServerTools({
      user,
      serverName,
      configServers: { [serverName]: serverConfig },
      customUserVars,
      connectionTimeout: resolveAttemptTimeout(serverConfig),
    });
    return [
      serverName,
      result.tools == null ? null : deps.formatServerTools(serverName, result.tools),
    ];
  } catch (error) {
    logger.error(`[MCP catalog recovery] Failed to discover tools for ${serverName}:`, error);
    return [serverName, null];
  }
}

/**
 * Passively discovers cold MCP catalogs for one request.
 *
 * A recovered catalog cannot be retained: a discovery connection owns no publication generation
 * and is disposed, and the tool cache refuses unfenced writes, so the result is served only to
 * the requesting user. Recovery therefore stays stateless and individually cheap rather than
 * scheduling around a result it is not allowed to keep — it skips only what configuration alone
 * proves pointless, and fails fast on everything else.
 */
export async function recoverMCPServerCatalogs(
  params: { user: IUser; servers: readonly MCPServerCatalogRecoveryInput[] },
  deps: MCPServerCatalogRecoveryDeps,
): Promise<Map<string, LCAvailableTools>> {
  const { user, servers } = params;
  /** The config tier owns its own retry window for a server it already found unreachable. */
  const recoverable = servers.filter(({ serverName, serverConfig }) => {
    if (!serverConfig.inspectionFailed) {
      return true;
    }
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: awaiting config-tier retry`);
    return false;
  });
  if (recoverable.length === 0) {
    return new Map();
  }

  const userMCPAuthMap = await deps.loadUserMCPAuthMap(
    user.id,
    recoverable.map(({ serverName }) => serverName),
  );

  /** A server missing its user-provided credentials fails auth on connect (see issue #10969),
   *  so discovering it would spend a doomed connection on every request. */
  const authorized: RecoveryCandidate[] = [];
  for (const candidate of recoverable) {
    const customUserVars = getServerCustomUserVars(userMCPAuthMap, candidate.serverName);
    const missingUserVars = getMissingCustomUserVars(candidate.serverConfig, customUserVars);
    if (missingUserVars.length > 0) {
      logger.debug(
        `[MCP catalog recovery] Skipping ${candidate.serverName}: ${missingUserVars.length} user-provided variable(s) unset`,
      );
      continue;
    }
    authorized.push({ ...candidate, customUserVars });
  }
  if (authorized.length === 0) {
    return new Map();
  }

  const recover = createConcurrencyLimiter(RECOVERY_CONCURRENCY);
  const results = await Promise.all(
    authorized.map((candidate) => recover(() => discoverCandidate(user, candidate, deps))),
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
