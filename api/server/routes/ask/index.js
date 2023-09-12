const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const google = require('./google');
const bingAI = require('./bingAI');
const gptPlugins = require('./gptPlugins');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const anthropic = require('./anthropic');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  concurrentLimiter,
  messageIpLimiter,
  messageUserLimiter,
} = require('../../middleware');
const { isEnabled } = require('../../utils');

const { LIMIT_CONCURRENT_MESSAGES, LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

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

router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/google', google);
router.use('/bingAI', bingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);
router.use('/gptPlugins', gptPlugins);
router.use('/anthropic', anthropic);

module.exports = router;
