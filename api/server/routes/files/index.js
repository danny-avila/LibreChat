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

const images = require('./images');

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.use('/images', images);

module.exports = router;
