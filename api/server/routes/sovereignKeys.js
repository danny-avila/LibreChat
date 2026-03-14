const express = require('express');
const { createSovereignProxyHandlers } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const sovereignProxyUrl = process.env.SOVEREIGN_PROXY_URL;

if (!sovereignProxyUrl) {
  throw new Error('SOVEREIGN_PROXY_URL environment variable is not set');
}

const handlers = createSovereignProxyHandlers({
  sovereignProxyUrl,
});

router.get('/', requireJwtAuth, handlers.listKeys);

router.post('/', requireJwtAuth, handlers.createKey);

router.delete('/:id', requireJwtAuth, handlers.deleteKey);

module.exports = router;
