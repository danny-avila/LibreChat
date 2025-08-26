const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const sseAuthBridge = require('~/server/middleware/sseAuthBridge');
const { userActivityService } = require('~/server/services/UserActivityService');
const { getUserActivityLogs, getUserActivitySummary } = require('~/server/controllers/UserActivityController');

const router = express.Router();

// GET logs (HTTP)
router.get('/logs', requireJwtAuth, checkAdmin, getUserActivityLogs);
router.get('/summary', requireJwtAuth, checkAdmin, getUserActivitySummary);

// GET SSE stream
router.get('/stream', sseAuthBridge, requireJwtAuth, checkAdmin, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:3090', // your frontend origin
    'Access-Control-Allow-Credentials': 'true',
  });
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

  await userActivityService.addClient(clientId, res, role, options);

  const cleanup = () => userActivityService.removeClient(clientId);
  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
