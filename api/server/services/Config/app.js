const { CacheKeys, PrincipalType } = require('librechat-data-provider');
const { logger, AppService, mergeConfigOverrides } = require('@librechat/data-schemas');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const { setCachedTools } = require('./getCachedTools');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

const BASE_CONFIG_KEY = '_BASE_';
const HAS_DB_CONFIGS_KEY = '_HAS_DB_CONFIGS_';

/** TTL for cached merged configs (ms). Override results expire after 60 seconds. */
const OVERRIDE_CACHE_TTL = 60_000;

const loadBaseConfig = async () => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

/**
 * Build a cache key for override lookups based on the principals involved.
 * @param {string} [role]
 * @param {string} [userId]
 * @returns {string}
 */
function overrideCacheKey(role, userId) {
  if (userId && role) {
    return `_OVERRIDE_:${role}:${userId}`;
  }
  if (role) {
    return `_OVERRIDE_:${role}`;
  }
  return '';
}

/**
 * Build a principals array from role and/or userId.
 * Avoids calling getUserPrincipals (which does its own DB queries for groups)
 * when only role is provided — the common hot path.
 *
 * When userId is provided, uses getUserPrincipals for the full principal list
 * including group memberships.
 *
 * @param {string} [role]
 * @param {string} [userId]
 * @returns {Promise<Array<{principalType: string, principalId?: string}>>}
 */
async function buildPrincipals(role, userId) {
  if (userId) {
    // Full principal resolution: user + role + groups
    return db.getUserPrincipals({ userId, role });
  }

  // Role-only path (most common on hot path): no DB query needed
  const principals = [];
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
 *
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role/group-based config overrides
 * @param {string} [options.userId] - User ID for user-level config overrides
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, userId, refresh } = options;

  const cache = getLogStores(CacheKeys.APP_CONFIG);

  // 1. Get or initialize the base config (from YAML, cached indefinitely)
  let baseConfig = await cache.get(BASE_CONFIG_KEY);
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
    const cachedMerged = await cache.get(cacheKey);
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

    const configs = await db.getApplicableConfigs(principals);

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
async function signalConfigChange() {
  const cache = getLogStores(CacheKeys.APP_CONFIG);
  await cache.set(HAS_DB_CONFIGS_KEY, true);
}

/**
 * Clear the app configuration cache
 * @returns {Promise<boolean>}
 */
async function clearAppConfigCache() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = CacheKeys.APP_CONFIG;
  return await cache.delete(cacheKey);
}

module.exports = {
  getAppConfig,
  signalConfigChange,
  clearAppConfigCache,
};
