const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const gptPlugins = require('./gptPlugins');
const anthropic = require('./anthropic');
const { requireJwtAuth, concurrentLimiter } = require('../../middleware');

router.use(requireJwtAuth);
router.use(concurrentLimiter);

router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/gptPlugins', gptPlugins);
router.use('/anthropic', anthropic);

module.exports = router;
