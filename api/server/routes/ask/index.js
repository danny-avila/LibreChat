const express = require('express');
const router = express.Router();
// const askAzureOpenAI = require('./askAzureOpenAI';)
// const askOpenAI = require('./askOpenAI');
const openAI = require('./openAI');
const google = require('./google');
const askBingAI = require('./askBingAI');
const gptPlugins = require('./gptPlugins');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const askClaude = require('./askClaude');

// router.use('/azureOpenAI', askAzureOpenAI);
router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/google', google);
router.use('/bingAI', askBingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);
router.use('/gptPlugins', gptPlugins);
router.use('/claude', askClaude);

module.exports = router;
