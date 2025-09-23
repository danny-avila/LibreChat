// api/server/middleware/limiters/redisRateLimiter.js
const { RateLimiterRedis } = require('rate-limiter-flexible');
const { redisClients } = require('../../../cache/redisClients');
const { LoggingSystem } = require('../../../utils/LoggingSystem');
const logger = new LoggingSystem();

class RedisRateLimiter {
  constructor() {
    this.limiters = new Map();
    this.redisClient = redisClients.getRateLimitClient();
  }

  initializeLimiter(key, points, duration, options = {}) {
    const limiterKey = `${key}_${points}_${duration}`;

    if (!this.limiters.has(limiterKey)) {
      const limiter = new RateLimiterRedis({
        storeClient: this.redisClient,
        keyPrefix: `rate_limit:${key}`,
        points: points,
        duration: duration,
        blockDuration: options.blockDuration || 0,
        execEvenly: options.execEvenly || false,
        insuranceLimiter: options.insuranceLimiter,
      });

      this.limiters.set(limiterKey, limiter);
    }

    return this.limiters.get(limiterKey);
  }

  async consume(key, points = 1, options = {}) {
    try {
      const { points: limitPoints, duration, ...limiterOptions } = options;
      const limiter = this.initializeLimiter(
        key,
        limitPoints || 10,
        duration || 60,
        limiterOptions,
      );

      await limiter.consume(key, points);
      return { success: true };
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        logger.error('Rate limiter error:', rejRes);
        throw rejRes;
      }

      return {
        success: false,
        msBeforeNext: rejRes.msBeforeNext,
        remainingPoints: rejRes.remainingPoints,
        consumedPoints: rejRes.consumedPoints,
      };
    }
  }

  async get(key) {
    try {
      const res = await this.redisClient.get(`rate_limit:${key}`);
      return res ? JSON.parse(res) : null;
    } catch (error) {
      logger.error('Error getting rate limit info:', error);
      return null;
    }
  }

  async delete(key) {
    try {
      const keys = await this.redisClient.keys(`rate_limit:${key}*`);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Error deleting rate limit keys:', error);
      return false;
    }
  }

  async getStats() {
    try {
      const keys = await this.redisClient.keys('rate_limit:*');
      const stats = {};

      for (const key of keys) {
        const data = await this.redisClient.get(key);
        if (data) {
          stats[key] = JSON.parse(data);
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting rate limit stats:', error);
      return {};
    }
  }
}

module.exports = new RedisRateLimiter();
