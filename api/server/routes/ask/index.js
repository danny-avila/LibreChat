const express = require('express');
const openAI = require('./openAI');
const custom = require('./custom');
const google = require('./google');
const bingAI = require('./bingAI');
const anthropic = require('./anthropic');
const gptPlugins = require('./gptPlugins');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const { isEnabled } = require('~/server/utils');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  messageIpLimiter,
  concurrentLimiter,
  messageUserLimiter,
  validateConvoAccess,
} = require('~/server/middleware');

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
router.use(`/${EModelEndpoint.chatGPTBrowser}`, askChatGPTBrowser);
router.use(`/${EModelEndpoint.gptPlugins}`, gptPlugins);
router.use(`/${EModelEndpoint.anthropic}`, anthropic);
router.use(`/${EModelEndpoint.google}`, google);
router.use(`/${EModelEndpoint.bingAI}`, bingAI);
router.use(`/${EModelEndpoint.custom}`, custom);

module.exports = router;
