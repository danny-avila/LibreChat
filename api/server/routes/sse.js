// ~/server/routes/sse.js
const express = require('express');
const router = express.Router();
const { UserActivityService } = require('~/server/services/UserActivityService');

router.get('/events', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.(); // in case you’re using compression middleware

  const clientId = Date.now();
  const sendEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Register client
  UserActivityService.registerClient(clientId, sendEvent);

  // Handle disconnects
  req.on('close', () => {
    UserActivityService.removeClient(clientId);
  });
});

module.exports = router;
