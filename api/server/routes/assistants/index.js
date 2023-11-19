const express = require('express');
const router = express.Router();
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  // concurrentLimiter,
  // messageIpLimiter,
  // messageUserLimiter,
} = require('../../middleware');

const assistants = require('./assistants');
const chat = require('./chat');

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.use('/', assistants);
router.use('/chat', chat);

module.exports = router;
