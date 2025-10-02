const { isEnabled } = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  validateConvoAccess,
  messageUserLimiter,
  concurrentLimiter,
  messageIpLimiter,
  requireJwtAuth,
  checkBan,
  uaParser,
} = require('~/server/middleware');
const anthropic = require('./anthropic');
const express = require('express');
const openAI = require('./openAI');
const custom = require('./custom');
const google = require('./google');

const { LIMIT_CONCURRENT_MESSAGES, LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

if (isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
  router.use(concurrentLimiter);
}

if (isEnabled(LIMIT_MESSAGE_IP)) {
  router.use(messageIpLimiter);
}

if (isEnabled(LIMIT_MESSAGE_USER)) {
  router.use(messageUserLimiter);
}

router.use(validateConvoAccess);

router.use([`/${EModelEndpoint.azureOpenAI}`, `/${EModelEndpoint.openAI}`], openAI);
router.use(`/${EModelEndpoint.anthropic}`, anthropic);
router.use(`/${EModelEndpoint.google}`, google);
router.use(`/${EModelEndpoint.custom}`, custom);

module.exports = router;
