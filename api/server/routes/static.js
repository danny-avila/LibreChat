const express = require('express');
const { isEnabled } = require('@librechat/api');
const { createAzureBlobImageHandler } = require('~/server/services/Files/Azure/serveImage');
const staticCache = require('../utils/staticCache');
const paths = require('~/config/paths');

const skipGzipScan = !isEnabled(process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN);

const router = express.Router();
router.use(staticCache(paths.imageOutput, { skipGzipScan }));
/** Private `azure_blob` containers store `/images/...` paths the browser cannot fetch from Blob
 * Storage directly; anything the static middleware did not find on disk is looked up there. */
router.use(createAzureBlobImageHandler());

module.exports = router;
