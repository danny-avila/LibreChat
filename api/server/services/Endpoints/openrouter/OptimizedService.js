const OpenRouterClient = require('~/app/clients/OpenRouterClient');
const { logger } = require('~/config');
const { maskAPIKey } = require('~/server/utils/keyMasking');
const { standardCache } = require('~/cache/cacheFactory');
const { CacheKeys, Time } = require('librechat-data-provider');

/**
 * Optimized OpenRouter Service with advanced caching and performance optimizations
 */
class OptimizedOpenRouterService {
  constructor() {
    // Use LibreChat's standard cache with namespace
    this.creditsCache = standardCache(
      CacheKeys.OPENROUTER_CREDITS,
      Time.FIVE_MINUTES, // 5 minutes TTL
    );

    this.modelsCache = standardCache(
      CacheKeys.OPENROUTER_MODELS,
      Time.ONE_HOUR, // 1 hour TTL
    );

    // Store clients by API key
    this.clients = new Map();

    // Request coalescing for concurrent identical requests
    this.pendingRequests = new Map();

    // Background refresh configuration
    this.backgroundRefreshEnabled = process.env.OPENROUTER_BACKGROUND_REFRESH !== 'false';
    this.refreshIntervals = new Map();

    // Performance tracking
    this.stats = {
      creditsHits: 0,
      creditsMisses: 0,
      modelsHits: 0,
      modelsMisses: 0,
      coalescedRequests: 0,
      backgroundRefreshes: 0,
    };

    // Start background refresh if enabled
    if (this.backgroundRefreshEnabled) {
      this.initBackgroundRefresh();
    }
  }

  /**
   * Get or create an OpenRouterClient instance
   * @param {string} apiKey - The OpenRouter API key
   * @param {Object} options - Additional options for the client
   * @returns {OpenRouterClient} The client instance
   */
  getClient(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    if (!this.clients.has(apiKey)) {
      this.clients.set(apiKey, new OpenRouterClient(apiKey, options));
    }

    return this.clients.get(apiKey);
  }

  /**
   * Get credits with optimized caching and request coalescing
   * @param {string} apiKey - The OpenRouter API key
   * @param {boolean} forceRefresh - Force refresh bypassing cache
   * @returns {Promise<Object>} The credits information
   */
  async getCredits(apiKey, forceRefresh = false) {
    const cacheKey = `credits:${apiKey}`;
    const requestKey = `credits-req:${apiKey}`;

    // Check for pending request (coalescing)
    if (!forceRefresh && this.pendingRequests.has(requestKey)) {
      logger.debug('[OptimizedOpenRouter] Coalescing credits request');
      this.stats.coalescedRequests++;
      return this.pendingRequests.get(requestKey);
    }

    // Try cache first unless force refresh
    if (!forceRefresh) {
      try {
        const cached = await this.creditsCache.get(cacheKey);
        if (cached !== undefined) {
          logger.debug('[OptimizedOpenRouter] Credits cache hit');
          this.stats.creditsHits++;

          // Schedule background refresh if near expiry (80% of TTL)
          this.scheduleBackgroundRefresh(cacheKey, () => this.fetchCredits(apiKey));

          return cached;
        }
      } catch (error) {
        logger.warn('[OptimizedOpenRouter] Cache read error:', error);
      }
    }

    logger.debug('[OptimizedOpenRouter] Credits cache miss, fetching from API');
    this.stats.creditsMisses++;

    // Create fetch promise for coalescing
    const fetchPromise = this.fetchCreditsWithRetry(apiKey, cacheKey);
    this.pendingRequests.set(requestKey, fetchPromise);

    try {
      const credits = await fetchPromise;
      return credits;
    } finally {
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Fetch credits with retry logic and caching
   * @private
   */
  async fetchCreditsWithRetry(apiKey, cacheKey, retries = 3) {
    let lastError;

    for (let i = 0; i < retries; i++) {
      try {
        const client = this.getClient(apiKey);
        const credits = await client.getCredits(true);

        // Cache the result
        await this.creditsCache.set(cacheKey, credits);

        logger.debug('[OptimizedOpenRouter] Credits fetched and cached', { credits });
        return credits;
      } catch (error) {
        lastError = error;
        logger.warn(`[OptimizedOpenRouter] Credits fetch attempt ${i + 1} failed:`, error);

        if (i < retries - 1) {
          // Exponential backoff
          await this.delay(Math.pow(2, i) * 1000);
        }
      }
    }

    // Try to return stale data on error
    try {
      const stale = await this.creditsCache.get(cacheKey);
      if (stale !== undefined) {
        logger.warn('[OptimizedOpenRouter] Returning stale credits due to fetch error');
        return stale;
      }
    } catch (cacheError) {
      logger.error('[OptimizedOpenRouter] Failed to retrieve stale credits:', cacheError);
    }

    throw lastError;
  }

  /**
   * Get models with optimized caching
   * @param {string} apiKey - The OpenRouter API key
   * @param {boolean} forceRefresh - Force refresh bypassing cache
   * @returns {Promise<Array>} Array of available models
   */
  async getModels(apiKey, forceRefresh = false) {
    const cacheKey = `models:${apiKey}`;
    const requestKey = `models-req:${apiKey}`;

    // Check for pending request (coalescing)
    if (!forceRefresh && this.pendingRequests.has(requestKey)) {
      logger.debug('[OptimizedOpenRouter] Coalescing models request');
      this.stats.coalescedRequests++;
      return this.pendingRequests.get(requestKey);
    }

    // Try cache first
    if (!forceRefresh) {
      try {
        const cached = await this.modelsCache.get(cacheKey);
        if (cached !== undefined) {
          logger.debug('[OptimizedOpenRouter] Models cache hit');
          this.stats.modelsHits++;
          return cached;
        }
      } catch (error) {
        logger.warn('[OptimizedOpenRouter] Models cache read error:', error);
      }
    }

    logger.debug('[OptimizedOpenRouter] Models cache miss, fetching from API');
    this.stats.modelsMisses++;

    // Create fetch promise for coalescing
    const fetchPromise = this.fetchModelsWithRetry(apiKey, cacheKey);
    this.pendingRequests.set(requestKey, fetchPromise);

    try {
      const models = await fetchPromise;
      return models;
    } finally {
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Fetch models with retry logic and caching
   * @private
   */
  async fetchModelsWithRetry(apiKey, cacheKey, retries = 3) {
    let lastError;

    for (let i = 0; i < retries; i++) {
      try {
        const client = this.getClient(apiKey);
        const models = await client.getModels(true);

        // Cache the result
        await this.modelsCache.set(cacheKey, models);

        logger.debug('[OptimizedOpenRouter] Models fetched and cached', {
          modelCount: models.length,
        });
        return models;
      } catch (error) {
        lastError = error;
        logger.warn(`[OptimizedOpenRouter] Models fetch attempt ${i + 1} failed:`, error);

        if (i < retries - 1) {
          await this.delay(Math.pow(2, i) * 1000);
        }
      }
    }

    // Try stale data
    try {
      const stale = await this.modelsCache.get(cacheKey);
      if (stale !== undefined) {
        logger.warn('[OptimizedOpenRouter] Returning stale models due to fetch error');
        return stale;
      }
    } catch (cacheError) {
      logger.error('[OptimizedOpenRouter] Failed to retrieve stale models:', cacheError);
    }

    throw lastError;
  }

  /**
   * Pass through chat completion requests
   * @param {string} apiKey - The OpenRouter API key
   * @param {Object} params - Chat completion parameters
   * @returns {Promise<Object>} The chat completion response
   */
  async chatCompletion(apiKey, params) {
    try {
      const client = this.getClient(apiKey);

      // Update credits cache after completion (non-blocking)
      const response = await client.chatCompletion(params);

      // Trigger background credits refresh after chat to update balance
      if (this.backgroundRefreshEnabled && !params.stream) {
        this.triggerCreditsRefresh(apiKey);
      }

      return response;
    } catch (error) {
      logger.error('[OptimizedOpenRouter] Error in chat completion:', error);
      throw error;
    }
  }

  /**
   * Initialize background refresh mechanism
   * @private
   */
  initBackgroundRefresh() {
    // Check every 2 minutes for items needing refresh
    setInterval(() => {
      this.performBackgroundRefresh();
    }, Time.TWO_MINUTES);
  }

  /**
   * Perform background refresh for near-expiry cache items
   * @private
   */
  async performBackgroundRefresh() {
    // This would need to track which items are near expiry
    // For now, we'll rely on per-request background refresh scheduling
    logger.debug('[OptimizedOpenRouter] Background refresh check performed');
  }

  /**
   * Schedule background refresh for a cache key
   * @private
   */
  scheduleBackgroundRefresh(cacheKey, fetchFunction) {
    if (!this.backgroundRefreshEnabled) return;

    // Clear existing interval if any
    if (this.refreshIntervals.has(cacheKey)) {
      clearTimeout(this.refreshIntervals.get(cacheKey));
    }

    // Schedule refresh at 80% of TTL (4 minutes for 5-minute TTL)
    const refreshDelay = Time.FIVE_MINUTES * 0.8;

    const timeoutId = setTimeout(async () => {
      try {
        logger.debug(`[OptimizedOpenRouter] Background refresh for ${cacheKey}`);
        this.stats.backgroundRefreshes++;
        await fetchFunction();
        this.refreshIntervals.delete(cacheKey);
      } catch (error) {
        logger.error(`[OptimizedOpenRouter] Background refresh failed for ${cacheKey}:`, error);
      }
    }, refreshDelay);

    this.refreshIntervals.set(cacheKey, timeoutId);
  }

  /**
   * Trigger immediate credits refresh (after chat completion)
   * @private
   */
  async triggerCreditsRefresh(apiKey) {
    // Delay slightly to allow OpenRouter to update
    setTimeout(async () => {
      try {
        const cacheKey = `credits:${apiKey}`;
        await this.fetchCreditsWithRetry(apiKey, cacheKey, 1);
      } catch (error) {
        // Silent fail for background refresh
        logger.debug('[OptimizedOpenRouter] Background credits refresh failed:', error);
      }
    }, 2000); // 2 second delay
  }

  /**
   * Clear cache for specific API key or all
   * @param {string} [apiKey] - Optional API key to clear cache for
   */
  async clearCache(apiKey) {
    if (apiKey) {
      await Promise.all([
        this.creditsCache.delete(`credits:${apiKey}`),
        this.modelsCache.delete(`models:${apiKey}`),
      ]);
      logger.debug(`[OptimizedOpenRouter] Cache cleared for API key: ${maskAPIKey(apiKey)}`);
    } else {
      await Promise.all([this.creditsCache.clear(), this.modelsCache.clear()]);
      logger.debug('[OptimizedOpenRouter] All cache cleared');
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    const totalCreditsRequests = this.stats.creditsHits + this.stats.creditsMisses;
    const totalModelsRequests = this.stats.modelsHits + this.stats.modelsMisses;

    return {
      ...this.stats,
      creditsHitRate:
        totalCreditsRequests > 0
          ? ((this.stats.creditsHits / totalCreditsRequests) * 100).toFixed(2) + '%'
          : '0%',
      modelsHitRate:
        totalModelsRequests > 0
          ? ((this.stats.modelsHits / totalModelsRequests) * 100).toFixed(2) + '%'
          : '0%',
      activeClients: this.clients.size,
      pendingRequests: this.pendingRequests.size,
      scheduledRefreshes: this.refreshIntervals.size,
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    // Clear all refresh intervals
    for (const timeoutId of this.refreshIntervals.values()) {
      clearTimeout(timeoutId);
    }
    this.refreshIntervals.clear();
    this.clients.clear();
    this.pendingRequests.clear();
  }

  /**
   * Delay helper
   * @private
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new OptimizedOpenRouterService();
