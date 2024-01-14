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

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.use('/', files);
router.use('/images', images);
router.use('/images/avatar', avatar);

module.exports = router;
