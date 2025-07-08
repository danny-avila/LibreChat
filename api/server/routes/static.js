const express = require('express');
const staticCache = require('../utils/staticCache');
const paths = require('~/config/paths');
const { isEnabled } = require('~/server/utils');

const skipGzipScan = isEnabled(process.env.DISABLE_IMAGES_OUTPUT_STATIC_CACHE);

const router = express.Router();
router.use(staticCache(paths.imageOutput, { skipGzipScan }));

module.exports = router;
