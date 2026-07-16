const express = require('express');
const { generateCheckAccess, createVoiceHandlers } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { requireJwtAuth, configMiddleware, checkBan, uaParser } = require('~/server/middleware');
const { createVoiceLimiters } = require('~/server/middleware/limiters');
const { getRoleByName } = require('~/models');

const router = express.Router();

const handlers = createVoiceHandlers();

/**
 * Registered before the JWT stack on purpose: the agent worker is infrastructure, not a
 * user, and authenticates with a shared secret. The claim is single-use.
 */
router.post('/session/claim', handlers.claimSession);

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkBan);
router.use(uaParser);

const checkVoiceUse = generateCheckAccess({
  permissionType: PermissionTypes.VOICE,
  permissions: [Permissions.USE],
  getRoleByName,
});

const { voiceIpLimiter, voiceUserLimiter } = createVoiceLimiters();

router.post('/token', voiceIpLimiter, voiceUserLimiter, checkVoiceUse, handlers.mintToken);

module.exports = router;
