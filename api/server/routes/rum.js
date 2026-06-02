const express = require('express');
const { getRumProxyBodyLimit, isRumProxyEnabled, proxyRumRequest } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

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

router.post('/v1/traces', requireRumProxyEnabled, requireJwtAuth, rawOtlpBody, proxyRumRequest);
router.post('/v1/logs', requireRumProxyEnabled, requireJwtAuth, rawOtlpBody, proxyRumRequest);

module.exports = router;
