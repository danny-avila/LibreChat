const express = require('express');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
} = require('~/server/middleware');
const {
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
} = require('~/server/controllers/files/cleanupController');

const router = express.Router();

// Middleware for parsing user agent
router.use(uaParser);

// All cleanup endpoints require authentication
router.use(requireJwtAuth);
router.use(checkBan);

// TODO: Add admin role check middleware when role system is implemented
// router.use(requireAdminRole);

// Get cleanup scheduler status and statistics
router.get('/status', getCleanupStatus);

// Get cleanup scheduler health check
router.get('/health', getCleanupHealth);

// Force run cleanup tasks
router.post('/force', forceCleanup);

// Update cleanup scheduler configuration
router.put('/config', updateCleanupConfig);

// Start cleanup scheduler
router.post('/start', startCleanup);

// Stop cleanup scheduler
router.post('/stop', stopCleanup);

// Get comprehensive system health
router.get('/system-health', getSystemHealth);

// Get audit logs
router.get('/audit-logs', getAuditLogs);

// Get configuration validation
router.get('/config-validation', getConfigValidation);

// Get MongoDB index status
router.get('/index-status', getIndexStatus);

// Recreate indexes (development only)
router.post('/recreate-indexes', recreateIndexes);

module.exports = router;
