import { PrincipalType } from 'librechat-data-provider';
import { logger, mergeConfigOverrides } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { AppConfig, IConfig } from '@librechat/data-schemas';

const BASE_CONFIG_KEY = '_BASE_';
const HAS_DB_CONFIGS_KEY = '_HAS_DB_CONFIGS_';

/** TTL for cached merged configs (ms). Override results expire after 60 seconds. */
const OVERRIDE_CACHE_TTL = 60_000;

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
}

// ── Helpers ──────────────────────────────────────────────────────────

function overrideCacheKey(role?: string, userId?: string): string {
  if (userId && role) {
    return `_OVERRIDE_:${role}:${userId}`;
  }
  if (role) {
    return `_OVERRIDE_:${role}`;
  }
  return '';
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

    // 1. Get or initialize the base config (from YAML, cached indefinitely)
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

    // 2. If no role/userId, return base config (startup, auth strategies, scripts)
    if (!role && !userId) {
      return baseConfig;
    }

    // 3. Check if any DB configs exist (feature flag — zero cost when unused)
    const hasDbConfigs = await cache.get(HAS_DB_CONFIGS_KEY);
    if (hasDbConfigs === false) {
      return baseConfig;
    }

    // 4. Check override cache (short TTL)
    const cacheKey = overrideCacheKey(role, userId);
    if (cacheKey && !refresh) {
      const cachedMerged = (await cache.get(cacheKey)) as AppConfig | undefined;
      if (cachedMerged) {
        return cachedMerged;
      }
    }

    // 5. Query DB for applicable configs and merge
    try {
      const principals = await buildPrincipals(role, userId);
      if (principals.length === 0) {
        return baseConfig;
      }

      const configs = await getApplicableConfigs(principals);

      // Update the feature flag: if no configs found and flag wasn't set, cache false
      if (configs.length === 0) {
        if (hasDbConfigs === undefined) {
          await cache.set(HAS_DB_CONFIGS_KEY, false);
        }
        return baseConfig;
      }

      // Merge and cache with TTL
      const merged = mergeConfigOverrides(baseConfig, configs);
      if (cacheKey) {
        await cache.set(cacheKey, merged, OVERRIDE_CACHE_TTL);
      }
      return merged;
    } catch (error) {
      logger.error('[getAppConfig] Error resolving config overrides, falling back to base:', error);
      return baseConfig;
    }
  }

  /**
   * Signal that DB configs exist (called by admin config API after creating/upserting a config).
   * Clears the HAS_DB_CONFIGS_KEY=false flag so getAppConfig will query the DB.
   */
  async function signalConfigChange(): Promise<void> {
    const cache = getCache(cacheKeys.APP_CONFIG);
    await cache.set(HAS_DB_CONFIGS_KEY, true);
  }

  /**
   * Clear the app configuration cache.
   */
  async function clearAppConfigCache(): Promise<boolean> {
    const cache = getCache(cacheKeys.CONFIG_STORE);
    return cache.delete(cacheKeys.APP_CONFIG);
  }

  return {
    getAppConfig,
    signalConfigChange,
    clearAppConfigCache,
  };
}

export type AppConfigService = ReturnType<typeof createAppConfigService>;
