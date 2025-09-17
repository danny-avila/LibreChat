const { logger } = require('~/config/winston');
const ioredisClient = require('./ioredisClient');

class RedisHealthCheck {
  constructor() {
    this.lastPingTime = null;
    this.isHealthy = false;
    this.checkInterval = null;
  }

  start() {
    // Initial health check
    this.checkHealth();
    
    // Schedule periodic health checks
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, 30000); // Check every 30 seconds
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  async checkHealth() {
    if (!ioredisClient) {
      logger.warn('[Redis] Health check skipped: Redis client not initialized');
      return false;
    }

    try {
      const startTime = Date.now();
      await ioredisClient.ping();
      const latency = Date.now() - startTime;
      
      this.lastPingTime = new Date();
      this.isHealthy = true;
      
      logger.info(`[Redis] Health check passed. Latency: ${latency}ms`);
      return true;
    } catch (error) {
      this.isHealthy = false;
      logger.error(`[Redis] Health check failed: ${error.message}`);
      
      // Attempt to reconnect if connection is lost
      if (ioredisClient.status !== 'connecting' && ioredisClient.status !== 'reconnecting') {
        logger.warn('[Redis] Attempting to reconnect...');
        ioredisClient.disconnect();
        ioredisClient.connect().catch(err => {
          logger.error('[Redis] Reconnection attempt failed:', err.message);
        });
      }
      
      return false;
    }
  }

  getStatus() {
    return {
      isHealthy: this.isHealthy,
      lastPingTime: this.lastPingTime,
      status: ioredisClient ? ioredisClient.status : 'disconnected'
    };
  }
}

// Create and export singleton instance
const redisHealth = new RedisHealthCheck();

// Start health check when imported
if (process.env.NODE_ENV !== 'test') {
  redisHealth.start();
}

module.exports = redisHealth;
