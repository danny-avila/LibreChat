import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { createConcurrencyLimiter, withTimeout } from '~/utils/promise';
import { getMCPAppToolsPublicationGeneration } from '../toolsChanged';
import { getMissingCustomUserVars } from '../utils';
import { getServerCustomUserVars } from '../auth';

const RECOVERY_CONCURRENCY = 3;
/**
 * Wall-clock deadline for one server's discovery, enforced here rather than by tuning
 * `connectionTimeout`: the factory spends that per connection attempt and makes several
 * (authenticated, then unauthenticated), so a per-attempt value bounds no total this layer
 * can reason about. The deadline holds however many attempts the factory grows.
 */
const RECOVERY_SERVER_DEADLINE_MS = 5000;
/** Ceiling on the recovery a single list request performs, whatever the server count. */
const RECOVERY_REQUEST_BUDGET_MS = 10_000;
/** How long a server that failed passive recovery is skipped before it is dialed again. */
const RECOVERY_COOLDOWN_MS = 60 * 1000;

export interface MCPServerCatalogRecoveryInput {
  serverName: string;
  serverConfig: ParsedServerConfig;
}

/**
 * Per-process record of recoveries that just failed, keyed by an opaque identity the caller
 * builds. Recovered catalogs are request-local, so without this every list request re-dials the
 * same unreachable servers.
 */
export interface MCPCatalogRecoveryCooldown {
  isCoolingDown: (identity: string) => boolean;
  recordFailure: (identity: string) => void;
  recordSuccess: (identity: string) => void;
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
  let lastSweptAt = 0;

  const sweep = (now: number): void => {
    if (now - lastSweptAt < cooldownMs) {
      return;
    }
    lastSweptAt = now;
    for (const [identity, timestamp] of failedAt) {
      if (now - timestamp >= cooldownMs) {
        failedAt.delete(identity);
      }
    }
  };

  return {
    isCoolingDown: (identity) => {
      const now = Date.now();
      sweep(now);
      const timestamp = failedAt.get(identity);
      return timestamp != null && now - timestamp < cooldownMs;
    },
    recordFailure: (identity) => {
      failedAt.set(identity, Date.now());
    },
    recordSuccess: (identity) => {
      failedAt.delete(identity);
    },
  };
}

interface RecoveryCandidate extends MCPServerCatalogRecoveryInput {
  cooldownIdentity: string;
  customUserVars?: Record<string, string>;
}

/**
 * A cooldown must not outlive the configuration that failed: correcting a server's URL or
 * transport has to be retryable at once, and the client refetches this catalog as soon as the
 * server is updated. Keying by the publication generation — the same effective-config identity
 * the tool caches fence on — means an edited server simply keys a new entry.
 */
function cooldownIdentity(
  userId: string,
  { serverName, serverConfig }: MCPServerCatalogRecoveryInput,
): string {
  try {
    return `${userId}:${serverName}:${getMCPAppToolsPublicationGeneration(serverConfig)}`;
  } catch {
    logger.debug(
      `[MCP catalog recovery] ${serverName}: cooldown falls back to config-agnostic key`,
    );
    return `${userId}:${serverName}`;
  }
}

/** Bounds one connection attempt: honours a shorter operator `initTimeout`, never the deadline. */
function resolveAttemptTimeout(serverConfig: ParsedServerConfig): number {
  const { initTimeout } = serverConfig;
  if (typeof initTimeout === 'number') {
    return Math.min(initTimeout, RECOVERY_SERVER_DEADLINE_MS);
  }
  return RECOVERY_SERVER_DEADLINE_MS;
}

/**
 * A server the config tier already marked unreachable is left to that tier's retry window, and
 * one that just failed recovery is left to its cooldown; dialing either again on this request
 * only repeats a known failure.
 */
function isRecoverable(
  { serverName, serverConfig, cooldownIdentity: identity }: RecoveryCandidate,
  cooldown?: MCPCatalogRecoveryCooldown,
): boolean {
  if (serverConfig.inspectionFailed) {
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: awaiting config-tier retry`);
    return false;
  }
  if (cooldown?.isCoolingDown(identity)) {
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: recent discovery failure`);
    return false;
  }
  return true;
}

async function discoverCandidate(
  user: IUser,
  candidate: RecoveryCandidate,
  budgetExpiresAt: number,
  deps: MCPServerCatalogRecoveryDeps,
): Promise<[string, LCAvailableTools | null]> {
  const { serverName, serverConfig, customUserVars, cooldownIdentity: identity } = candidate;
  /** Never dialing a server is not evidence against it, so an exhausted budget records no
   *  cooldown; a later request reaches it once the servers ahead are cached or cooling down. */
  if (Date.now() + RECOVERY_SERVER_DEADLINE_MS > budgetExpiresAt) {
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: request recovery budget spent`);
    return [serverName, null];
  }

  try {
    /** The deadline is what bounds this server's share of the request. `connectionTimeout` only
     *  bounds each attempt the factory makes inside it, and an attempt abandoned by the deadline
     *  still disposes its own connection when it eventually settles. */
    const result = await withTimeout(
      deps.discoverServerTools({
        user,
        serverName,
        configServers: { [serverName]: serverConfig },
        customUserVars,
        connectionTimeout: resolveAttemptTimeout(serverConfig),
      }),
      RECOVERY_SERVER_DEADLINE_MS,
      `Discovery for ${serverName} exceeded ${RECOVERY_SERVER_DEADLINE_MS}ms`,
    );
    if (result.tools == null) {
      deps.recoveryCooldown?.recordFailure(identity);
      return [serverName, null];
    }
    deps.recoveryCooldown?.recordSuccess(identity);
    return [serverName, deps.formatServerTools(serverName, result.tools)];
  } catch (error) {
    deps.recoveryCooldown?.recordFailure(identity);
    logger.error(`[MCP catalog recovery] Failed to discover tools for ${serverName}:`, error);
    return [serverName, null];
  }
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
  const recoverable = servers
    .map((server) => ({ ...server, cooldownIdentity: cooldownIdentity(user.id, server) }))
    .filter((candidate) => isRecoverable(candidate, deps.recoveryCooldown));
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

  const budgetExpiresAt = Date.now() + RECOVERY_REQUEST_BUDGET_MS;
  const recover = createConcurrencyLimiter(RECOVERY_CONCURRENCY);
  const results = await Promise.all(
    authorized.map((candidate) =>
      recover(() => discoverCandidate(user, candidate, budgetExpiresAt, deps)),
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
