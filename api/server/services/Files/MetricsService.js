const { logger } = require('~/config');
const { DownloadToken } = require('~/models');

/**
 * Metrics and Monitoring Service for temporary file downloads
 * Collects and provides comprehensive metrics for download activities
 */
class MetricsService {
  constructor() {
    this.config = {
      enabled: process.env.TEMP_DOWNLOAD_METRICS_ENABLED === 'true',
      detailedLogging: process.env.TEMP_DOWNLOAD_DETAILED_LOGGING !== 'false',
      retentionPeriod: parseInt(process.env.TEMP_DOWNLOAD_AUDIT_RETENTION) || 7776000, // 90 days
      debug: process.env.TEMP_DOWNLOAD_DEBUG === 'true'
    };

    // In-memory metrics store (for real-time metrics)
    this.metrics = {
      downloads: {
        total: 0,
        successful: 0,
        failed: 0,
        blocked: 0
      },
      tokens: {
        generated: 0,
        used: 0,
        expired: 0
      },
      security: {
        ipBlocked: 0,
        fileTypeBlocked: 0,
        fileSizeBlocked: 0,
        rateLimited: 0
      },
      performance: {
        avgResponseTime: 0,
        totalRequests: 0,
        responseTimes: []
      }
    };

    // Start metrics collection if enabled
    if (this.config.enabled) {
      this.startMetricsCollection();
      logger.info('[MetricsService] Metrics collection enabled');
    } else {
      logger.info('[MetricsService] Metrics collection disabled');
    }
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    // Collect database metrics every 5 minutes
    this.dbMetricsInterval = setInterval(() => {
      this.collectDatabaseMetrics();
    }, 5 * 60 * 1000);

    // Reset performance metrics every hour
    this.performanceResetInterval = setInterval(() => {
      this.resetPerformanceMetrics();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop metrics collection
   */
  stopMetricsCollection() {
    if (this.dbMetricsInterval) {
      clearInterval(this.dbMetricsInterval);
    }
    if (this.performanceResetInterval) {
      clearInterval(this.performanceResetInterval);
    }
  }

  /**
   * Record download attempt
   */
  recordDownloadAttempt(params) {
    if (!this.config.enabled) return;

    const { success, blocked, reason, responseTime } = params;

    this.metrics.downloads.total++;
    
    if (blocked) {
      this.metrics.downloads.blocked++;
      this.recordSecurityEvent(reason);
    } else if (success) {
      this.metrics.downloads.successful++;
    } else {
      this.metrics.downloads.failed++;
    }

    if (responseTime) {
      this.recordResponseTime(responseTime);
    }

    if (this.config.detailedLogging) {
      logger.debug('[MetricsService] Download attempt recorded:', {
        success,
        blocked,
        reason,
        responseTime,
        totalDownloads: this.metrics.downloads.total
      });
    }
  }

  /**
   * Record token generation
   */
  recordTokenGeneration() {
    if (!this.config.enabled) return;
    this.metrics.tokens.generated++;
  }

  /**
   * Record token usage
   */
  recordTokenUsage() {
    if (!this.config.enabled) return;
    this.metrics.tokens.used++;
  }

  /**
   * Record security event
   */
  recordSecurityEvent(reason) {
    if (!this.config.enabled) return;

    switch (reason) {
      case 'ip_not_allowed':
      case 'ip_blocked':
        this.metrics.security.ipBlocked++;
        break;
      case 'file_type_not_allowed':
        this.metrics.security.fileTypeBlocked++;
        break;
      case 'file_size_exceeded':
        this.metrics.security.fileSizeBlocked++;
        break;
      case 'rate_limit_exceeded':
      case 'ip_limit_exceeded':
      case 'user_limit_exceeded':
      case 'file_limit_exceeded':
      case 'global_limit_exceeded':
      case 'mcp_limit_exceeded':
        this.metrics.security.rateLimited++;
        break;
    }
  }

  /**
   * Record response time
   */
  recordResponseTime(responseTime) {
    if (!this.config.enabled) return;

    this.metrics.performance.responseTimes.push(responseTime);
    this.metrics.performance.totalRequests++;

    // Keep only last 1000 response times for memory efficiency
    if (this.metrics.performance.responseTimes.length > 1000) {
      this.metrics.performance.responseTimes.shift();
    }

    // Calculate average response time
    const sum = this.metrics.performance.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.performance.avgResponseTime = sum / this.metrics.performance.responseTimes.length;
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.metrics.performance = {
      avgResponseTime: 0,
      totalRequests: 0,
      responseTimes: []
    };
    
    logger.debug('[MetricsService] Performance metrics reset');
  }

  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get token statistics
      const [hourlyStats, dailyStats, totalStats] = await Promise.all([
        this.getTokenStats(oneHourAgo),
        this.getTokenStats(oneDayAgo),
        this.getTokenStats(null)
      ]);

      logger.debug('[MetricsService] Database metrics collected:', {
        hourly: hourlyStats,
        daily: dailyStats,
        total: totalStats
      });

    } catch (error) {
      logger.error('[MetricsService] Failed to collect database metrics:', error);
    }
  }

  /**
   * Get token statistics from database
   */
  async getTokenStats(since) {
    const query = since ? { createdAt: { $gte: since } } : {};
    
    const stats = await DownloadToken.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          used: { $sum: { $cond: ['$used', 1, 0] } },
          expired: {
            $sum: {
              $cond: [
                { $lt: ['$expiresAt', new Date()] },
                1,
                0
              ]
            }
          },
          totalDownloads: { $sum: '$downloadCount' }
        }
      }
    ]);

    return stats[0] || { total: 0, used: 0, expired: 0, totalDownloads: 0 };
  }

  /**
   * Get comprehensive metrics
   */
  async getMetrics(timeframe = '1h') {
    const now = new Date();
    let since;

    switch (timeframe) {
      case '1h':
        since = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now.getTime() - 60 * 60 * 1000);
    }

    const [dbStats, performanceStats] = await Promise.all([
      this.getTokenStats(since),
      this.getPerformanceMetrics()
    ]);

    return {
      timeframe,
      period: {
        start: since.toISOString(),
        end: now.toISOString()
      },
      downloads: {
        ...this.metrics.downloads,
        database: dbStats
      },
      tokens: {
        ...this.metrics.tokens,
        database: dbStats
      },
      security: this.metrics.security,
      performance: performanceStats,
      system: {
        enabled: this.config.enabled,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const responseTimes = this.metrics.performance.responseTimes;
    
    if (responseTimes.length === 0) {
      return {
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        totalRequests: this.metrics.performance.totalRequests
      };
    }

    const sorted = [...responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      avgResponseTime: this.metrics.performance.avgResponseTime,
      minResponseTime: sorted[0],
      maxResponseTime: sorted[sorted.length - 1],
      p95ResponseTime: sorted[p95Index],
      totalRequests: this.metrics.performance.totalRequests
    };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      const metrics = await this.getMetrics('1h');
      const errorRate = metrics.downloads.total > 0 ? 
        (metrics.downloads.failed / metrics.downloads.total) * 100 : 0;
      
      const isHealthy = errorRate < 10 && metrics.performance.avgResponseTime < 5000;

      return {
        healthy: isHealthy,
        errorRate,
        avgResponseTime: metrics.performance.avgResponseTime,
        totalRequests: metrics.downloads.total,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[MetricsService] Failed to get health status:', error);
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Create Express middleware for metrics collection
   */
  createMetricsMiddleware() {
    return (req, res, next) => {
      if (!this.config.enabled) {
        return next();
      }

      const startTime = Date.now();

      // Override res.json to capture response
      const originalJson = res.json;
      res.json = function(data) {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 300;
        const blocked = res.statusCode === 403 || res.statusCode === 429;

        // Extract reason from response data
        let reason = null;
        if (blocked && data && data.code) {
          reason = data.code.toLowerCase();
        }

        // Record metrics
        metricsService.recordDownloadAttempt({
          success,
          blocked,
          reason,
          responseTime
        });

        return originalJson.call(this, data);
      };

      next();
    };
  }
}

// Create singleton instance
const metricsService = new MetricsService();

module.exports = metricsService;
