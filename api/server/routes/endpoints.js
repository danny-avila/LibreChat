const express = require('express');
const router = express.Router();

router.get('/', function (req, res) {
  const azureOpenAI = !!process.env.AZURE_OPENAI_KEY;
  const openAI = process.env.OPENAI_KEY
    ? { availableModels: ['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'] }
    : false;
  const bingAI = !!process.env.BING_TOKEN;
  const chatGPTBrowser = process.env.OPENAI_KEY
    ? { availableModels: ['Default (GPT-3.5)', 'Legacy (GPT-3.5)', 'GPT-4'] }
    : false;

  res.send(JSON.stringify({ azureOpenAI, openAI, bingAI, chatGPTBrowser }));
});

module.exports = router;
