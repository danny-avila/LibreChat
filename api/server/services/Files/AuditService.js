const { logger } = require('~/config');
const mongoose = require('mongoose');

/**
 * Audit Logging Service for temporary file downloads
 * Provides comprehensive audit trail for security and compliance
 */
class AuditService {
  constructor() {
    this.config = {
      enabled: process.env.TEMP_DOWNLOAD_DETAILED_LOGGING !== 'false',
      retentionPeriod: parseInt(process.env.TEMP_DOWNLOAD_AUDIT_RETENTION) || 7776000, // 90 days
      logSecurityEvents: process.env.TEMP_DOWNLOAD_LOG_SECURITY_EVENTS !== 'false',
      logAttempts: process.env.TEMP_DOWNLOAD_LOG_ATTEMPTS !== 'false'
    };

    this.initializeAuditCollection();
    
    logger.info('[AuditService] Initialized with config:', {
      enabled: this.config.enabled,
      retentionDays: Math.floor(this.config.retentionPeriod / 86400),
      logSecurityEvents: this.config.logSecurityEvents,
      logAttempts: this.config.logAttempts
    });
  }

  /**
   * Initialize audit log collection in MongoDB
   */
  async initializeAuditCollection() {
    try {
      // Create audit log schema if it doesn't exist
      const auditSchema = new mongoose.Schema({
        eventType: {
          type: String,
          required: true,
          index: true
        },
        timestamp: {
          type: Date,
          default: Date.now,
          index: true
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          index: true
        },
        fileId: {
          type: String,
          index: true
        },
        clientIP: {
          type: String,
          required: true,
          index: true
        },
        userAgent: String,
        requestId: String,
        success: Boolean,
        statusCode: Number,
        errorMessage: String,
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        },
        securityViolations: [{
          type: String,
          message: String
        }],
        responseTime: Number,
        mcpClientId: String
      }, {
        timestamps: true,
        collection: 'downloadauditlogs'
      });

      // TTL index for automatic cleanup
      auditSchema.index({ timestamp: 1 }, { expireAfterSeconds: this.config.retentionPeriod });

      // Compound indexes for efficient queries
      auditSchema.index({ eventType: 1, timestamp: -1 });
      auditSchema.index({ userId: 1, timestamp: -1 });
      auditSchema.index({ clientIP: 1, timestamp: -1 });
      auditSchema.index({ success: 1, timestamp: -1 });

      // Create model if it doesn't exist
      if (!mongoose.models.DownloadAuditLog) {
        this.AuditLog = mongoose.model('DownloadAuditLog', auditSchema);
      } else {
        this.AuditLog = mongoose.models.DownloadAuditLog;
      }

    } catch (error) {
      logger.error('[AuditService] Failed to initialize audit collection:', error);
    }
  }

  /**
   * Log download attempt
   */
  async logDownloadAttempt(params) {
    if (!this.config.enabled || !this.config.logAttempts) {
      return;
    }

    try {
      const {
        success,
        clientIP,
        userId,
        fileId,
        filename,
        statusCode,
        error,
        requestId,
        userAgent,
        responseTime,
        mcpClientId
      } = params;

      const auditEntry = {
        eventType: 'download_attempt',
        userId,
        fileId,
        clientIP,
        userAgent,
        requestId,
        success,
        statusCode,
        errorMessage: error?.message,
        responseTime,
        mcpClientId,
        metadata: {
          filename,
          timestamp: new Date().toISOString()
        }
      };

      await this.saveAuditLog(auditEntry);

      if (this.config.logSecurityEvents && !success) {
        logger.warn('[AuditService] Failed download attempt logged:', {
          clientIP,
          userId,
          fileId,
          error: error?.message,
          requestId
        });
      }

    } catch (error) {
      logger.error('[AuditService] Failed to log download attempt:', error);
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(params) {
    if (!this.config.enabled || !this.config.logSecurityEvents) {
      return;
    }

    try {
      const {
        type,
        clientIP,
        userId,
        fileId,
        violations,
        requestId,
        userAgent,
        mcpClientId,
        metadata = {}
      } = params;

      const auditEntry = {
        eventType: 'security_event',
        userId,
        fileId,
        clientIP,
        userAgent,
        requestId,
        success: false,
        mcpClientId,
        securityViolations: violations || [{ type, message: `Security event: ${type}` }],
        metadata: {
          ...metadata,
          securityEventType: type,
          timestamp: new Date().toISOString()
        }
      };

      await this.saveAuditLog(auditEntry);

      logger.warn('[AuditService] Security event logged:', {
        type,
        clientIP,
        userId,
        fileId,
        violations,
        requestId
      });

    } catch (error) {
      logger.error('[AuditService] Failed to log security event:', error);
    }
  }

  /**
   * Log token generation
   */
  async logTokenGeneration(params) {
    if (!this.config.enabled) {
      return;
    }

    try {
      const {
        userId,
        fileId,
        clientIP,
        userAgent,
        requestId,
        tokenId,
        expiresAt,
        singleUse,
        mcpClientId
      } = params;

      const auditEntry = {
        eventType: 'token_generated',
        userId,
        fileId,
        clientIP,
        userAgent,
        requestId,
        success: true,
        mcpClientId,
        metadata: {
          tokenId,
          expiresAt,
          singleUse,
          timestamp: new Date().toISOString()
        }
      };

      await this.saveAuditLog(auditEntry);

    } catch (error) {
      logger.error('[AuditService] Failed to log token generation:', error);
    }
  }

  /**
   * Log rate limit event
   */
  async logRateLimitEvent(params) {
    if (!this.config.enabled || !this.config.logSecurityEvents) {
      return;
    }

    try {
      const {
        reason,
        clientIP,
        userId,
        fileId,
        limit,
        current,
        resetTime,
        requestId,
        userAgent,
        mcpClientId
      } = params;

      const auditEntry = {
        eventType: 'rate_limit_exceeded',
        userId,
        fileId,
        clientIP,
        userAgent,
        requestId,
        success: false,
        statusCode: 429,
        mcpClientId,
        metadata: {
          reason,
          limit,
          current,
          resetTime,
          timestamp: new Date().toISOString()
        }
      };

      await this.saveAuditLog(auditEntry);

    } catch (error) {
      logger.error('[AuditService] Failed to log rate limit event:', error);
    }
  }

  /**
   * Save audit log entry to database
   */
  async saveAuditLog(entry) {
    if (!this.AuditLog) {
      await this.initializeAuditCollection();
    }

    if (this.AuditLog) {
      const auditLog = new this.AuditLog(entry);
      await auditLog.save();
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters = {}) {
    try {
      if (!this.AuditLog) {
        return [];
      }

      const {
        eventType,
        userId,
        clientIP,
        fileId,
        success,
        startDate,
        endDate,
        limit = 100,
        skip = 0
      } = filters;

      const query = {};

      if (eventType) query.eventType = eventType;
      if (userId) query.userId = userId;
      if (clientIP) query.clientIP = clientIP;
      if (fileId) query.fileId = fileId;
      if (success !== undefined) query.success = success;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const logs = await this.AuditLog.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return logs;

    } catch (error) {
      logger.error('[AuditService] Failed to get audit logs:', error);
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(timeframe = '24h') {
    try {
      if (!this.AuditLog) {
        return {};
      }

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
        default:
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const stats = await this.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            successCount: { $sum: { $cond: ['$success', 1, 0] } },
            failureCount: { $sum: { $cond: ['$success', 0, 1] } }
          }
        }
      ]);

      return {
        timeframe,
        period: { start: since, end: now },
        eventTypes: stats
      };

    } catch (error) {
      logger.error('[AuditService] Failed to get audit statistics:', error);
      return {};
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs() {
    try {
      if (!this.AuditLog) {
        return 0;
      }

      const cutoffDate = new Date(Date.now() - this.config.retentionPeriod * 1000);
      const result = await this.AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      if (result.deletedCount > 0) {
        logger.info(`[AuditService] Cleaned up ${result.deletedCount} old audit logs`);
      }

      return result.deletedCount;

    } catch (error) {
      logger.error('[AuditService] Failed to cleanup old audit logs:', error);
      return 0;
    }
  }
}

// Create singleton instance
const auditService = new AuditService();

module.exports = auditService;
