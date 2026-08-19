const express = require('express');
const { getRumProxyBodyLimit, isRumProxyEnabled, proxyRumRequest } = require('@librechat/api');
const { requireRumProxyAuth } = require('~/server/middleware');

const router = express.Router();
const rawOtlpBody = express.raw({
  limit: getRumProxyBodyLimit(),
  type: ['application/x-protobuf', 'application/octet-stream'],
});

function requireRumProxyEnabled(_req, res, next) {
  if (!isRumProxyEnabled()) {
    return res.status(404).json({ message: 'RUM proxy is not configured' });
  }

  return next();
}

router.post(
  '/v1/traces',
  requireRumProxyEnabled,
  requireRumProxyAuth,
  rawOtlpBody,
  proxyRumRequest,
);
router.post('/v1/logs', requireRumProxyEnabled, requireRumProxyAuth, rawOtlpBody, proxyRumRequest);

module.exports = router;
