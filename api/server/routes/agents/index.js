const express = require('express');
const { isEnabled } = require('@librechat/api');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  messageIpLimiter,
  configMiddleware,
  concurrentLimiter,
  messageUserLimiter,
} = require('~/server/middleware');
const { v1 } = require('./v1');
const chat = require('./chat');

const { LIMIT_CONCURRENT_MESSAGES, LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.use('/', v1);

const chatRouter = express.Router();
chatRouter.use(configMiddleware);

if (isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
  chatRouter.use(concurrentLimiter);
}

if (isEnabled(LIMIT_MESSAGE_IP)) {
  chatRouter.use(messageIpLimiter);
}

if (isEnabled(LIMIT_MESSAGE_USER)) {
  chatRouter.use(messageUserLimiter);
}

chatRouter.use('/', chat);
router.use('/chat', chatRouter);

module.exports = router;
