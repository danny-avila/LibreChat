
const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
// const { SystemRoles } = require('librechat-data-provider'); // optional; not strictly needed
const {
  getUserActivityLogs,
  getUserActivitySummary
} = require('~/server/controllers/UserActivityController');
const { userActivityService } = require('~/server/services/UserActivityService');

const router = express.Router();
const sseAuthBridge = require('~/server/middleware/sseAuthBridge');

/**
 * GET /api/user-activity/logs
 * Query: page, limit, userId, action, startDate, endDate, includeTokenUsage, all
 */
router.get('/logs', requireJwtAuth, checkAdmin, getUserActivityLogs);

/**
 * GET /api/user-activity/user/:userId
 * Query: timeframe (24h, 7d, 30d)
 */
router.get('/user/:userId', requireJwtAuth, checkAdmin, getUserActivitySummary);

/**
 * GET /api/user-activity/my-activity
 */
router.get('/my-activity', requireJwtAuth, checkAdmin, async (req, res) => {
  req.params.userId = req.user.id;
  return getUserActivitySummary(req, res);
});

/**
 * GET /api/user-activity/stream  (Server-Sent Events)
 * Query: page, limit, userId, action, startDate, endDate, includeTokenUsage, all
 * Sends initial snapshot identical to /logs, then realtime single-item frames (same shape).
 */
router.get('/stream',sseAuthBridge, requireJwtAuth, checkAdmin, async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const role = req.user?.role || 'ADMIN'; // router is already admin-gated

  // mirror /logs query params + optional 'all'
  const {
    page, limit, userId, action, startDate, endDate, includeTokenUsage, all
  } = req.query;

  const options = {
    ...(page ? { page } : {}),
    ...(limit ? { limit } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(includeTokenUsage !== undefined ? { includeTokenUsage } : {}),
    ...(all !== undefined ? { all } : {})
  };

  await userActivityService.addClient(clientId, res, role, options);

  const cleanup = () => userActivityService.removeClient(clientId);
  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
