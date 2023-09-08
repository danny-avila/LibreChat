const express = require('express');
const router = express.Router();
const openAI = require('./openAI');
const google = require('./google');
const bingAI = require('./bingAI');
const gptPlugins = require('./gptPlugins');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const anthropic = require('./anthropic');
const { questionLimiter } = require('../../middleware');

router.use(['/azureOpenAI', '/openAI'], questionLimiter, openAI);
router.use('/google', questionLimiter, google);
router.use('/bingAI', questionLimiter, bingAI);
router.use('/chatGPTBrowser', questionLimiter, askChatGPTBrowser);
router.use('/gptPlugins', questionLimiter, gptPlugins);
router.use('/anthropic', questionLimiter, anthropic);

module.exports = router;
