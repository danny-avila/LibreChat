import { logger } from '@librechat/data-schemas';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { hasCustomUserVars, getMissingCustomUserVars } from '../utils';
import { getServerCustomUserVars } from '../auth';
import { mcpConfig } from '../mcpConfig';

/** Bounds all outbound catalog reads across this runtime. */
const CATALOG_FANOUT_CONCURRENCY = 3;
const activeCatalogLanes = new Set<CatalogWorkLane>();
const pendingCatalogLanes: CatalogWorkLane[] = [];
let activeCatalogWork = 0;
/**
 * Bounds one server's discovery end to end — connect, `tools/list` pagination, and the
 * unauthenticated fallback all draw down this single budget, so a slot is held for at most this
 * long regardless of where the server stalls. Recovery targets a server that is reachable and
 * authorized but whose catalog cache expired, and such a server answers well inside this window.
 */
const RECOVERY_BUDGET_MS = 3000;
const RECOVERY_BACKOFF_MS = [5 * 60_000, 10 * 60_000, 20 * 60_000, 30 * 60_000] as const;
const REAUTH_RETRY_MS = 30 * 60_000;
const MAX_RECOVERY_STATES = 10_000;
const recoveryStates = new Map<string, RecoveryStateEntry>();

export interface MCPServerCatalogRecoveryInput {
  serverName: string;
  serverConfig: ParsedServerConfig;
}

export interface MCPServerCatalogRecoveryDeps {
  loadUserMCPAuthMap: (
    userId: string,
    serverNames: readonly string[],
  ) => Promise<Record<string, Record<string, string>>>;
  discoverServerTools: (
    options: ToolDiscoveryOptions,
  ) => Promise<{ tools: Tool[] | null; oauthRequired?: boolean }>;
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
    options?: { deadlineMs?: number; signal?: AbortSignal },
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
  reauthRequiredServers: Set<string>;
}

interface MCPServerCatalogRecoveryResult {
  serverTools: Map<string, LCAvailableTools>;
  reauthRequiredServers: Set<string>;
}

interface MCPServerCatalogEntry extends MCPServerCatalogSnapshot {
  serverName: string;
  serverConfig: ParsedServerConfig;
  source: 'cache' | 'snapshot';
}

interface RecoveryCandidate extends MCPServerCatalogRecoveryInput {
  customUserVars?: Record<string, string>;
}

type RecoveryOutcome = {
  serverName: string;
  tools: LCAvailableTools | null;
  state?: 'reauth_required' | 'backoff';
};

interface RecoveryStateEntry {
  configFingerprint: string;
  failureCount: number;
  nextRetryAt: number;
  lastTouchedAt: number;
  outcome?: RecoveryOutcome;
  inFlight?: Promise<RecoveryOutcome>;
}

interface CatalogWorkLane {
  tasks: ReadonlyArray<() => Promise<void>>;
  resolve: (admitted: boolean) => void;
  nextIndex: number;
  inFlight: number;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class MCPCatalogCapacityError extends Error {
  readonly code = 'MCP_CATALOG_CAPACITY';

  constructor() {
    super('MCP catalog capacity is temporarily exhausted');
    this.name = 'MCPCatalogCapacityError';
  }
}

/** Bounds one server's discovery, honouring a shorter operator `initTimeout`. */
function resolveBudget(serverConfig: ParsedServerConfig): number {
  const { initTimeout } = serverConfig;
  if (typeof initTimeout === 'number') {
    return Math.min(initTimeout, RECOVERY_BUDGET_MS);
  }
  return RECOVERY_BUDGET_MS;
}

function getRecoveryKey(userId: string, serverName: string): string {
  return `${userId}\u0000${serverName}`;
}

function getConfigFingerprint(serverConfig: ParsedServerConfig): string {
  return JSON.stringify(serverConfig);
}

function trimRecoveryStates(): void {
  while (recoveryStates.size > MAX_RECOVERY_STATES) {
    let oldest: [string, RecoveryStateEntry] | undefined;
    for (const entry of recoveryStates) {
      if (entry[1].inFlight != null) {
        continue;
      }
      if (oldest == null || entry[1].lastTouchedAt < oldest[1].lastTouchedAt) {
        oldest = entry;
      }
    }
    if (oldest == null) {
      return;
    }
    recoveryStates.delete(oldest[0]);
  }
}

/** Clears passive discovery suppression when an explicit reconnect changes authorization state. */
export function clearMCPServerCatalogRecoveryState(userId: string, serverName?: string): void {
  if (serverName != null) {
    recoveryStates.delete(getRecoveryKey(userId, serverName));
    return;
  }
  const prefix = `${userId}\u0000`;
  for (const key of recoveryStates.keys()) {
    if (key.startsWith(prefix)) {
      recoveryStates.delete(key);
    }
  }
}

async function discoverCandidate(
  user: IUser,
  { serverName, serverConfig, customUserVars }: RecoveryCandidate,
  deps: MCPServerCatalogRecoveryDeps,
  signal?: AbortSignal,
): Promise<RecoveryOutcome> {
  try {
    const result = await deps.discoverServerTools({
      user,
      serverName,
      configServers: { [serverName]: serverConfig },
      customUserVars,
      deadlineMs: Date.now() + resolveBudget(serverConfig),
      signal,
    });
    const tools = result.tools == null ? null : deps.formatServerTools(serverName, result.tools);
    if (result.oauthRequired === true) {
      return { serverName, tools, state: 'reauth_required' };
    }
    if (signal?.aborted) {
      return { serverName, tools: null };
    }
    return {
      serverName,
      tools,
      ...(tools == null && { state: 'backoff' as const }),
    };
  } catch (error) {
    if (signal?.aborted) {
      return { serverName, tools: null };
    }
    /** Discovery raises `InvalidRequest` precisely when configuration makes the attempt
     *  impossible — domain policy, unresolved placeholders, missing runtime fields. That
     *  failure recurs on every request until an admin changes configuration, so it is
     *  expected state, logged at the same level as this file's other config-proven skips. */
    if (error instanceof McpError && error.code === ErrorCode.InvalidRequest) {
      logger.debug(
        `[MCP catalog recovery] ${serverName} is not recoverable under current configuration: ${error.message}`,
      );
      return { serverName, tools: null, state: 'backoff' };
    }
    logger.error(`[MCP catalog recovery] Failed to discover tools for ${serverName}:`, error);
    return { serverName, tools: null, state: 'backoff' };
  }
}

function discoverCandidateOnce(
  user: IUser,
  candidate: RecoveryCandidate,
  deps: MCPServerCatalogRecoveryDeps,
  signal?: AbortSignal,
): Promise<RecoveryOutcome> {
  const key = getRecoveryKey(user.id, candidate.serverName);
  const configFingerprint = getConfigFingerprint(candidate.serverConfig);
  const now = Date.now();
  const existing = recoveryStates.get(key);
  if (existing?.configFingerprint === configFingerprint) {
    existing.lastTouchedAt = now;
    if (existing.inFlight != null) {
      return existing.inFlight;
    }
    if (existing.outcome != null && existing.nextRetryAt > now) {
      return Promise.resolve(existing.outcome);
    }
  }

  const entry: RecoveryStateEntry = {
    configFingerprint,
    failureCount: existing?.configFingerprint === configFingerprint ? existing.failureCount : 0,
    nextRetryAt: 0,
    lastTouchedAt: now,
  };
  const discovery = discoverCandidate(user, candidate, deps, signal)
    .then((outcome) => {
      if (recoveryStates.get(key) !== entry) {
        return outcome;
      }
      entry.lastTouchedAt = Date.now();
      if (outcome.state === 'reauth_required') {
        entry.failureCount = 0;
        entry.nextRetryAt = entry.lastTouchedAt + REAUTH_RETRY_MS;
        /** Keep the authorization decision, but never promote an unfenced discovery catalog
         * into a cross-request cache. The configured server still appears with no tools. */
        entry.outcome = { ...outcome, tools: null };
      } else if (outcome.state === 'backoff') {
        const delay =
          RECOVERY_BACKOFF_MS[Math.min(entry.failureCount, RECOVERY_BACKOFF_MS.length - 1)];
        entry.failureCount += 1;
        entry.nextRetryAt = entry.lastTouchedAt + delay;
        entry.outcome = outcome;
      } else {
        recoveryStates.delete(key);
      }
      return outcome;
    })
    .finally(() => {
      if (recoveryStates.get(key) === entry) {
        entry.inFlight = undefined;
      }
    });
  entry.inFlight = discovery;
  recoveryStates.set(key, entry);
  trimRecoveryStates();
  return discovery;
}

function finishCatalogLane(lane: CatalogWorkLane): void {
  if (lane.nextIndex < lane.tasks.length || lane.inFlight > 0) {
    return;
  }
  activeCatalogLanes.delete(lane);
  if (lane.signal != null && lane.onAbort != null) {
    lane.signal.removeEventListener('abort', lane.onAbort);
  }
  lane.resolve(true);
}

/** Shares the fixed process budget round-robin across at most three request lanes. */
function scheduleCatalogWork(): void {
  while (activeCatalogWork < CATALOG_FANOUT_CONCURRENCY && pendingCatalogLanes.length > 0) {
    const lane = pendingCatalogLanes.shift();
    if (lane == null) {
      return;
    }
    const task = lane.tasks[lane.nextIndex];
    lane.nextIndex += 1;
    lane.inFlight += 1;
    activeCatalogWork += 1;
    if (lane.nextIndex < lane.tasks.length) {
      pendingCatalogLanes.push(lane);
    }
    void task()
      .catch((error) => {
        logger.error('[MCP catalog] Scheduled outbound work failed:', error);
      })
      .finally(() => {
        lane.inFlight -= 1;
        activeCatalogWork -= 1;
        finishCatalogLane(lane);
        scheduleCatalogWork();
      });
  }
}

function runCatalogWork(
  tasks: ReadonlyArray<() => Promise<void>>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (tasks.length === 0) {
    return Promise.resolve(true);
  }
  if (signal?.aborted) {
    return Promise.resolve(true);
  }
  if (activeCatalogLanes.size >= CATALOG_FANOUT_CONCURRENCY) {
    logger.debug('[MCP catalog] Skipping request: outbound capacity reached');
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const lane: CatalogWorkLane = {
      tasks,
      resolve,
      nextIndex: 0,
      inFlight: 0,
      signal,
    };
    lane.onAbort = () => {
      lane.nextIndex = lane.tasks.length;
      for (let index = pendingCatalogLanes.length - 1; index >= 0; index -= 1) {
        if (pendingCatalogLanes[index] === lane) {
          pendingCatalogLanes.splice(index, 1);
        }
      }
      finishCatalogLane(lane);
    };
    signal?.addEventListener('abort', lane.onAbort, { once: true });
    activeCatalogLanes.add(lane);
    pendingCatalogLanes.push(lane);
    scheduleCatalogWork();
  });
}

/**
 * Passively discovers cold MCP catalogs for one request.
 *
 * A recovered catalog cannot enter the authoritative tool cache: a discovery connection owns no
 * publication generation and is disposed. Process-local recovery state therefore retains only
 * enough information to coalesce concurrent requests and suppress repeated failed/OAuth attempts;
 * successful ordinary catalogs remain request-local.
 */
async function recoverMCPServerCatalogsWithState(
  params: {
    user: IUser;
    servers: readonly MCPServerCatalogRecoveryInput[];
    signal?: AbortSignal;
  },
  deps: MCPServerCatalogRecoveryDeps,
): Promise<MCPServerCatalogRecoveryResult> {
  const { user, servers, signal } = params;
  /** Only the config tier retries a failed stub on its own clock. A `yaml`- or `user`-sourced
   *  stub has no such timer, so skipping it unconditionally would hide the server for good —
   *  exactly the state this recovery exists to escape. */
  const recoverable = servers.filter(({ serverName, serverConfig }) => {
    if (!serverConfig.inspectionFailed || serverConfig.source !== 'config') {
      return true;
    }
    logger.debug(`[MCP catalog recovery] Skipping ${serverName}: awaiting config-tier retry`);
    return false;
  });
  if (recoverable.length === 0) {
    return { serverTools: new Map(), reauthRequiredServers: new Set() };
  }

  /** Only credential-bearing servers can consume the auth map, so a list without any avoids
   *  the plugin-auth round trip entirely. */
  const credentialServers = recoverable.filter(({ serverConfig }) =>
    hasCustomUserVars(serverConfig),
  );
  const userMCPAuthMap = credentialServers.length
    ? await deps.loadUserMCPAuthMap(
        user.id,
        credentialServers.map(({ serverName }) => serverName),
      )
    : {};

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
    return { serverTools: new Map(), reauthRequiredServers: new Set() };
  }

  const results: Array<RecoveryOutcome | undefined> = [];
  const admitted = await runCatalogWork(
    authorized.map((candidate, index) => async () => {
      results[index] = await discoverCandidateOnce(user, candidate, deps, signal);
    }),
    signal,
  );
  if (!admitted) {
    throw new MCPCatalogCapacityError();
  }

  const serverTools = new Map<string, LCAvailableTools>();
  const reauthRequiredServers = new Set<string>();
  for (const result of results) {
    if (result?.tools != null) {
      serverTools.set(result.serverName, result.tools);
    }
    if (result?.state === 'reauth_required') {
      reauthRequiredServers.add(result.serverName);
    }
  }
  return { serverTools, reauthRequiredServers };
}

/** Preserves the public recovery helper's Map contract for existing package consumers. */
export async function recoverMCPServerCatalogs(
  params: {
    user: IUser;
    servers: readonly MCPServerCatalogRecoveryInput[];
    signal?: AbortSignal;
  },
  deps: MCPServerCatalogRecoveryDeps,
): Promise<Map<string, LCAvailableTools>> {
  return (await recoverMCPServerCatalogsWithState(params, deps)).serverTools;
}

/** Loads cached, connected, then passive MCP catalogs for a marketplace-style list request. */
export async function loadMCPServerCatalogs(
  params: {
    user: IUser;
    servers: readonly MCPServerCatalogRecoveryInput[];
    signal?: AbortSignal;
  },
  deps: MCPServerCatalogLoaderDeps,
): Promise<MCPServerCatalogLoaderResult> {
  const { user, servers, signal } = params;
  const cached: MCPServerCatalogEntry[] = await Promise.all(
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

  const snapshots = [...cached];
  const snapshotsAdmitted = await runCatalogWork(
    cached.flatMap((entry, index) =>
      entry.tools != null
        ? []
        : [
            async () => {
              try {
                const snapshot = await deps.getServerToolFunctionsSnapshot(
                  user.id,
                  entry.serverName,
                  entry.serverConfig,
                  { deadlineMs: Date.now() + mcpConfig.TOOLS_LIST_TIMEOUT_MS, signal },
                );
                snapshots[index] = { ...entry, ...snapshot, source: 'snapshot' as const };
              } catch (error) {
                logger.error(
                  `[MCP catalog loader] Failed to read connected tools for ${entry.serverName}:`,
                  error,
                );
                snapshots[index] = { ...entry, tools: null, source: 'snapshot' as const };
              }
            },
          ],
    ),
    signal,
  );
  if (!snapshotsAdmitted) {
    throw new MCPCatalogCapacityError();
  }

  const coldServers = snapshots
    .filter(({ tools }) => tools == null)
    .map(({ serverName, serverConfig }) => ({ serverName, serverConfig }));
  let recovered: MCPServerCatalogRecoveryResult = {
    serverTools: new Map(),
    reauthRequiredServers: new Set(),
  };
  if (coldServers.length > 0) {
    try {
      recovered = await recoverMCPServerCatalogsWithState(
        { user, servers: coldServers, signal },
        deps,
      );
    } catch (error) {
      if (error instanceof MCPCatalogCapacityError) {
        throw error;
      }
      logger.error('[MCP catalog loader] Failed to recover cold server catalogs:', error);
    }
  }

  const serverTools = new Map<string, LCAvailableTools>();
  const serversWithoutTools: string[] = [];
  for (const snapshot of snapshots) {
    const tools = snapshot.tools ?? recovered.serverTools.get(snapshot.serverName);
    if (tools == null) {
      serversWithoutTools.push(snapshot.serverName);
      continue;
    }
    serverTools.set(snapshot.serverName, tools);
    if (snapshot.tools != null) {
      clearMCPServerCatalogRecoveryState(user.id, snapshot.serverName);
    }

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

  return {
    serverTools,
    serversWithoutTools,
    reauthRequiredServers: recovered.reauthRequiredServers,
  };
}
