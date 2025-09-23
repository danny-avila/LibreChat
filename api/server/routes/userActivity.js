const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const sseAuthBridge = require('~/server/middleware/sseAuthBridge');
const { userActivityService } = require('~/server/services/UserActivityService');
const { 
  getUserActivityLogs, 
  getUserActivitySummary, 
  exportActivityLogs 
} = require('~/server/controllers/UserActivityController');
const { UserActivityLog } = require('~/db/models');
const { logger } = require('~/config');

const router = express.Router();

// GET logs (HTTP)
router.get('/logs', requireJwtAuth, checkAdmin, getUserActivityLogs);
router.get('/summary', requireJwtAuth, checkAdmin, getUserActivitySummary);

// Test endpoint to check database
router.get('/test', requireJwtAuth, checkAdmin, async (req, res) => {
  try {
    const totalCount = await UserActivityLog.countDocuments({});
    const recentLogs = await UserActivityLog.find({}).sort({ timestamp: -1 }).limit(5).lean();
    
    logger.info('[UserActivity] Test endpoint - Total logs:', totalCount);
    logger.info('[UserActivity] Test endpoint - Recent logs:', recentLogs);
    
    res.json({
      success: true,
      data: {
        totalCount,
        recentLogs,
        message: 'Database check completed'
      }
    });
  } catch (error) {
    logger.error('[UserActivity] Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check database',
      details: error.message
    });
  }
});

// Export logs to Excel
router.get('/export', requireJwtAuth, checkAdmin, exportActivityLogs);

// GET SSE stream
router.get('/stream', sseAuthBridge, requireJwtAuth, checkAdmin, async (req, res) => {
  logger.info('[UserActivity] Stream endpoint accessed by user:', {
    userId: req.user?.id,
    username: req.user?.username,
    role: req.user?.role,
    email: req.user?.email
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:3090', // your frontend origin
    'Access-Control-Allow-Credentials': 'true',
    'X-Accel-Buffering': 'no',
  });
  // Explicitly disable encoding/compression for this connection
  try { res.setHeader('Content-Encoding', 'identity'); } catch (_) {}
  // Advise EventSource reconnect delay
  res.write('retry: 10000\n\n');
  res.flushHeaders?.();

  // Allow query ?token=
  const tokenFromQuery = req.query.token;
  if (tokenFromQuery) {
    req.headers.authorization = `Bearer ${tokenFromQuery}`;
  }

  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const role = req.user?.role || 'ADMIN';

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

  logger.info('[UserActivity] Stream client connecting with options:', options);

  await userActivityService.addClient(clientId, res, role, options);

  const cleanup = () => userActivityService.removeClient(clientId);
  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
