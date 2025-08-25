const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const { SystemRoles } = require('librechat-data-provider');
const {
  getUserActivityLogs,
  getUserActivitySummary
} = require('~/server/controllers/UserActivityController');

const router = express.Router();

/**
 * GET /api/user-activity/logs
 * Get paginated user activity logs with token usage data
 * Query params: page, limit, userId, action, startDate, endDate, includeTokenUsage
 */
router.get('/logs', requireJwtAuth, checkAdmin, getUserActivityLogs);

/**
 * GET /api/user-activity/user/:userId
 * Get activity summary for a specific user
 * Query params: timeframe (24h, 7d, 30d)
 */
router.get('/user/:userId', requireJwtAuth, checkAdmin, getUserActivitySummary);

/**
 * GET /api/user-activity/my-activity
 * Get current user's own activity summary (ADMIN ONLY)
 */
router.get('/my-activity', requireJwtAuth, checkAdmin, async (req, res) => {
  req.params.userId = req.user.id;
  return getUserActivitySummary(req, res);
});

/**
 * GET /api/user-activity/stream
 * Real-time activity stream using Server-Sent Events
 */
router.get('/stream', requireJwtAuth, checkAdmin, async (req, res) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Real-time activity stream connected"}\n\n');

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
  }, 30000); // Send heartbeat every 30 seconds

  // Add client to UserActivityService for real-time updates
  const { userActivityService } = require('~/server/services/UserActivityService');
  const clientId = `client_${Date.now()}_${Math.random()}`;
  
  if (userActivityService && userActivityService.addClient) {
    await userActivityService.addClient(clientId, res, req.user.role || 'USER');
  }

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    if (userActivityService && userActivityService.removeClient) {
      userActivityService.removeClient(clientId);
    }
  });

  req.on('error', () => {
    clearInterval(heartbeat);
    if (userActivityService && userActivityService.removeClient) {
      userActivityService.removeClient(clientId);
    }
  });
});

module.exports = router;
