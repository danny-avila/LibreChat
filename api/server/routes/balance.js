const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, createAccessLimiters } = require('../middleware/');

const { accessIpLimiter, accessUserLimiter } = createAccessLimiters();

router.get('/', accessIpLimiter, accessUserLimiter, requireJwtAuth, controller);

module.exports = router;
