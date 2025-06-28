const { logger } = require('~/config');
const cleanupScheduler = require('~/server/services/CleanupSchedulerService');
const metricsService = require('~/server/services/Files/MetricsService');
const auditService = require('~/server/services/Files/AuditService');
const configValidationService = require('~/server/services/Files/ConfigValidationService');
const indexManagementService = require('~/server/services/Files/IndexManagementService');

/**
 * Get cleanup scheduler status and statistics
 * GET /api/files/cleanup/status
 */
const getCleanupStatus = async (req, res) => {
  try {
    const stats = cleanupScheduler.getStats();
    const health = cleanupScheduler.healthCheck();
    
    res.json({
      success: true,
      data: {
        status: health.healthy ? 'healthy' : 'unhealthy',
        isRunning: health.isRunning,
        lastRun: health.lastRun,
        stats,
        health
      }
    });
  } catch (error) {
    logger.error('Failed to get cleanup status', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to get cleanup status',
      code: 'CLEANUP_STATUS_FAILED'
    });
  }
};

/**
 * Force run cleanup tasks
 * POST /api/files/cleanup/force
 */
const forceCleanup = async (req, res) => {
  try {
    const { taskType = 'all' } = req.body;
    
    logger.info('Force cleanup requested', {
      userId: req.user?.id,
      taskType,
      clientIP: req.ip
    });
    
    let result;
    
    switch (taskType) {
      case 'tokens':
        result = await cleanupScheduler.cleanupExpiredTokens();
        break;
      case 'contexts':
        result = await cleanupScheduler.cleanupFileContexts();
        break;
      case 'conversations':
        result = await cleanupScheduler.runConversationCleanup();
        break;
      case 'all':
      default:
        await cleanupScheduler.forceCleanup();
        result = 'All cleanup tasks executed';
        break;
    }
    
    res.json({
      success: true,
      data: {
        message: 'Cleanup completed successfully',
        taskType,
        result,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Force cleanup failed', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Force cleanup failed',
      code: 'FORCE_CLEANUP_FAILED'
    });
  }
};

/**
 * Update cleanup scheduler configuration
 * PUT /api/files/cleanup/config
 */
const updateCleanupConfig = async (req, res) => {
  try {
    const { config } = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: 'Invalid configuration provided',
        code: 'INVALID_CONFIG'
      });
    }
    
    // Validate configuration values
    const validKeys = [
      'cleanupInterval',
      'tokenCleanupEnabled',
      'contextCleanupEnabled',
      'conversationCleanupEnabled',
      'conversationCleanupInterval',
      'debug'
    ];
    
    const invalidKeys = Object.keys(config).filter(key => !validKeys.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: `Invalid configuration keys: ${invalidKeys.join(', ')}`,
        code: 'INVALID_CONFIG_KEYS'
      });
    }
    
    // Validate numeric values
    if (config.cleanupInterval !== undefined && (isNaN(config.cleanupInterval) || config.cleanupInterval < 0)) {
      return res.status(400).json({
        error: 'cleanupInterval must be a non-negative number',
        code: 'INVALID_CLEANUP_INTERVAL'
      });
    }
    
    if (config.conversationCleanupInterval !== undefined && (isNaN(config.conversationCleanupInterval) || config.conversationCleanupInterval < 0)) {
      return res.status(400).json({
        error: 'conversationCleanupInterval must be a non-negative number',
        code: 'INVALID_CONVERSATION_INTERVAL'
      });
    }
    
    logger.info('Cleanup configuration update requested', {
      userId: req.user?.id,
      config,
      clientIP: req.ip
    });
    
    cleanupScheduler.updateConfig(config);
    
    res.json({
      success: true,
      data: {
        message: 'Configuration updated successfully',
        newConfig: cleanupScheduler.getStats().config,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to update cleanup configuration', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to update configuration',
      code: 'CONFIG_UPDATE_FAILED'
    });
  }
};

/**
 * Start cleanup scheduler
 * POST /api/files/cleanup/start
 */
const startCleanup = async (req, res) => {
  try {
    logger.info('Cleanup scheduler start requested', {
      userId: req.user?.id,
      clientIP: req.ip
    });
    
    cleanupScheduler.start();
    
    res.json({
      success: true,
      data: {
        message: 'Cleanup scheduler started successfully',
        status: cleanupScheduler.getStats(),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to start cleanup scheduler', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to start cleanup scheduler',
      code: 'START_CLEANUP_FAILED'
    });
  }
};

/**
 * Stop cleanup scheduler
 * POST /api/files/cleanup/stop
 */
const stopCleanup = async (req, res) => {
  try {
    logger.info('Cleanup scheduler stop requested', {
      userId: req.user?.id,
      clientIP: req.ip
    });
    
    cleanupScheduler.stop();
    
    res.json({
      success: true,
      data: {
        message: 'Cleanup scheduler stopped successfully',
        status: cleanupScheduler.getStats(),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to stop cleanup scheduler', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to stop cleanup scheduler',
      code: 'STOP_CLEANUP_FAILED'
    });
  }
};

/**
 * Get cleanup scheduler health check
 * GET /api/files/cleanup/health
 */
const getCleanupHealth = async (req, res) => {
  try {
    const health = cleanupScheduler.healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: health.healthy,
      data: health
    });
    
  } catch (error) {
    logger.error('Failed to get cleanup health', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to get cleanup health',
      code: 'HEALTH_CHECK_FAILED'
    });
  }
};

/**
 * Get comprehensive system health including metrics
 * GET /api/files/cleanup/system-health
 */
const getSystemHealth = async (req, res) => {
  try {
    const [cleanupHealth, metricsHealth] = await Promise.all([
      cleanupScheduler.healthCheck(),
      metricsService.getHealthStatus()
    ]);

    const overallHealth = cleanupHealth.healthy && metricsHealth.healthy;

    res.status(overallHealth ? 200 : 503).json({
      success: overallHealth,
      data: {
        overall: {
          healthy: overallHealth,
          timestamp: new Date().toISOString()
        },
        cleanup: cleanupHealth,
        metrics: metricsHealth,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });

  } catch (error) {
    logger.error('Failed to get system health', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to get system health',
      code: 'SYSTEM_HEALTH_FAILED'
    });
  }
};

/**
 * Get audit logs with filtering
 * GET /api/files/cleanup/audit-logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      userId: req.query.userId,
      clientIP: req.query.clientIP,
      fileId: req.query.fileId,
      success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 100,
      skip: parseInt(req.query.skip) || 0
    };

    const logs = await auditService.getAuditLogs(filters);

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length,
        filters
      }
    });

  } catch (error) {
    logger.error('Failed to get audit logs', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to get audit logs',
      code: 'AUDIT_LOGS_FAILED'
    });
  }
};

/**
 * Get configuration validation and summary
 * GET /api/files/cleanup/config-validation
 */
const getConfigValidation = async (req, res) => {
  try {
    const validation = configValidationService.validateConfiguration();
    const summary = configValidationService.getConfigurationSummary();

    res.json({
      success: true,
      data: {
        validation,
        summary,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get configuration validation', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to get configuration validation',
      code: 'CONFIG_VALIDATION_FAILED'
    });
  }
};

/**
 * Get MongoDB index status
 * GET /api/files/cleanup/index-status
 */
const getIndexStatus = async (req, res) => {
  try {
    const indexStatus = await indexManagementService.getIndexStatus();

    res.json({
      success: true,
      data: indexStatus
    });

  } catch (error) {
    logger.error('Failed to get index status', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to get index status',
      code: 'INDEX_STATUS_FAILED'
    });
  }
};

/**
 * Force recreate indexes (development only)
 * POST /api/files/cleanup/recreate-indexes
 */
const recreateIndexes = async (req, res) => {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Index recreation is not allowed in production',
        code: 'PRODUCTION_FORBIDDEN'
      });
    }

    logger.warn('Index recreation requested', {
      userId: req.user?.id,
      clientIP: req.ip
    });

    await indexManagementService.recreateIndexes();

    res.json({
      success: true,
      data: {
        message: 'Indexes recreated successfully',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to recreate indexes', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to recreate indexes',
      code: 'INDEX_RECREATION_FAILED'
    });
  }
};

module.exports = {
  getCleanupStatus,
  forceCleanup,
  updateCleanupConfig,
  startCleanup,
  stopCleanup,
  getCleanupHealth,
  getSystemHealth,
  getAuditLogs,
  getConfigValidation,
  getIndexStatus,
  recreateIndexes
};
