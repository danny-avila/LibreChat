const express = require('express');
const router = express.Router();
const { uaParser, checkBan, requireJwtAuth } = require('~/server/middleware');

const v1 = require('./v1');
const chatV1 = require('./chatV1');
const v2 = require('./v2');
const chatV2 = require('./chatV2');

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);
router.use('/v1/', v1);
router.use('/v1/chat', chatV1);
router.use('/v2/', v2);
router.use('/v2/chat', chatV2);

module.exports = router;
