const express = require('express');
const staticCache = require('../utils/staticCache');
const paths = require('~/config/paths');
const { isEnabled } = require('~/server/utils');

const skipGzipScan = !isEnabled(process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN);

const router = express.Router();
router.use(staticCache(paths.imageOutput, { skipGzipScan }));

module.exports = router;
