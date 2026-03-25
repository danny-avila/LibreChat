import { PrincipalType } from 'librechat-data-provider';
import { logger, mergeConfigOverrides } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { AppConfig, IConfig } from '@librechat/data-schemas';

const BASE_CONFIG_KEY = '_BASE_';
const HAS_DB_CONFIGS_KEY = '_HAS_DB_CONFIGS_';

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
  return '_OVERRIDE_:__base__';
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

  /**
   * Build a principals array from role and/or userId.
   * When only role is provided (common hot path), builds inline — no DB query.
   * When userId is provided, calls getUserPrincipals for full resolution (groups too).
   */
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
   * Get the app configuration based on user context.
   *
   * When role or userId is provided, DB config overrides for the applicable
   * principals (role, groups, user) are queried and deep-merged into the
   * base config. Merged results are cached with a short TTL.
   */
  async function getAppConfig(
    options: { role?: string; userId?: string; refresh?: boolean } = {},
  ): Promise<AppConfig> {
    const { role, userId, refresh } = options;

    const cache = getCache(cacheKeys.APP_CONFIG);

    let baseConfig = (await cache.get(BASE_CONFIG_KEY)) as AppConfig | undefined;
    if (!baseConfig || refresh) {
      logger.info('[getAppConfig] Loading base configuration from YAML...');
      baseConfig = await loadBaseConfig();

      if (!baseConfig) {
        throw new Error('Failed to initialize app configuration through AppService.');
      }

      if (baseConfig.availableTools) {
        await setCachedTools(baseConfig.availableTools);
      }

      await cache.set(BASE_CONFIG_KEY, baseConfig);
    }

    const hasDbConfigs = await cache.get(HAS_DB_CONFIGS_KEY);
    if (hasDbConfigs === false) {
      return baseConfig;
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
        if (hasDbConfigs == null) {
          await cache.set(HAS_DB_CONFIGS_KEY, false);
        }
        return baseConfig;
      }

      await cache.set(HAS_DB_CONFIGS_KEY, true);
      const merged = mergeConfigOverrides(baseConfig, configs);
      await cache.set(cacheKey, merged, overrideCacheTtl);
      return merged;
    } catch (error) {
      logger.error('[getAppConfig] Error resolving config overrides, falling back to base:', error);
      return baseConfig;
    }
  }

  /**
   * Mark the config system as dirty after any admin mutation (create, update, delete, toggle).
   *
   * Sets the HAS_DB_CONFIGS_KEY flag to `true` so getAppConfig will query the DB on next
   * cache miss. Per-user/role override caches are NOT invalidated — they expire naturally
   * via `overrideCacheTtl` (default 60s). This means config changes may take up to
   * `overrideCacheTtl` ms to propagate to all users.
   */
  async function markConfigsDirty(): Promise<void> {
    const cache = getCache(cacheKeys.APP_CONFIG);
    await cache.set(HAS_DB_CONFIGS_KEY, true);
  }

  async function clearAppConfigCache(): Promise<void> {
    const cache = getCache(cacheKeys.APP_CONFIG);
    await cache.delete(BASE_CONFIG_KEY);
    await cache.delete(HAS_DB_CONFIGS_KEY);
  }

  return {
    getAppConfig,
    markConfigsDirty,
    clearAppConfigCache,
  };
}

export type AppConfigService = ReturnType<typeof createAppConfigService>;
