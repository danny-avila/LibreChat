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
}

export interface AppConfigServiceDeps {
  /** Load the base AppConfig from YAML + AppService processing. */
  loadBaseConfig: () => Promise<AppConfig | undefined>;
  /** Cache tools after base config is loaded. */
  setCachedTools: (tools: Record<string, unknown>) => Promise<void>;
  /** Get a cache store by key. */
  getCache: (key: string) => CacheStore;
  /** The CacheKeys constants from librechat-data-provider. */
  cacheKeys: { APP_CONFIG: string; CONFIG_STORE: string };
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

function overrideCacheKey(role?: string, userId?: string): string {
  if (userId && role) {
    return `_OVERRIDE_:${role}:${userId}`;
  }
  if (userId) {
    return `_OVERRIDE_:${userId}`;
  }
  if (role) {
    return `_OVERRIDE_:${role}`;
  }
  return `_OVERRIDE_:${BASE_CONFIG_PRINCIPAL_ID}`;
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
   * Get the app configuration, optionally merged with DB overrides for the given principal.
   *
   * The base config (from YAML + AppService) is cached indefinitely. Per-principal merged
   * configs are cached with a short TTL (`overrideCacheTtl`, default 60s). On cache miss,
   * `getApplicableConfigs` queries the DB for matching overrides and merges them by priority.
   */
  async function getAppConfig(
    options: { role?: string; userId?: string; refresh?: boolean } = {},
  ): Promise<AppConfig> {
    const { role, userId, refresh } = options;

    let baseConfig = (await cache.get(BASE_CONFIG_KEY)) as AppConfig | undefined;
    if (!baseConfig || refresh) {
      logger.info('[getAppConfig] Loading base configuration...');
      baseConfig = await loadBaseConfig();

      if (!baseConfig) {
        throw new Error('Failed to initialize app configuration through AppService.');
      }

      if (baseConfig.availableTools) {
        await setCachedTools(baseConfig.availableTools);
      }

      await cache.set(BASE_CONFIG_KEY, baseConfig);
    }

    const cacheKey = overrideCacheKey(role, userId);
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

  return {
    getAppConfig,
    clearAppConfigCache,
  };
}

export type AppConfigService = ReturnType<typeof createAppConfigService>;
