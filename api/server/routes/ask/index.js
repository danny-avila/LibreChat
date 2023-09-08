const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const google = require('./google');
const bingAI = require('./bingAI');
const gptPlugins = require('./gptPlugins');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const anthropic = require('./anthropic');
const { requireJwtAuth } = require('../../middleware');

router.use(requireJwtAuth);

router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/google', google);
router.use('/bingAI', bingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);
router.use('/gptPlugins', gptPlugins);
router.use('/anthropic', anthropic);

module.exports = router;
