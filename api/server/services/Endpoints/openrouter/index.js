const OpenRouterClient = require('~/app/clients/OpenRouterClient');
const { logger } = require('~/config');
const { maskAPIKey, sanitizeError, safeLog } = require('~/server/utils/keyMasking');

/**
 * OpenRouterService class handles business logic and caching for OpenRouter operations
 */
class OpenRouterService {
  constructor() {
    // Cache configuration from environment or defaults
    this.cacheSettings = {
      creditsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_CREDITS || 300000), // 5 minutes
      modelsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_MODELS || 3600000), // 1 hour
    };

    // Initialize cache storage
    this.cache = {
      credits: null,
      creditsTimestamp: null,
      models: null,
      modelsTimestamp: null,
    };

    // Store clients by API key to reuse connections
    this.clients = new Map();
  }

  /**
   * Get or create an OpenRouterClient instance for the given API key
   * @param {string} apiKey - The OpenRouter API key
   * @param {Object} options - Additional options for the client
   * @returns {OpenRouterClient} The client instance
   */
  getClient(apiKey, options = {}) {
    if (!apiKey) {
      throw sanitizeError(new Error('OpenRouter API key is required'));
    }

    // Check if we already have a client for this API key
    if (!this.clients.has(apiKey)) {
      this.clients.set(apiKey, new OpenRouterClient(apiKey, options));
    }

    return this.clients.get(apiKey);
  }

  /**
   * Get credits with caching support
   * @param {string} apiKey - The OpenRouter API key
   * @param {boolean} forceRefresh - Force refresh bypassing cache
   * @returns {Promise<Object>} The credits information
   */
  async getCredits(apiKey, forceRefresh = false) {
    const now = Date.now();
    const cacheKey = `credits_${apiKey}`;

    // Check if we have cached data for this API key
    if (
      !forceRefresh &&
      this.cache[cacheKey] &&
      this.cache[`${cacheKey}_timestamp`] &&
      now - this.cache[`${cacheKey}_timestamp`] < this.cacheSettings.creditsTTL
    ) {
      logger.debug('[OpenRouterService] Returning cached credits');
      return this.cache[cacheKey];
    }

    try {
      const client = this.getClient(apiKey);
      const credits = await client.getCredits(true); // Force client to bypass its own cache

      // Update cache for this API key
      this.cache[cacheKey] = credits;
      this.cache[`${cacheKey}_timestamp`] = now;

      safeLog('debug', '[OpenRouterService] Credits fetched and cached', { credits }, logger);
      return credits;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterService] Error fetching credits:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Get models with caching support
   * @param {string} apiKey - The OpenRouter API key
   * @param {boolean} forceRefresh - Force refresh bypassing cache
   * @returns {Promise<Array>} Array of available models
   */
  async getModels(apiKey, forceRefresh = false) {
    const now = Date.now();
    const cacheKey = `models_${apiKey}`;

    // Check if we have cached data for this API key
    if (
      !forceRefresh &&
      this.cache[cacheKey] &&
      this.cache[`${cacheKey}_timestamp`] &&
      now - this.cache[`${cacheKey}_timestamp`] < this.cacheSettings.modelsTTL
    ) {
      logger.debug('[OpenRouterService] Returning cached models');
      return this.cache[cacheKey];
    }

    try {
      const client = this.getClient(apiKey);
      const models = await client.getModels(true); // Force client to bypass its own cache

      // Update cache for this API key
      this.cache[cacheKey] = models;
      this.cache[`${cacheKey}_timestamp`] = now;

      safeLog(
        'debug',
        '[OpenRouterService] Models fetched and cached',
        {
          modelCount: models.length,
        },
        logger,
      );
      return models;
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterService] Error fetching models:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Pass through chat completion requests to the client
   * @param {string} apiKey - The OpenRouter API key
   * @param {Object} params - The chat completion parameters
   * @returns {Promise<Object>} The chat completion response
   */
  async chatCompletion(apiKey, params) {
    try {
      const client = this.getClient(apiKey);
      return await client.chatCompletion(params);
    } catch (error) {
      const sanitized = sanitizeError(error);
      logger.error('[OpenRouterService] Error in chat completion:', sanitized);
      throw sanitized;
    }
  }

  /**
   * Clear cache for a specific API key or all cached data
   * @param {string} [apiKey] - Optional API key to clear cache for
   */
  clearCache(apiKey) {
    if (apiKey) {
      // Clear cache for specific API key
      const creditsCacheKey = `credits_${apiKey}`;
      const modelsCacheKey = `models_${apiKey}`;

      delete this.cache[creditsCacheKey];
      delete this.cache[`${creditsCacheKey}_timestamp`];
      delete this.cache[modelsCacheKey];
      delete this.cache[`${modelsCacheKey}_timestamp`];

      logger.debug(`[OpenRouterService] Cache cleared for API key: ${maskAPIKey(apiKey)}`);
    } else {
      // Clear all cache
      this.cache = {};
      logger.debug('[OpenRouterService] All cache cleared');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      creditsCacheCount: 0,
      modelsCacheCount: 0,
      totalCacheSize: Object.keys(this.cache).length,
    };

    for (const key in this.cache) {
      if (key.startsWith('credits_') && !key.endsWith('_timestamp')) {
        stats.creditsCacheCount++;
      } else if (key.startsWith('models_') && !key.endsWith('_timestamp')) {
        stats.modelsCacheCount++;
      }
    }

    return stats;
  }
}

// Export singleton instance
const openRouterService = new OpenRouterService();

// Import functions that match the pattern used by other services (OpenAI, Anthropic)
const addTitle = require('./title');
const { buildOptions } = require('./build');
const initializeClient = require('./initialize');

module.exports = {
  // Standard provider exports (matching OpenAI/Anthropic pattern)
  addTitle,
  buildOptions,
  initializeClient,
  // OpenRouter specific service instance and methods
  openRouterService,
  getCredits: (apiKey, forceRefresh) => openRouterService.getCredits(apiKey, forceRefresh),
  getModels: (apiKey, forceRefresh) => openRouterService.getModels(apiKey, forceRefresh),
  chatCompletion: (apiKey, params) => openRouterService.chatCompletion(apiKey, params),
  clearCache: (apiKey) => openRouterService.clearCache(apiKey),
  getCacheStats: () => openRouterService.getCacheStats(),
};
