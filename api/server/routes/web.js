const express = require('express');
const { runWebSearch, getWebStatus } = require('~/server/controllers/WebSearchController');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);
router.use(configMiddleware);

router.get('/status', getWebStatus);
router.post('/search', runWebSearch);

module.exports = router;
