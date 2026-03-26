import { PrincipalType } from 'librechat-data-provider';
import { logger, mergeConfigOverrides, BASE_CONFIG_PRINCIPAL_ID } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { AppConfig, IConfig } from '@librechat/data-schemas';

const BASE_CONFIG_KEY = '_BASE_';

const DEFAULT_OVERRIDE_CACHE_TTL = 60_000;

// ── Types ────────────────────────────────────────────────────────────

interface CacheStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
  delete: (key: string) => Promise<boolean>;
  /** Keyv options — used for key enumeration when clearing override caches. */
  opts?: {
    store?: {
      keys?: () => IterableIterator<string>;
    };
  };
}

export interface AppConfigServiceDeps {
  /** Load the base AppConfig from YAML + AppService processing. */
  loadBaseConfig: () => Promise<AppConfig | undefined>;
  /** Cache tools after base config is loaded. */
  setCachedTools: (tools: Record<string, unknown>) => Promise<void>;
  /** Get a cache store by key. */
  getCache: (key: string) => CacheStore;
  /** The CacheKeys constants from librechat-data-provider. */
  cacheKeys: { APP_CONFIG: string };
  /** Fetch applicable DB config overrides for a set of principals. */
  getApplicableConfigs: (
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
  ) => Promise<IConfig[]>;
  /** Resolve full principal list (user + role + groups) from userId/role. */
  getUserPrincipals: (params: {
    userId: string | Types.ObjectId;
    role?: string | null;
  }) => Promise<Array<{ principalType: string; principalId?: string | Types.ObjectId }>>;
  /** TTL in ms for per-user/role merged config caches. Defaults to 60 000. */
  overrideCacheTtl?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

let _strictOverride: boolean | undefined;
function isStrictOverrideMode(): boolean {
  return (_strictOverride ??= process.env.TENANT_ISOLATION_STRICT === 'true');
}

/** @internal Resets the cached strict-override flag. Exposed for test teardown only. */
let _warnedNoTenantInStrictMode = false;

export function _resetOverrideStrictCache(): void {
  _strictOverride = undefined;
  _warnedNoTenantInStrictMode = false;
}

function overrideCacheKey(role?: string, userId?: string, tenantId?: string): string {
  const tenant = tenantId || '__default__';
  if (!tenantId && isStrictOverrideMode() && !_warnedNoTenantInStrictMode) {
    _warnedNoTenantInStrictMode = true;
    logger.warn(
      '[overrideCacheKey] No tenantId in strict mode — falling back to __default__. ' +
        'This likely indicates a code path that bypasses the tenant context middleware.',
    );
  }
  if (userId && role) {
    return `_OVERRIDE_:${tenant}:${role}:${userId}`;
  }
  if (userId) {
    return `_OVERRIDE_:${tenant}:${userId}`;
  }
  if (role) {
    return `_OVERRIDE_:${tenant}:${role}`;
  }
  return `_OVERRIDE_:${tenant}:${BASE_CONFIG_PRINCIPAL_ID}`;
}

// ── Service factory ──────────────────────────────────────────────────

export function createAppConfigService(deps: AppConfigServiceDeps) {
  const {
    loadBaseConfig,
    setCachedTools,
    getCache,
    cacheKeys,
    getApplicableConfigs,
    getUserPrincipals,
    overrideCacheTtl = DEFAULT_OVERRIDE_CACHE_TTL,
  } = deps;

  const cache = getCache(cacheKeys.APP_CONFIG);

  async function buildPrincipals(
    role?: string,
    userId?: string,
  ): Promise<Array<{ principalType: string; principalId?: string | Types.ObjectId }>> {
    if (userId) {
      return getUserPrincipals({ userId, role });
    }
    const principals: Array<{ principalType: string; principalId?: string | Types.ObjectId }> = [];
    if (role) {
      principals.push({ principalType: PrincipalType.ROLE, principalId: role });
    }
    return principals;
  }

  /**
   * Ensure the YAML-derived base config is loaded and cached.
   * Returns the `_BASE_` config (YAML + AppService). No DB queries.
   */
  async function ensureBaseConfig(refresh?: boolean): Promise<AppConfig> {
    let baseConfig = (await cache.get(BASE_CONFIG_KEY)) as AppConfig | undefined;
    if (!baseConfig || refresh) {
      logger.info('[ensureBaseConfig] Loading base configuration...');
      baseConfig = await loadBaseConfig();

      if (!baseConfig) {
        throw new Error('Failed to initialize app configuration through AppService.');
      }

      if (baseConfig.availableTools) {
        await setCachedTools(baseConfig.availableTools);
      }

      await cache.set(BASE_CONFIG_KEY, baseConfig);
    }
    return baseConfig;
  }

  /**
   * Get the app configuration, optionally merged with DB overrides for the given principal.
   *
   * The base config (from YAML + AppService) is cached indefinitely. Per-principal merged
   * configs are cached with a short TTL (`overrideCacheTtl`, default 60s). On cache miss,
   * `getApplicableConfigs` queries the DB for matching overrides and merges them by priority.
   *
   * When `baseOnly` is true, returns the YAML-derived config without any DB queries.
   * `role`, `userId`, and `tenantId` are ignored in this mode.
   * Use this for startup, auth strategies, and other pre-tenant code paths.
   */
  async function getAppConfig(
    options: {
      role?: string;
      userId?: string;
      tenantId?: string;
      refresh?: boolean;
      /** When true, return only the YAML-derived base config — no DB override queries. */
      baseOnly?: boolean;
    } = {},
  ): Promise<AppConfig> {
    const { role, userId, tenantId, refresh, baseOnly } = options;

    const baseConfig = await ensureBaseConfig(refresh);

    if (baseOnly) {
      return baseConfig;
    }

    const cacheKey = overrideCacheKey(role, userId, tenantId);
    if (!refresh) {
      const cachedMerged = (await cache.get(cacheKey)) as AppConfig | undefined;
      if (cachedMerged) {
        return cachedMerged;
      }
    }

    try {
      const principals = await buildPrincipals(role, userId);
      const configs = await getApplicableConfigs(principals);

      if (configs.length === 0) {
        await cache.set(cacheKey, baseConfig, overrideCacheTtl);
        return baseConfig;
      }

      const merged = mergeConfigOverrides(baseConfig, configs);
      await cache.set(cacheKey, merged, overrideCacheTtl);
      return merged;
    } catch (error) {
      logger.error('[getAppConfig] Error resolving config overrides, falling back to base:', error);
      return baseConfig;
    }
  }

  /**
   * Clear the base config cache. Per-user/role override caches (`_OVERRIDE_:*`)
   * are NOT flushed — they expire naturally via `overrideCacheTtl`. After calling this,
   * the base config will be reloaded from YAML on the next `getAppConfig` call, but
   * users with cached overrides may see stale merged configs for up to `overrideCacheTtl` ms.
   */
  async function clearAppConfigCache(): Promise<void> {
    await cache.delete(BASE_CONFIG_KEY);
  }

  /**
   * Clear per-principal override caches. When `tenantId` is provided, only caches
   * matching `_OVERRIDE_:${tenantId}:*` are deleted. When omitted, ALL override
   * caches are cleared.
   */
  async function clearOverrideCache(tenantId?: string): Promise<void> {
    const namespace = cacheKeys.APP_CONFIG;
    const overrideSegment = tenantId ? `_OVERRIDE_:${tenantId}:` : '_OVERRIDE_:';

    // In-memory store — enumerate keys directly.
    // APP_CONFIG defaults to FORCED_IN_MEMORY_CACHE_NAMESPACES, so this is the
    // standard path. Redis SCAN is intentionally avoided here — it can cause 60s+
    // stalls under concurrent load (see #12410). When APP_CONFIG is Redis-backed
    // and store.keys() is unavailable, overrides expire naturally via TTL.
    const store = (cache as CacheStore).opts?.store;
    if (store && typeof store.keys === 'function') {
      // Keyv stores keys with a namespace prefix (e.g. "APP_CONFIG:_OVERRIDE_:...").
      // We match on the namespaced key but delete using the un-namespaced key
      // because Keyv.delete() auto-prepends the namespace.
      const namespacedPrefix = `${namespace}:${overrideSegment}`;
      const toDelete: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(namespacedPrefix)) {
          toDelete.push(key.slice(namespace.length + 1));
        }
      }
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map((key) => cache.delete(key)));
        logger.info(
          `[clearOverrideCache] Cleared ${toDelete.length} override cache entries` +
            (tenantId ? ` for tenant ${tenantId}` : ''),
        );
      }
      return;
    }

    logger.warn(
      '[clearOverrideCache] Cache store does not support key enumeration. ' +
        'Override caches will expire naturally via TTL (%dms). ' +
        'This is expected when APP_CONFIG is Redis-backed — Redis SCAN is avoided ' +
        'for performance reasons (see #12410).',
      overrideCacheTtl,
    );
  }

  return {
    getAppConfig,
    clearAppConfigCache,
    clearOverrideCache,
  };
}

export type AppConfigService = ReturnType<typeof createAppConfigService>;
