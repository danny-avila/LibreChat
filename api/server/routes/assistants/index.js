const express = require('express');
const router = express.Router();
const {
  uaParser,
  checkBan,
  setCurrentUser,
  requireSubscription,
  // concurrentLimiter,
  // messageIpLimiter,
  // messageUserLimiter,
} = require('../../middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const assistants = require('./assistants');
const chat = require('./chat');
// const { set } = require('~/cache/keyvMongo');

router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.use(checkBan);
router.use(uaParser);

router.use('/', assistants);
router.use('/chat', chat);

module.exports = router;
