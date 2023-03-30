const express = require('express');
const router = express.Router();
// const askAzureOpenAI = require('./askAzureOpenAI';)
const askOpenAI = require('./askOpenAI');
const askBingAI = require('./askBingAI');
const askChatGPTBrowser = require('./askChatGPTBrowser');

// router.use('/azureOpenAI', askAzureOpenAI);
router.use('/openAI', askOpenAI);
router.use('/bingAI', askBingAI);
router.use('/chatGPTBrowser', askChatGPTBrowser);

module.exports = router;
