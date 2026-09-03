const express = require('express');
const { mapAgentManagementError } = require('@librechat/api');
const { checkBan, uaParser } = require('~/server/middleware');
const { requireAgentManagementAuth } = require('./middleware');

const router = express.Router();

router.use(requireAgentManagementAuth);
router.use(checkBan);
router.use(uaParser);

router.use((_req, res) => {
  const { status, body } = mapAgentManagementError('not_found');
  return res.status(status).json(body);
});

module.exports = router;
