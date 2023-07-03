const express = require('express');
const router = express.Router();
// const askAzureOpenAI = require('./askAzureOpenAI';)
// const askOpenAI = require('./askOpenAI');
const openAI = require('./openAI');
const askGoogle = require('./askGoogle');
const askBingAI = require('./askBingAI');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const gptPlugins = require('./gptPlugins');

// router.use('/azureOpenAI', askAzureOpenAI);
router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/google', askGoogle);
router.use('/bingAI', askBingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);
router.use('/gptPlugins', gptPlugins);

module.exports = router;
