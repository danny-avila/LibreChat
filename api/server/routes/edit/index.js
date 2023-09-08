const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const gptPlugins = require('./gptPlugins');
const anthropic = require('./anthropic');
const { requireJwtAuth } = require('../../middleware');

router.use(requireJwtAuth);

router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/gptPlugins', gptPlugins);
router.use('/anthropic', anthropic);

module.exports = router;
