const { logger } = require('~/config');
const { DownloadToken } = require('~/models');

/**
 * Rate Limiting Service for temporary file downloads
 * Supports IP-based, user-based, file-based, and global rate limiting
 */
class RateLimitService {
  constructor() {
    this.config = {
      // Rate limiting window in seconds (default: 1 hour)
      window: parseInt(process.env.TEMP_DOWNLOAD_RATE_WINDOW) || 3600,

      // Rate limits
      ipLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_IP) || 100,
      userLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_USER) || 50,
      fileLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_FILE) || 10,
      globalLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_GLOBAL) || 1000,

      // MCP specific limits
      mcpLimit: parseInt(process.env.TEMP_DOWNLOAD_MCP_RATE_LIMIT) || 200,
      mcpEnabled: process.env.TEMP_DOWNLOAD_MCP_ENABLED !== 'false',

      // Redis configuration
      redisUrl: process.env.TEMP_DOWNLOAD_REDIS_URL,
      redisPrefix: process.env.TEMP_DOWNLOAD_REDIS_PREFIX || 'librechat:downloads:',
      redisTimeout: parseInt(process.env.TEMP_DOWNLOAD_REDIS_TIMEOUT) || 5000,

      // Development bypass
      devBypass: process.env.TEMP_DOWNLOAD_DEV_BYPASS_RATE_LIMIT === 'true',

      // Debug mode
      debug: process.env.TEMP_DOWNLOAD_DEBUG === 'true'
    };

    this.redis = null;
    this.memoryStore = new Map();
    this.initializeRedis();

    logger.info('[RateLimitService] Initialized with config:', {
      window: this.config.window,
      limits: {
        ip: this.config.ipLimit,
        user: this.config.userLimit,
        file: this.config.fileLimit,
        global: this.config.globalLimit,
        mcp: this.config.mcpLimit
      },
      redis: !!this.redis,
      devBypass: this.config.devBypass
    });
  }

  /**
   * Initialize Redis connection if configured
   */
  async initializeRedis() {
    if (!this.config.redisUrl) {
      logger.info('[RateLimitService] Redis not configured, using in-memory storage');
      return;
    }

    try {
      const Redis = require('ioredis');
      this.redis = new Redis(this.config.redisUrl, {
        connectTimeout: this.config.redisTimeout,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });

      await this.redis.ping();
      logger.info('[RateLimitService] Redis connection established');
    } catch (error) {
      logger.error('[RateLimitService] Failed to connect to Redis, falling back to memory:', error);
      this.redis = null;
    }
  }

  /**
   * Check if request is within rate limits
   */
  async checkRateLimit(params) {
    const { clientIP, userId, fileId, mcpClientId, requestId } = params;

    // Development bypass
    if (this.config.devBypass) {
      logger.debug('[RateLimitService] Rate limiting bypassed for development');
      return { allowed: true, reason: 'dev_bypass' };
    }

    try {
      const checks = await Promise.all([
        this.checkIPLimit(clientIP),
        this.checkUserLimit(userId),
        this.checkFileLimit(fileId),
        this.checkGlobalLimit(),
        mcpClientId ? this.checkMCPLimit(mcpClientId) : Promise.resolve({ allowed: true })
      ]);

      const failedCheck = checks.find(check => !check.allowed);
      
      if (failedCheck) {
        logger.warn('[RateLimitService] Rate limit exceeded:', {
          clientIP,
          userId,
          fileId,
          mcpClientId,
          requestId,
          reason: failedCheck.reason,
          limit: failedCheck.limit,
          current: failedCheck.current,
          resetTime: failedCheck.resetTime
        });
        
        return failedCheck;
      }

      // All checks passed
      await this.recordRequest(params);
      
      logger.debug('[RateLimitService] Rate limit check passed:', {
        clientIP,
        userId,
        fileId,
        mcpClientId,
        requestId
      });

      return { allowed: true };

    } catch (error) {
      logger.error('[RateLimitService] Rate limit check failed:', error);
      // Fail open - allow request if rate limiting fails
      return { allowed: true, reason: 'check_failed' };
    }
  }

  /**
   * Check IP-based rate limit
   */
  async checkIPLimit(clientIP) {
    const key = `${this.config.redisPrefix}ip:${clientIP}`;
    const count = await this.getCount(key);
    
    if (count >= this.config.ipLimit) {
      return {
        allowed: false,
        reason: 'ip_limit_exceeded',
        limit: this.config.ipLimit,
        current: count,
        resetTime: await this.getResetTime(key)
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check user-based rate limit
   */
  async checkUserLimit(userId) {
    const key = `${this.config.redisPrefix}user:${userId}`;
    const count = await this.getCount(key);
    
    if (count >= this.config.userLimit) {
      return {
        allowed: false,
        reason: 'user_limit_exceeded',
        limit: this.config.userLimit,
        current: count,
        resetTime: await this.getResetTime(key)
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check file-based rate limit
   */
  async checkFileLimit(fileId) {
    const key = `${this.config.redisPrefix}file:${fileId}`;
    const count = await this.getCount(key);
    
    if (count >= this.config.fileLimit) {
      return {
        allowed: false,
        reason: 'file_limit_exceeded',
        limit: this.config.fileLimit,
        current: count,
        resetTime: await this.getResetTime(key)
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check global rate limit
   */
  async checkGlobalLimit() {
    const key = `${this.config.redisPrefix}global`;
    const count = await this.getCount(key);
    
    if (count >= this.config.globalLimit) {
      return {
        allowed: false,
        reason: 'global_limit_exceeded',
        limit: this.config.globalLimit,
        current: count,
        resetTime: await this.getResetTime(key)
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check MCP client rate limit
   */
  async checkMCPLimit(mcpClientId) {
    const key = `${this.config.redisPrefix}mcp:${mcpClientId}`;
    const count = await this.getCount(key);
    
    if (count >= this.config.mcpLimit) {
      return {
        allowed: false,
        reason: 'mcp_limit_exceeded',
        limit: this.config.mcpLimit,
        current: count,
        resetTime: await this.getResetTime(key)
      };
    }
    
    return { allowed: true };
  }

  /**
   * Get current count for a key
   */
  async getCount(key) {
    if (this.redis) {
      try {
        const count = await this.redis.get(key);
        return parseInt(count) || 0;
      } catch (error) {
        logger.error('[RateLimitService] Redis get failed:', error);
        return this.getMemoryCount(key);
      }
    } else {
      return this.getMemoryCount(key);
    }
  }

  /**
   * Get count from memory store
   */
  getMemoryCount(key) {
    const entry = this.memoryStore.get(key);
    if (!entry) return 0;
    
    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return 0;
    }
    
    return entry.count;
  }

  /**
   * Get reset time for a key
   */
  async getResetTime(key) {
    if (this.redis) {
      try {
        const ttl = await this.redis.ttl(key);
        return ttl > 0 ? Date.now() + (ttl * 1000) : null;
      } catch (error) {
        logger.error('[RateLimitService] Redis TTL failed:', error);
        return this.getMemoryResetTime(key);
      }
    } else {
      return this.getMemoryResetTime(key);
    }
  }

  /**
   * Get reset time from memory store
   */
  getMemoryResetTime(key) {
    const entry = this.memoryStore.get(key);
    return entry ? entry.expiresAt : null;
  }

  /**
   * Record a request (increment counters)
   */
  async recordRequest(params) {
    const { clientIP, userId, fileId, mcpClientId } = params;
    
    const keys = [
      `${this.config.redisPrefix}ip:${clientIP}`,
      `${this.config.redisPrefix}user:${userId}`,
      `${this.config.redisPrefix}file:${fileId}`,
      `${this.config.redisPrefix}global`
    ];
    
    if (mcpClientId) {
      keys.push(`${this.config.redisPrefix}mcp:${mcpClientId}`);
    }
    
    if (this.redis) {
      try {
        const pipeline = this.redis.pipeline();
        
        for (const key of keys) {
          pipeline.incr(key);
          pipeline.expire(key, this.config.window);
        }
        
        await pipeline.exec();
      } catch (error) {
        logger.error('[RateLimitService] Redis record failed:', error);
        this.recordMemoryRequest(keys);
      }
    } else {
      this.recordMemoryRequest(keys);
    }
  }

  /**
   * Record request in memory store
   */
  recordMemoryRequest(keys) {
    const expiresAt = Date.now() + (this.config.window * 1000);
    
    for (const key of keys) {
      const entry = this.memoryStore.get(key);
      if (entry && Date.now() < entry.expiresAt) {
        entry.count++;
      } else {
        this.memoryStore.set(key, { count: 1, expiresAt });
      }
    }
  }

  /**
   * Clean up expired memory entries
   */
  cleanupMemory() {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore.entries()) {
      if (now > entry.expiresAt) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStatistics() {
    // This would be implemented to return current rate limit statistics
    // For now, return basic info
    return {
      config: this.config,
      redis: !!this.redis,
      memoryEntries: this.memoryStore.size
    };
  }

  /**
   * Create Express middleware for rate limiting
   */
  createMiddleware() {
    return async (req, res, next) => {
      try {
        const params = {
          clientIP: req.ip || req.connection.remoteAddress,
          userId: req.user?.id,
          fileId: req.params.fileId || req.body.fileId,
          mcpClientId: req.headers['x-mcp-client-id'],
          requestId: req.headers['x-request-id'] || `req-${Date.now()}`
        };

        const result = await this.checkRateLimit(params);

        if (!result.allowed) {
          const retryAfter = result.resetTime ?
            Math.ceil((result.resetTime - Date.now()) / 1000) : this.config.window;

          res.set({
            'X-RateLimit-Limit': result.limit,
            'X-RateLimit-Remaining': Math.max(0, result.limit - result.current),
            'X-RateLimit-Reset': result.resetTime,
            'Retry-After': retryAfter
          });

          return res.status(429).json({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            reason: result.reason,
            limit: result.limit,
            current: result.current,
            retryAfter
          });
        }

        next();
      } catch (error) {
        logger.error('[RateLimitService] Middleware error:', error);
        // Fail open - allow request if rate limiting fails
        next();
      }
    };
  }
}

// Create singleton instance
const rateLimitService = new RateLimitService();

// Clean up memory every 5 minutes
setInterval(() => {
  rateLimitService.cleanupMemory();
}, 5 * 60 * 1000);

module.exports = rateLimitService;
