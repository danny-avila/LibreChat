const { logger } = require('~/config');
const EventEmitter = require('events');

/**
 * Advanced caching manager for OpenRouter with background refresh,
 * request coalescing, and optimized performance
 */
class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.config = {
      creditsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_CREDITS || 300000), // 5 minutes
      modelsTTL: parseInt(process.env.OPENROUTER_CACHE_TTL_MODELS || 3600000), // 1 hour
      backgroundRefreshInterval: parseInt(process.env.OPENROUTER_BACKGROUND_REFRESH || 240000), // 4 minutes
      staleWhileRevalidate: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };

    // Multi-level cache
    this.memoryCache = new Map();
    this.pendingRequests = new Map(); // Request coalescing
    this.refreshTimers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      backgroundRefreshes: 0,
      errors: 0,
    };

    // Start background refresh
    if (this.config.backgroundRefreshInterval > 0) {
      this.startBackgroundRefresh();
    }
  }

  /**
   * Get cached value with optimizations
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch fresh data
   * @param {Object} options - Cache options
   * @returns {Promise<any>} Cached or fresh value
   */
  async get(key, fetchFunction, options = {}) {
    const { ttl = this.config.creditsTTL, forceRefresh = false, background = false } = options;

    // Check if we're already fetching this key (request coalescing)
    if (!forceRefresh && this.pendingRequests.has(key)) {
      logger.debug(`[CacheManager] Coalescing request for key: ${key}`);
      return this.pendingRequests.get(key);
    }

    // Check memory cache
    if (!forceRefresh) {
      const cached = this.getFromMemory(key);
      if (cached !== null) {
        this.stats.hits++;

        // Check if stale but return immediately (stale-while-revalidate)
        if (this.isStale(key, ttl) && this.config.staleWhileRevalidate) {
          this.refreshInBackground(key, fetchFunction, ttl);
        }

        return cached;
      }
    }

    this.stats.misses++;

    // Fetch fresh data with request coalescing
    const fetchPromise = this.fetchWithRetry(fetchFunction, key);
    this.pendingRequests.set(key, fetchPromise);

    try {
      const data = await fetchPromise;
      this.setInMemory(key, data, ttl);

      // Schedule background refresh before expiry
      if (!background) {
        this.scheduleBackgroundRefresh(key, fetchFunction, ttl);
      }

      return data;
    } catch (error) {
      this.stats.errors++;

      // Return stale data if available on error
      const stale = this.getFromMemory(key, true);
      if (stale !== null) {
        logger.warn(`[CacheManager] Returning stale data for ${key} due to error:`, error);
        return stale;
      }

      throw error;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Get from memory cache
   * @param {string} key - Cache key
   * @param {boolean} includeStale - Include stale entries
   * @returns {any|null} Cached value or null
   */
  getFromMemory(key, includeStale = false) {
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    if (!includeStale && age > entry.ttl) {
      return null;
    }

    logger.debug(`[CacheManager] Memory cache hit for ${key}, age: ${age}ms`);
    return entry.data;
  }

  /**
   * Set in memory cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in ms
   */
  setInMemory(key, data, ttl) {
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    // Emit event for monitoring
    this.emit('cache:set', { key, ttl });
  }

  /**
   * Check if cache entry is stale
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in ms
   * @returns {boolean} True if stale
   */
  isStale(key, ttl) {
    const entry = this.memoryCache.get(key);
    if (!entry) return true;

    const age = Date.now() - entry.timestamp;
    // Consider stale at 80% of TTL for proactive refresh
    return age > ttl * 0.8;
  }

  /**
   * Refresh cache in background
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch fresh data
   * @param {number} ttl - Time to live in ms
   */
  async refreshInBackground(key, fetchFunction, ttl) {
    logger.debug(`[CacheManager] Background refresh for ${key}`);
    this.stats.backgroundRefreshes++;

    try {
      const data = await this.fetchWithRetry(fetchFunction, key);
      this.setInMemory(key, data, ttl);
      this.emit('cache:refreshed', { key, success: true });
    } catch (error) {
      logger.error(`[CacheManager] Background refresh failed for ${key}:`, error);
      this.emit('cache:refreshed', { key, success: false, error });
    }
  }

  /**
   * Schedule background refresh before TTL expires
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to fetch fresh data
   * @param {number} ttl - Time to live in ms
   */
  scheduleBackgroundRefresh(key, fetchFunction, ttl) {
    // Clear existing timer
    if (this.refreshTimers.has(key)) {
      clearTimeout(this.refreshTimers.get(key));
    }

    // Schedule refresh at 90% of TTL
    const refreshTime = ttl * 0.9;

    const timer = setTimeout(() => {
      this.refreshInBackground(key, fetchFunction, ttl);
      this.refreshTimers.delete(key);
    }, refreshTime);

    this.refreshTimers.set(key, timer);
  }

  /**
   * Fetch with retry logic
   * @param {Function} fetchFunction - Function to fetch data
   * @param {string} key - Cache key for logging
   * @returns {Promise<any>} Fetched data
   */
  async fetchWithRetry(fetchFunction, key) {
    let lastError;

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        const startTime = Date.now();
        const data = await fetchFunction();
        const duration = Date.now() - startTime;

        logger.debug(`[CacheManager] Fetched ${key} in ${duration}ms`);
        return data;
      } catch (error) {
        lastError = error;
        logger.warn(`[CacheManager] Fetch attempt ${i + 1} failed for ${key}:`, error);

        if (i < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, i)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Start global background refresh
   */
  startBackgroundRefresh() {
    setInterval(() => {
      this.memoryCache.forEach((entry, key) => {
        const age = Date.now() - entry.timestamp;

        // Refresh if 80% of TTL has passed
        if (age > entry.ttl * 0.8) {
          logger.debug(`[CacheManager] Global background refresh for ${key}`);
          // Note: This would need the original fetch function stored
          this.emit('cache:needs-refresh', { key });
        }
      });
    }, this.config.backgroundRefreshInterval);
  }

  /**
   * Clear cache
   * @param {string} pattern - Optional key pattern to clear
   */
  clear(pattern) {
    if (pattern) {
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);

          if (this.refreshTimers.has(key)) {
            clearTimeout(this.refreshTimers.get(key));
            this.refreshTimers.delete(key);
          }
        }
      }
      logger.debug(`[CacheManager] Cleared cache for pattern: ${pattern}`);
    } else {
      this.memoryCache.clear();
      this.refreshTimers.forEach((timer) => clearTimeout(timer));
      this.refreshTimers.clear();
      logger.debug('[CacheManager] Cleared all cache');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate.toFixed(2)}%`,
      cacheSize: this.memoryCache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.refreshTimers.forEach((timer) => clearTimeout(timer));
    this.refreshTimers.clear();
    this.memoryCache.clear();
    this.pendingRequests.clear();
    this.removeAllListeners();
  }
}

module.exports = CacheManager;
