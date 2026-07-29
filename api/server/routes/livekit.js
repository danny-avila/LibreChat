const express = require('express');
const { createLiveKitHandlers } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
const handlers = createLiveKitHandlers();

router.get('/config', handlers.getLiveKitConfig);
router.post('/token', requireJwtAuth, handlers.generateLiveKitToken);

module.exports = router;
