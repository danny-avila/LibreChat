import { Keyv } from 'keyv';
import { createHash } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from './ServerConfigsRepositoryInterface';
import type * as t from '~/mcp/types';
import {
  ServerConfigsCacheFactory,
  APP_CACHE_NAMESPACE,
  CONFIG_CACHE_NAMESPACE,
} from './cache/ServerConfigsCacheFactory';
import { MCPInspectionFailedError, isMCPDomainNotAllowedError } from '~/mcp/errors';
import { MCPServerInspector } from './MCPServerInspector';
import { ServerConfigsDB } from './db/ServerConfigsDB';
import { cacheConfig } from '~/cache/cacheConfig';
import { withTimeout } from '~/utils';

/** How long a failure stub is considered fresh before re-attempting inspection (5 minutes). */
const CONFIG_STUB_RETRY_MS = 5 * 60 * 1000;

/**
 * Fields an admin override can legitimately set. Used to detect whether a
 * resolved entry differs from its YAML base so unmodified YAML servers can
 * skip lazy-init (avoids per-request inspect storms and prevents these
 * servers from being cached in the config tier).
 */
const ADMIN_CONFIGURABLE_FIELDS = [
  'type',
  'command',
  'args',
  'env',
  'stderr',
  'url',
  'headers',
  'proxy',
  'requiresOAuth',
  'apiKey',
  'oauth',
  'oauth_headers',
  'title',
  'description',
  'iconPath',
  'startup',
  'chatMenu',
  'serverInstructions',
  'customUserVars',
  'timeout',
  'sseReadTimeout',
  'initTimeout',
] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

const CONFIG_SERVER_INIT_TIMEOUT_MS = (() => {
  const raw = process.env.MCP_INIT_TIMEOUT_MS;
  if (raw == null) {
    return 30_000;
  }
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

/** Request context for resolving the effective MCP allowlists. */
export interface MCPAllowlistContext {
  userId?: string;
  role?: string;
}

/**
 * Resolves the effective `mcpSettings` allowlists for a request. Injected from the app
 * layer (where the merged, tenant-scoped config lives) so the registry keeps no app-config
 * dependency. Reads the ALS tenant context internally; pass the acting user to also pick up
 * user/role-scoped overrides.
 */
export type MCPAllowlistResolver = (
  ctx?: MCPAllowlistContext,
) => Promise<{ allowedDomains?: string[] | null; allowedAddresses?: string[] | null }>;

/** Effective allowlists resolved for a request. */
interface ResolvedMCPAllowlists {
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
}

/**
 * Central registry for managing MCP server configurations.
 * Authoritative source of truth for all MCP servers provided by LibreChat.
 *
 * Uses a three-layer architecture:
 * - YAML Cache (cacheConfigsRepo): Operator-defined configs loaded at startup (in-memory or Redis)
 * - Config Cache (configCacheRepo): Admin-defined configs from Config overrides, lazily initialized
 * - DB Repository (dbConfigsRepo): User-provided configs created at runtime (MongoDB + ACL)
 *
 * Query priority: Config cache → YAML cache → DB.
 */
export class MCPServersRegistry {
  private static instance: MCPServersRegistry;

  private readonly dbConfigsRepo: ServerConfigsDB;
  private readonly cacheConfigsRepo: IServerConfigsRepositoryInterface;
  private readonly configCacheRepo: IServerConfigsRepositoryInterface;
  /** YAML-derived base allowlists; used at boot and as the fallback when no resolver is set. */
  private readonly allowedDomains?: string[] | null;
  private readonly allowedAddresses?: string[] | null;
  /** Resolves the per-request (tenant-scoped) merged allowlists; falls back to the base above. */
  private readonly allowlistResolver?: MCPAllowlistResolver;
  private readonly readThroughCache: Keyv<t.ParsedServerConfig>;
  private readonly readThroughCacheAll: Keyv<Record<string, t.ParsedServerConfig>>;
  private readonly pendingGetAllPromises = new Map<
    string,
    Promise<Record<string, t.ParsedServerConfig>>
  >();

  /** Tracks in-flight config server initializations to prevent duplicate work. */
  private readonly pendingConfigInits = new Map<
    string,
    Promise<t.ParsedServerConfig | undefined>
  >();

  /** Memoized YAML server names — set once after boot-time init, never changes. */
  private yamlServerNames: Set<string> | null = null;
  private yamlServerNamesPromise: Promise<Set<string>> | null = null;

  constructor(
    mongoose: typeof import('mongoose'),
    allowedDomains?: string[] | null,
    allowedAddresses?: string[] | null,
    allowlistResolver?: MCPAllowlistResolver,
  ) {
    this.dbConfigsRepo = new ServerConfigsDB(mongoose);
    this.cacheConfigsRepo = ServerConfigsCacheFactory.create(APP_CACHE_NAMESPACE, false);
    this.configCacheRepo = ServerConfigsCacheFactory.create(CONFIG_CACHE_NAMESPACE, false);
    this.allowedDomains = allowedDomains;
    this.allowedAddresses = allowedAddresses;
    this.allowlistResolver = allowlistResolver;

    const ttl = cacheConfig.MCP_REGISTRY_CACHE_TTL;

    this.readThroughCache = new Keyv<t.ParsedServerConfig>({
      namespace: 'mcp-registry-read-through',
      ttl,
    });

    this.readThroughCacheAll = new Keyv<Record<string, t.ParsedServerConfig>>({
      namespace: 'mcp-registry-read-through-all',
      ttl,
    });
  }

  /** Creates and initializes the singleton MCPServersRegistry instance */
  public static createInstance(
    mongoose: typeof import('mongoose'),
    allowedDomains?: string[] | null,
    allowedAddresses?: string[] | null,
    allowlistResolver?: MCPAllowlistResolver,
  ): MCPServersRegistry {
    if (!mongoose) {
      throw new Error(
        'MCPServersRegistry creation failed: mongoose instance is required for database operations. ' +
          'Ensure mongoose is initialized before creating the registry.',
      );
    }
    if (MCPServersRegistry.instance) {
      logger.debug('[MCPServersRegistry] Returning existing instance');
      return MCPServersRegistry.instance;
    }
    logger.info('[MCPServersRegistry] Creating new instance');
    MCPServersRegistry.instance = new MCPServersRegistry(
      mongoose,
      allowedDomains,
      allowedAddresses,
      allowlistResolver,
    );
    return MCPServersRegistry.instance;
  }

  /** Returns the singleton MCPServersRegistry instance */
  public static getInstance(): MCPServersRegistry {
    if (!MCPServersRegistry.instance) {
      throw new Error('MCPServersRegistry has not been initialized.');
    }
    return MCPServersRegistry.instance;
  }

  /** YAML base allowlist (boot/fallback). For request-time decisions use {@link resolveAllowlists}. */
  public getAllowedDomains(): string[] | null | undefined {
    return this.allowedDomains;
  }

  /** YAML base allowlist (boot/fallback). For request-time decisions use {@link resolveAllowlists}. */
  public getAllowedAddresses(): string[] | null | undefined {
    return this.allowedAddresses;
  }

  /** Returns true when no explicit allowedDomains allowlist is configured, enabling SSRF TOCTOU protection */
  public shouldEnableSSRFProtection(): boolean {
    return !Array.isArray(this.allowedDomains) || this.allowedDomains.length === 0;
  }

  /**
   * Resolves the effective domain/address allowlists for the current request.
   *
   * MCP allowlists live in `mcpSettings`, which is tenant/principal-scoped admin config, so
   * they must be read per-request from the merged config — not from a process-global value
   * that would leak across tenants. The injected resolver reads the ALS tenant context; pass
   * the acting user so user/role-scoped overrides resolve too (config-source inspection has no
   * user and resolves at tenant scope). Falls back to the YAML base allowlists when no resolver
   * is injected or the resolver fails, so a transient lookup error fails to the operator's
   * baseline rather than disabling the allowlist.
   */
  public async resolveAllowlists(ctx?: MCPAllowlistContext): Promise<{
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
    useSSRFProtection: boolean;
  }> {
    let allowedDomains = this.allowedDomains;
    let allowedAddresses = this.allowedAddresses;
    if (this.allowlistResolver) {
      try {
        const resolved = await this.allowlistResolver(ctx);
        allowedDomains = resolved.allowedDomains;
        allowedAddresses = resolved.allowedAddresses;
      } catch (error) {
        logger.warn(
          '[MCPServersRegistry] Allowlist resolver failed; falling back to YAML base allowlists',
          error,
        );
      }
    }
    return {
      allowedDomains,
      allowedAddresses,
      useSSRFProtection: !Array.isArray(allowedDomains) || allowedDomains.length === 0,
    };
  }

  /**
   * Returns the config for a single server, mirroring the precedence used by
   * getAllServerConfigs so list views and single-server lookups agree on
   * the same name:
   *   1. user-tier base entry wins absolutely over a config-tier candidate
   *   2. healthy YAML/DB base wins over a failed (inspectionFailed) candidate
   *   3. healthy candidate overlays its fields onto the base, preserving the
   *      base entry's source tag so downstream recovery routes correctly
   *   4. with no base, the candidate is returned as-is (config-only server)
   *
   * readThroughCache memoizes only the global YAML/DB lookup; the per-call
   * configServers candidate is tenant-scoped and is never cached, so a
   * failed stub from one tenant can never satisfy a no-userId lookup from
   * another.
   */
  public async getServerConfig(
    serverName: string,
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
  ): Promise<t.ParsedServerConfig | undefined> {
    const candidate = configServers?.[serverName];

    const cacheKey = this.getReadThroughCacheKey(serverName, userId);
    let base: t.ParsedServerConfig | undefined;
    if (await this.readThroughCache.has(cacheKey)) {
      base = await this.readThroughCache.get(cacheKey);
    } else {
      const configFromYaml = await this.cacheConfigsRepo.get(serverName);
      if (configFromYaml) {
        base = configFromYaml;
      } else {
        base = await this.dbConfigsRepo.get(serverName, userId);
      }
      await this.readThroughCache.set(cacheKey, base);
    }

    if (!candidate) return base;
    if (base?.source === 'user') return base;
    if (candidate.inspectionFailed) return base ?? candidate;
    return base ? { ...candidate, source: base.source } : candidate;
  }

  /**
   * Returns the full server config map after merging YAML cache, Config-tier overrides,
   * and User-DB entries.
   *
   * Precedence (lowest to highest): YAML cache > Config-tier overrides (success only) > User DB.
   * Two guards keep the merge safe:
   *   1. Config-tier entries carrying `inspectionFailed: true` never overlay an existing
   *      base entry; the healthy base is preserved for the duration of the retry window.
   *   2. User-DB entries (`source: 'user'`) are never replaced by Config-tier overlays.
   * On a successful overlay the base entry's `source` field is preserved so downstream
   * recovery logic routes to the correct storage location.
   */
  public async getAllServerConfigs(
    userId?: string,
    configServers?: Record<string, t.ParsedServerConfig>,
    role?: string,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (configServers == null || !Object.keys(configServers).length) {
      return this.getBaseServerConfigs(userId, role);
    }
    const base = await this.getBaseServerConfigs(userId, role);
    const result: Record<string, t.ParsedServerConfig> = { ...base };
    for (const [name, override] of Object.entries(configServers)) {
      if (result[name]?.source === 'user') {
        logger.debug(`[MCP][config][${name}] Admin override shadowed by user-tier entry`);
        continue;
      }
      if (override.inspectionFailed && result[name]) continue;
      const baseSource = result[name]?.source;
      result[name] = baseSource ? { ...override, source: baseSource } : override;
    }
    return result;
  }

  /**
   * Returns YAML + user-DB server configs, cached via `readThroughCacheAll`.
   * YAML wins on name collisions so a user-created server cannot hide global config.
   * Always called by `getAllServerConfigs` so the DB query is amortized across
   * requests within the TTL window regardless of whether `configServers` is present.
   */
  private async getBaseServerConfigs(
    userId?: string,
    role?: string,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    const cacheKey = userId ?? '__no_user__';

    if (await this.readThroughCacheAll.has(cacheKey)) {
      return (await this.readThroughCacheAll.get(cacheKey)) ?? {};
    }

    const pending = this.pendingGetAllPromises.get(cacheKey);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchBaseServerConfigs(cacheKey, userId, role);
    this.pendingGetAllPromises.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingGetAllPromises.delete(cacheKey);
    }
  }

  private async fetchBaseServerConfigs(
    cacheKey: string,
    userId?: string,
    role?: string,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    const [dbConfigs, yamlConfigs] = await Promise.all([
      this.dbConfigsRepo.getAll(userId, role),
      this.cacheConfigsRepo.getAll(),
    ]);

    this.warnOnOperatorManagedNameCollisions(yamlConfigs, dbConfigs, 'YAML');

    const result = { ...dbConfigs, ...yamlConfigs };

    await this.readThroughCacheAll.set(cacheKey, result);
    return result;
  }

  /**
   * Stores a minimal config stub so the server remains "known" to the registry
   * even when inspection fails at startup. This enables reinitialize to recover.
   */
  public async addServerStub(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE',
    userId?: string,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    const stubConfig: t.ParsedServerConfig = { ...config, inspectionFailed: true, source: 'yaml' };
    const result = await configRepo.add(serverName, stubConfig, userId);
    await this.invalidateServerReadCaches(result.serverName, userId);
    this.resetYamlServerNamesMemo();
    return result;
  }

  public async addServer(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
    reservedServerNames?: Iterable<string>,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    const source = (storageLocation === 'CACHE' ? 'yaml' : 'user') as t.MCPServerSource;
    const configForInspection = { ...config, source } as t.ParsedServerConfig;
    const { allowedDomains, allowedAddresses } = await this.resolveAllowlists({ userId });
    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        configForInspection,
        undefined,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }
    const tagged = {
      ...parsedConfig,
      source,
    };
    const result =
      storageLocation === 'DB'
        ? await this.dbConfigsRepo.add(
            serverName,
            tagged,
            userId,
            await this.getOperatorManagedServerNames(reservedServerNames),
          )
        : await configRepo.add(serverName, tagged, userId);
    await this.invalidateServerReadCaches(result.serverName, userId);
    if (storageLocation === 'CACHE') {
      this.resetYamlServerNamesMemo();
    }
    return result;
  }

  /**
   * Re-inspects a server that previously failed initialization.
   * Uses the stored stub config to attempt a full inspection and replaces the stub on success.
   */
  public async reinspectServer(
    serverName: string,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.AddServerResult> {
    const configRepo = this.getConfigRepository(storageLocation);
    const existing = await configRepo.get(serverName, userId);
    if (!existing) {
      throw new Error(`Server "${serverName}" not found in ${storageLocation} for reinspection.`);
    }
    if (!existing.inspectionFailed) {
      throw new Error(
        `Server "${serverName}" is not in a failed state. Use updateServer() instead.`,
      );
    }

    const { inspectionFailed: _, ...configForInspection } = existing;
    const { allowedDomains, allowedAddresses } = await this.resolveAllowlists({ userId });
    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        configForInspection,
        undefined,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Reinspection failed for server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }

    const updatedConfig = { ...parsedConfig, updatedAt: Date.now() };
    await configRepo.update(serverName, updatedConfig, userId);
    await this.invalidateServerReadCaches(serverName, userId);
    return { serverName, config: updatedConfig };
  }

  public async updateServer(
    serverName: string,
    config: t.MCPOptions,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<t.ParsedServerConfig> {
    const configRepo = this.getConfigRepository(storageLocation);
    const source = (storageLocation === 'CACHE' ? 'yaml' : 'user') as t.MCPServerSource;

    // Merge existing admin API key if not provided in update (needed for inspection)
    let configForInspection = { ...config };
    if (config.apiKey?.source === 'admin' && !config.apiKey?.key) {
      const existingConfig = await configRepo.get(serverName, userId);
      if (existingConfig?.apiKey?.key) {
        configForInspection = {
          ...configForInspection,
          apiKey: {
            ...configForInspection.apiKey!,
            key: existingConfig.apiKey.key,
          },
        };
      }
    }

    const { allowedDomains, allowedAddresses } = await this.resolveAllowlists({ userId });
    let parsedConfig: t.ParsedServerConfig;
    try {
      parsedConfig = await MCPServerInspector.inspect(
        serverName,
        { ...configForInspection, source } as t.ParsedServerConfig,
        undefined,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(`[MCPServersRegistry] Failed to inspect server "${serverName}":`, error);
      if (isMCPDomainNotAllowedError(error)) {
        throw error;
      }
      throw new MCPInspectionFailedError(serverName, error as Error);
    }
    await configRepo.update(serverName, parsedConfig, userId);
    await this.invalidateServerReadCaches(serverName, userId);
    return parsedConfig;
  }

  /**
   * Ensures that config-source MCP servers (from admin Config overrides) are initialized.
   * Identifies servers in `resolvedMcpConfig` that are not from YAML, lazily initializes
   * any not yet in the config cache, and returns their parsed configs.
   *
   * Config cache keys are scoped by a hash of the raw config to prevent cross-tenant
   * cache poisoning when two tenants define a server with the same name but different configs.
   */
  public async ensureConfigServers(
    resolvedMcpConfig: Record<string, t.MCPOptions>,
  ): Promise<Record<string, t.ParsedServerConfig>> {
    if (!resolvedMcpConfig || Object.keys(resolvedMcpConfig).length === 0) {
      return {};
    }

    const result: Record<string, t.ParsedServerConfig> = {};

    // Config-source servers are admin-defined with no acting user; resolve the effective
    // allowlists once at tenant scope and fold them into each config-cache key so a tenant
    // whose allowlist rejects a URL cannot poison the shared key for a tenant that allows it.
    const { allowedDomains, allowedAddresses } = await this.resolveAllowlists();
    const allowlists: ResolvedMCPAllowlists = { allowedDomains, allowedAddresses };

    /** Single snapshot of the YAML cache for the whole pass: in the Redis aggregate-key backend, every per-name get() reads and deserializes the full map, so N concurrent per-server lookups would issue N full-map reads. The snapshot also keeps the unchanged-YAML comparison consistent against one view of YAML across all entries. */
    const yamlSnapshot = await this.cacheConfigsRepo.getAll();

    const settled = await Promise.allSettled(
      Object.entries(resolvedMcpConfig).map(async ([serverName, rawConfig]) => {
        if (this.isUnmodifiedYamlServer(yamlSnapshot, serverName, rawConfig)) {
          return;
        }
        const parsed = await this.ensureSingleConfigServer(serverName, rawConfig, allowlists);
        if (parsed) {
          result[serverName] = parsed;
        }
      }),
    );
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        logger.error('[MCPServersRegistry][ensureConfigServers] Unexpected error:', outcome.reason);
      }
    }

    return result;
  }

  /**
   * Returns true when `rawConfig` matches the YAML cache entry for this server
   * on every admin-configurable field, so an unmodified YAML-defined server
   * can skip lazy-init and avoid being re-inspected or shadowed in the
   * config tier.
   */
  private isUnmodifiedYamlServer(
    yamlSnapshot: Record<string, t.ParsedServerConfig>,
    serverName: string,
    rawConfig: t.MCPOptions,
  ): boolean {
    const yamlEntry = yamlSnapshot[serverName];
    if (!yamlEntry || yamlEntry.source !== 'yaml') {
      return false;
    }
    const yamlRecord = yamlEntry as unknown as Record<string, unknown>;
    const rawRecord = rawConfig as unknown as Record<string, unknown>;
    /** rawConfig is the pre-inspection MCPOptions; absent fields mean the admin didn't override and shouldn't count as a diff against inspector-derived values on the cached YAML entry. */
    return ADMIN_CONFIGURABLE_FIELDS.every((field) => {
      const rawVal = rawRecord[field];
      if (rawVal === undefined) return true;
      return deepEqual(yamlRecord[field], rawVal);
    });
  }

  /**
   * Ensures a single config-source server is initialized.
   * Cache key is scoped by config hash to prevent cross-tenant poisoning.
   * Deduplicates concurrent init requests for the same server+config.
   * Stale failure stubs are retried after `CONFIG_STUB_RETRY_MS` to recover from transient errors.
   */
  private async ensureSingleConfigServer(
    serverName: string,
    rawConfig: t.MCPOptions,
    allowlists: ResolvedMCPAllowlists,
  ): Promise<t.ParsedServerConfig | undefined> {
    const cacheKey = this.configCacheKey(serverName, rawConfig, allowlists);

    const cached = await this.configCacheRepo.get(cacheKey);
    if (cached) {
      const isStaleStub =
        cached.inspectionFailed && Date.now() - (cached.updatedAt ?? 0) > CONFIG_STUB_RETRY_MS;
      if (!isStaleStub) {
        return cached;
      }
      logger.info(`[MCP][config][${serverName}] Retrying stale failure stub`);
    }

    const pending = this.pendingConfigInits.get(cacheKey);
    if (pending) {
      return pending;
    }

    const initPromise = this.lazyInitConfigServer(cacheKey, serverName, rawConfig, allowlists);
    this.pendingConfigInits.set(cacheKey, initPromise);

    try {
      return await initPromise;
    } finally {
      this.pendingConfigInits.delete(cacheKey);
    }
  }

  /**
   * Lazily initializes a config-source MCP server: inspects capabilities/tools, then
   * stores the parsed config in the config cache with `source: 'config'`.
   */
  private async lazyInitConfigServer(
    cacheKey: string,
    serverName: string,
    rawConfig: t.MCPOptions,
    allowlists: ResolvedMCPAllowlists,
  ): Promise<t.ParsedServerConfig | undefined> {
    const prefix = `[MCP][config][${serverName}]`;
    logger.info(`${prefix} Lazy-initializing config-source server`);

    try {
      const configForInspection = {
        ...rawConfig,
        source: 'config' as const,
      } as t.ParsedServerConfig;
      const { allowedDomains, allowedAddresses } = allowlists;
      const inspected = await withTimeout(
        MCPServerInspector.inspect(
          serverName,
          configForInspection,
          undefined,
          allowedDomains,
          allowedAddresses,
        ),
        CONFIG_SERVER_INIT_TIMEOUT_MS,
        `${prefix} Server initialization timed out`,
      );

      const parsedConfig: t.ParsedServerConfig = { ...inspected, source: 'config' };
      await this.upsertConfigCache(cacheKey, parsedConfig);

      logger.info(
        `${prefix} Initialized: tools=${parsedConfig.tools ?? 'N/A'}, ` +
          `duration=${parsedConfig.initDuration ?? 'N/A'}ms`,
      );
      return parsedConfig;
    } catch (error) {
      logger.error(`${prefix} Failed to initialize:`, error);

      const stubConfig: t.ParsedServerConfig = {
        ...rawConfig,
        inspectionFailed: true,
        source: 'config',
        updatedAt: Date.now(),
      };
      try {
        await this.upsertConfigCache(cacheKey, stubConfig);
        logger.info(`${prefix} Stored stub config for recovery`);
      } catch (cacheError) {
        logger.error(
          `${prefix} Failed to store stub config (will retry on next request):`,
          cacheError,
        );
      }
      return stubConfig;
    }
  }

  /**
   * Writes a config to `configCacheRepo` using the atomic upsert operation.
   * Safe for cross-process races — the underlying cache handles add-or-update internally.
   */
  private async upsertConfigCache(cacheKey: string, config: t.ParsedServerConfig): Promise<void> {
    await this.configCacheRepo.upsert(cacheKey, config);
  }

  /**
   * Clears the config-source server cache, forcing re-inspection on next access.
   * Called when admin config overrides change (e.g., mcpServers mutation).
   *
   * @returns Names of servers that were evicted from the config cache.
   *          Callers should disconnect active connections for these servers.
   */
  public async invalidateConfigCache(): Promise<string[]> {
    const allCached = await this.configCacheRepo.getAll();
    const evictedNames = [
      ...new Set(Object.keys(allCached).map((key) => this.parseServerNameFromConfigCacheKey(key))),
    ];

    await Promise.all([
      this.configCacheRepo.reset(),
      // Only clear readThroughCacheAll (merged results that may include stale config servers).
      // readThroughCache (individual YAML/user lookups) is unaffected by config mutations.
      this.readThroughCacheAll.clear(),
    ]);

    if (evictedNames.length > 0) {
      logger.info(
        `[MCPServersRegistry] Config server cache invalidated, evicted: ${evictedNames.join(', ')}`,
      );
    }
    return evictedNames;
  }

  // TODO: Refactor callers to use config.requiresOAuth directly instead of this method.
  // Known gap: config-source OAuth servers are not included here because callers
  // (OAuthReconnectionManager, UserController) lack request context to resolve configServers.
  // Config-source OAuth auto-reconnection and uninstall cleanup require a separate mechanism.
  public async getOAuthServers(userId?: string): Promise<Set<string>> {
    const allServers = await this.getAllServerConfigs(userId);
    const oauthServers = Object.entries(allServers).filter(([, config]) => config.requiresOAuth);
    return new Set(oauthServers.map(([name]) => name));
  }

  public async reset(): Promise<void> {
    await this.cacheConfigsRepo.reset();
    await this.configCacheRepo.reset();
    await this.readThroughCache.clear();
    await this.readThroughCacheAll.clear();
    this.resetYamlServerNamesMemo();
  }

  public async removeServer(
    serverName: string,
    storageLocation: 'CACHE' | 'DB',
    userId?: string,
  ): Promise<void> {
    const configRepo = this.getConfigRepository(storageLocation);
    await configRepo.remove(serverName, userId);
    await this.invalidateServerReadCaches(serverName, userId);
    if (storageLocation === 'CACHE') {
      this.resetYamlServerNamesMemo();
    }
  }

  private getConfigRepository(storageLocation: 'CACHE' | 'DB'): IServerConfigsRepositoryInterface {
    switch (storageLocation) {
      case 'CACHE':
        return this.cacheConfigsRepo;
      case 'DB':
        return this.dbConfigsRepo;
      default:
        throw new Error(
          `MCPServersRegistry: The provided storage location "${storageLocation}" is not supported`,
        );
    }
  }

  private getReadThroughCacheKey(serverName: string, userId?: string): string {
    return userId ? `${serverName}::${userId}` : serverName;
  }

  private async invalidateServerReadCaches(serverName: string, userId?: string): Promise<void> {
    const deletes = [
      this.readThroughCache.delete(this.getReadThroughCacheKey(serverName)),
      this.readThroughCacheAll.clear(),
    ];

    if (userId) {
      deletes.push(this.readThroughCache.delete(this.getReadThroughCacheKey(serverName, userId)));
    }

    await Promise.all(deletes);
  }

  private async getOperatorManagedServerNames(
    reservedServerNames: Iterable<string> = [],
  ): Promise<string[]> {
    const yamlNames = await this.getYamlServerNames();

    return [...new Set([...yamlNames, ...reservedServerNames])];
  }

  private parseServerNameFromConfigCacheKey(cacheKey: string): string {
    const lastColon = cacheKey.lastIndexOf(':');
    return lastColon > 0 ? cacheKey.slice(0, lastColon) : cacheKey;
  }

  private warnOnOperatorManagedNameCollisions(
    operatorConfigs: Record<string, t.ParsedServerConfig>,
    candidateConfigs: Record<string, t.ParsedServerConfig>,
    operatorSource: 'Config' | 'YAML',
  ): void {
    const shadowedNames = Object.keys(operatorConfigs).filter(
      (serverName) => candidateConfigs[serverName]?.source === 'user',
    );
    if (!shadowedNames.length) {
      return;
    }

    logger.warn(
      `[MCPServersRegistry] ${operatorSource} MCP server(s) shadow DB-backed server(s) with colliding name(s): ` +
        `${shadowedNames.join(', ')}. DB records remain stored but are hidden while operator-managed servers use these names.`,
    );
  }

  private resetYamlServerNamesMemo(): void {
    this.yamlServerNames = null;
    this.yamlServerNamesPromise = null;
  }

  /**
   * Returns memoized YAML server names. Populated lazily on first call after boot/reset.
   * YAML servers don't change after boot, so this avoids repeated `getAll()` calls.
   * Uses promise deduplication to prevent concurrent cold-start double-fetch.
   */
  private getYamlServerNames(): Promise<Set<string>> {
    if (this.yamlServerNames) {
      return Promise.resolve(this.yamlServerNames);
    }
    if (this.yamlServerNamesPromise) {
      return this.yamlServerNamesPromise;
    }
    this.yamlServerNamesPromise = this.cacheConfigsRepo
      .getAll()
      .then((configs) => {
        this.yamlServerNames = new Set(Object.keys(configs));
        this.yamlServerNamesPromise = null;
        return this.yamlServerNames;
      })
      .catch((err) => {
        this.yamlServerNamesPromise = null;
        throw err;
      });
    return this.yamlServerNamesPromise;
  }

  /**
   * Produces a config-cache key scoped by server name AND a hash of the raw config plus the
   * effective allowlists. Hashing the raw config prevents cross-tenant poisoning when two
   * tenants define the same server name with different configurations; hashing the allowlists
   * prevents poisoning when the same config resolves differently because tenants have different
   * `mcpSettings.allowedDomains` / `allowedAddresses` (so one tenant's inspection result — e.g.
   * an `inspectionFailed` stub from a rejected domain — never satisfies another tenant's lookup).
   */
  private configCacheKey(
    serverName: string,
    rawConfig: t.MCPOptions,
    allowlists?: ResolvedMCPAllowlists,
  ): string {
    const payload = {
      rawConfig,
      allowedDomains: allowlists?.allowedDomains ?? null,
      allowedAddresses: allowlists?.allowedAddresses ?? null,
    };
    const sorted = JSON.stringify(payload, (_key, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        );
      }
      return value;
    });
    const hash = createHash('sha256').update(sorted).digest('hex').slice(0, 16);
    return `${serverName}:${hash}`;
  }
}
