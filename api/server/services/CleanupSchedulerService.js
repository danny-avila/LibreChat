const { logger } = require('~/config');
const TokenStorageService = require('./Files/TokenStorageService');
const activeFileContextService = require('./Files/ActiveFileContextService');
const auditService = require('./Files/AuditService');
const { deleteNullOrEmptyConversations } = require('~/models/Conversation');

/**
 * Comprehensive cleanup scheduler service for LibreChat
 * Handles expired tokens, file contexts, and database maintenance
 */
class CleanupSchedulerService {
  constructor() {
    this.intervals = new Map();
    this.isRunning = false;
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      tokensCleanedUp: 0,
      contextsCleanedUp: 0,
      conversationsCleanedUp: 0,
      errors: 0
    };

    // Configuration from environment variables
    this.config = {
      // Global feature toggle
      enabled: process.env.TEMP_DOWNLOAD_ENABLED !== 'false',

      // Main cleanup interval (default: 5 minutes)
      cleanupInterval: parseInt(process.env.TEMP_DOWNLOAD_CLEANUP_INTERVAL) || 300,

      // Token cleanup (default: enabled)
      tokenCleanupEnabled: process.env.TEMP_DOWNLOAD_AUTO_CLEANUP !== 'false',

      // File context cleanup (default: enabled)
      contextCleanupEnabled: true,

      // Conversation cleanup (default: enabled, runs less frequently)
      conversationCleanupEnabled: true,
      conversationCleanupInterval: 30 * 60, // 30 minutes

      // Audit retention (default: 90 days)
      auditRetention: parseInt(process.env.TEMP_DOWNLOAD_AUDIT_RETENTION) || 7776000,

      // Rate limit data retention (default: 24 hours)
      rateLimitRetention: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_RETENTION) || 86400,

      // Debug mode
      debug: process.env.TEMP_DOWNLOAD_DEBUG === 'true'
    };

    logger.info('[CleanupScheduler] Service initialized with config:', this.config);
  }

  /**
   * Start the cleanup scheduler
   */
  start() {
    if (!this.config.enabled) {
      logger.info('[CleanupScheduler] Cleanup scheduler disabled by TEMP_DOWNLOAD_ENABLED=false');
      return;
    }

    if (this.isRunning) {
      logger.warn('[CleanupScheduler] Service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('[CleanupScheduler] Starting cleanup scheduler service');

    // Main cleanup interval
    if (this.config.cleanupInterval > 0) {
      const mainInterval = setInterval(() => {
        this.runMainCleanup();
      }, this.config.cleanupInterval * 1000);
      
      this.intervals.set('main', mainInterval);
      logger.info(`[CleanupScheduler] Main cleanup scheduled every ${this.config.cleanupInterval} seconds`);
    }

    // Conversation cleanup interval (less frequent)
    if (this.config.conversationCleanupEnabled && this.config.conversationCleanupInterval > 0) {
      const conversationInterval = setInterval(() => {
        this.runConversationCleanup();
      }, this.config.conversationCleanupInterval * 1000);
      
      this.intervals.set('conversation', conversationInterval);
      logger.info(`[CleanupScheduler] Conversation cleanup scheduled every ${this.config.conversationCleanupInterval} seconds`);
    }

    // Run initial cleanup after a short delay
    setTimeout(() => {
      this.runMainCleanup();
    }, 10000); // 10 seconds delay
  }

  /**
   * Stop the cleanup scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[CleanupScheduler] Service is not running');
      return;
    }

    this.isRunning = false;
    logger.info('[CleanupScheduler] Stopping cleanup scheduler service');

    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      logger.debug(`[CleanupScheduler] Cleared ${name} interval`);
    }
    
    this.intervals.clear();
  }

  /**
   * Run main cleanup tasks
   */
  async runMainCleanup() {
    const startTime = Date.now();
    this.stats.totalRuns++;
    this.stats.lastRun = new Date();

    try {
      logger.debug('[CleanupScheduler] Starting main cleanup cycle');

      const results = await Promise.allSettled([
        this.cleanupExpiredTokens(),
        this.cleanupFileContexts(),
        this.cleanupAuditLogs(),
        this.cleanupRateLimitData()
      ]);

      // Process results
      let hasErrors = false;
      results.forEach((result, index) => {
        const taskNames = ['tokens', 'contexts', 'audit', 'rateLimit'];
        if (result.status === 'rejected') {
          logger.error(`[CleanupScheduler] ${taskNames[index]} cleanup failed:`, result.reason);
          hasErrors = true;
        }
      });

      if (hasErrors) {
        this.stats.errors++;
      }

      const duration = Date.now() - startTime;
      logger.info(`[CleanupScheduler] Main cleanup cycle completed in ${duration}ms`);

      if (this.config.debug) {
        logger.debug('[CleanupScheduler] Cleanup stats:', this.getStats());
      }

    } catch (error) {
      this.stats.errors++;
      logger.error('[CleanupScheduler] Main cleanup cycle failed:', error);
    }
  }

  /**
   * Run conversation cleanup (less frequent)
   */
  async runConversationCleanup() {
    try {
      logger.debug('[CleanupScheduler] Starting conversation cleanup');
      
      const result = await deleteNullOrEmptyConversations();
      this.stats.conversationsCleanedUp += result.deletedCount || 0;
      
      logger.info(`[CleanupScheduler] Cleaned up ${result.deletedCount || 0} empty conversations`);
    } catch (error) {
      this.stats.errors++;
      logger.error('[CleanupScheduler] Conversation cleanup failed:', error);
    }
  }

  /**
   * Clean up expired download tokens
   */
  async cleanupExpiredTokens() {
    if (!this.config.tokenCleanupEnabled) {
      return;
    }

    try {
      const deletedCount = await TokenStorageService.cleanupExpiredTokens();
      this.stats.tokensCleanedUp += deletedCount;
      
      if (deletedCount > 0) {
        logger.info(`[CleanupScheduler] Cleaned up ${deletedCount} expired tokens`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('[CleanupScheduler] Token cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up expired file contexts
   */
  async cleanupFileContexts() {
    if (!this.config.contextCleanupEnabled) {
      return;
    }

    try {
      const beforeCount = activeFileContextService.getStats().activeContexts;
      activeFileContextService.cleanup();
      const afterCount = activeFileContextService.getStats().activeContexts;
      
      const cleanedCount = beforeCount - afterCount;
      this.stats.contextsCleanedUp += cleanedCount;
      
      if (cleanedCount > 0) {
        logger.info(`[CleanupScheduler] Cleaned up ${cleanedCount} expired file contexts`);
      }
      
      return cleanedCount;
    } catch (error) {
      logger.error('[CleanupScheduler] File context cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupAuditLogs() {
    try {
      const deletedCount = await auditService.cleanupOldLogs();

      if (deletedCount > 0) {
        logger.info(`[CleanupScheduler] Cleaned up ${deletedCount} old audit logs`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('[CleanupScheduler] Audit log cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old rate limit data (placeholder for future implementation)
   */
  async cleanupRateLimitData() {
    // TODO: Implement rate limit data cleanup when rate limiting is added
    // This would clean up rate limit data older than rateLimitRetention seconds
    return 0;
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      activeIntervals: Array.from(this.intervals.keys()),
      config: this.config
    };
  }

  /**
   * Force run cleanup (for testing or manual triggers)
   */
  async forceCleanup() {
    logger.info('[CleanupScheduler] Force cleanup requested');
    await this.runMainCleanup();
    if (this.config.conversationCleanupEnabled) {
      await this.runConversationCleanup();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    logger.info('[CleanupScheduler] Configuration updated:', {
      old: oldConfig,
      new: this.config
    });

    // Restart if running to apply new intervals
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    const now = Date.now();
    const lastRunAge = this.stats.lastRun ? now - this.stats.lastRun.getTime() : null;
    const maxAge = this.config.cleanupInterval * 2 * 1000; // 2x the interval
    
    return {
      healthy: this.isRunning && (!lastRunAge || lastRunAge < maxAge),
      isRunning: this.isRunning,
      lastRun: this.stats.lastRun,
      lastRunAge,
      maxAge,
      stats: this.getStats()
    };
  }
}

// Create singleton instance
const cleanupScheduler = new CleanupSchedulerService();

module.exports = cleanupScheduler;
