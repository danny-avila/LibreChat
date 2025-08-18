const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

/**
 * @typedef {Object} AppConfig
 * @property {import('librechat-data-provider').TCustomConfig} config - The main custom configuration
 * @property {import('librechat-data-provider').TCustomConfig['ocr']} ocr - OCR configuration
 * @property {Object} paths - File paths configuration
 * @property {import('librechat-data-provider').TMemoryConfig | undefined} memory - Memory configuration
 * @property {import('librechat-data-provider').TCustomConfig['webSearch']} webSearch - Web search configuration
 * @property {string} fileStrategy - File storage strategy ('local', 's3', 'firebase', 'azure_blob')
 * @property {Array} socialLogins - Social login configurations
 * @property {string[]} [filteredTools] - Admin-filtered tools
 * @property {string[]} [includedTools] - Admin-included tools
 * @property {string} imageOutputType - Image output type configuration
 * @property {import('librechat-data-provider').TCustomConfig['interface']} interfaceConfig - Interface configuration
 * @property {import('librechat-data-provider').TCustomConfig['registration']} turnstileConfig - Turnstile configuration
 * @property {import('librechat-data-provider').TCustomConfig['balance']} balance - Balance configuration
 * @property {import('librechat-data-provider').TCustomConfig['mcpServers'] | null} mcpConfig - MCP server configuration
 * @property {import('librechat-data-provider').TCustomConfig['fileConfig']} [fileConfig] - File configuration
 * @property {import('librechat-data-provider').TCustomConfig['secureImageLinks']} [secureImageLinks] - Secure image links configuration
 * @property {import('librechat-data-provider').TCustomConfig['modelSpecs'] | undefined} [modelSpecs] - Processed model specifications
 * @property {import('librechat-data-provider').TEndpoint} [openAI] - OpenAI endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [google] - Google endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [bedrock] - Bedrock endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [anthropic] - Anthropic endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [gptPlugins] - GPT plugins endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [azureOpenAI] - Azure OpenAI endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [assistants] - Assistants endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [azureAssistants] - Azure assistants endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [agents] - Agents endpoint configuration
 * @property {import('librechat-data-provider').TEndpoint} [all] - Global endpoint configuration
 */

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, refresh } = options;

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = role ? `${CacheKeys.APP_CONFIG}:${role}` : CacheKeys.APP_CONFIG;

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const baseConfig = await cache.get(CacheKeys.APP_CONFIG);
  if (!baseConfig) {
    throw new Error('App configuration not initialized. Please ensure AppService has been called.');
  }

  // For now, return the base config
  // In the future, this is where we'll apply role-based modifications
  if (role) {
    // TODO: Apply role-based config modifications
    // const roleConfig = await applyRoleBasedConfig(baseConfig, role);
    // await cache.set(cacheKey, roleConfig);
    // return roleConfig;
  }

  return baseConfig;
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

/**
 * Initialize the app configuration during startup
 * @param {AppConfig} config - The initial configuration to store
 * @returns {Promise<void>}
 */
async function setAppConfig(config) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.set(CacheKeys.APP_CONFIG, config);
  logger.debug('[getAppConfig] App configuration initialized');
}

module.exports = {
  getAppConfig,
  setAppConfig,
  clearAppConfigCache,
};
