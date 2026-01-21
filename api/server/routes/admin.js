const express = require('express');
const {
  getOverviewMetrics,
  getUserMetrics,
  getConversationMetrics,
  getTokenMetrics,
  getMessageMetrics,
  getModelUsageMetrics,
  getBalanceMetrics,
  getErrorMetrics,
  getFileUploadMetrics,
  getUserEngagementMetrics,
  getEndpointPerformanceMetrics,
  getConversationQualityMetrics,
  getLiveData,
  exportData,
} = require('~/server/controllers/AdminDashboardController');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const { validateTimeRange } = require('~/server/middleware/adminAuth');

const router = express.Router();

/**
 * Admin Dashboard Routes
 * All routes require JWT authentication and admin role
 * Time range validation is applied to GET endpoints that accept date parameters
 */

// Apply JWT authentication to all routes in this router (following LibreChat pattern)
router.use(requireJwtAuth);

// GET /api/admin/dashboard/overview - Get overview metrics
router.get(
  '/dashboard/overview',
  checkAdmin,
  validateTimeRange,
  getOverviewMetrics,
);

// GET /api/admin/dashboard/users - Get user metrics
router.get(
  '/dashboard/users',
  checkAdmin,
  validateTimeRange,
  getUserMetrics,
);

// GET /api/admin/dashboard/conversations - Get conversation metrics
router.get(
  '/dashboard/conversations',
  checkAdmin,
  validateTimeRange,
  getConversationMetrics,
);

// GET /api/admin/dashboard/tokens - Get token metrics
router.get(
  '/dashboard/tokens',
  checkAdmin,
  validateTimeRange,
  getTokenMetrics,
);

// GET /api/admin/dashboard/messages - Get message metrics
router.get(
  '/dashboard/messages',
  checkAdmin,
  validateTimeRange,
  getMessageMetrics,
);

// GET /api/admin/dashboard/models - Get model usage analytics
router.get(
  '/dashboard/models',
  checkAdmin,
  validateTimeRange,
  getModelUsageMetrics,
);

// GET /api/admin/dashboard/balance - Get balance and credits analytics
router.get(
  '/dashboard/balance',
  checkAdmin,
  validateTimeRange,
  getBalanceMetrics,
);

// GET /api/admin/dashboard/errors - Get error and failure analytics
router.get(
  '/dashboard/errors',
  checkAdmin,
  validateTimeRange,
  getErrorMetrics,
);

// GET /api/admin/dashboard/files - Get file upload analytics
router.get(
  '/dashboard/files',
  checkAdmin,
  validateTimeRange,
  getFileUploadMetrics,
);

// GET /api/admin/dashboard/engagement - Get user engagement metrics
router.get(
  '/dashboard/engagement',
  checkAdmin,
  validateTimeRange,
  getUserEngagementMetrics,
);

// GET /api/admin/dashboard/endpoints - Get endpoint performance metrics
router.get(
  '/dashboard/endpoints',
  checkAdmin,
  validateTimeRange,
  getEndpointPerformanceMetrics,
);

// GET /api/admin/dashboard/quality - Get conversation quality metrics
router.get(
  '/dashboard/quality',
  checkAdmin,
  validateTimeRange,
  getConversationQualityMetrics,
);

// GET /api/admin/dashboard/live - Get live/real-time data (no time range needed)
router.get(
  '/dashboard/live',
  checkAdmin,
  getLiveData,
);

// POST /api/admin/dashboard/export - Export dashboard data
router.post(
  '/dashboard/export',
  checkAdmin,
  exportData,
);

module.exports = router;
