const express = require('express');
const router = express.Router();
// const askAzureOpenAI = require('./askAzureOpenAI';)
// const askOpenAI = require('./askOpenAI');
const openAI = require('./openAI');
const askGoogle = require('./askGoogle');
const askBingAI = require('./askBingAI');
const askChatGPTBrowser = require('./askChatGPTBrowser');
const askGPTPlugins = require('./askGPTPlugins');

// router.use('/azureOpenAI', askAzureOpenAI);
router.use(['/azureOpenAI', '/openAI'], openAI);
router.use('/google', askGoogle);
router.use('/bingAI', askBingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);
router.use('/gptPlugins', askGPTPlugins);

module.exports = router;
