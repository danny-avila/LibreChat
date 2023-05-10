const express = require('express');
const router = express.Router();

const getOpenAIModels = () => {
  const defaultModels = ['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'];
  const envModels = process.env.OPENAI_MODELS?.split(',') || [];
  return envModels.length > 0 ? envModels : defaultModels;
};

const getChatGPTBrowserModels = () => {
  const defaultModels = ['text-davinci-002-render-sha', 'text-davinci-002-render-paid', 'gpt-4'];
  const envModels = process.env.CHATGPT_MODELS?.split(',') || [];
  return envModels.length > 0 ? envModels : defaultModels;
};

router.get('/', function (req, res) {
  const azureOpenAI = !!process.env.AZURE_OPENAI_KEY;
  const openAI = process.env.OPENAI_KEY ? { availableModels: getOpenAIModels() } : false;
  const bingAI = process.env.BINGAI_TOKEN
    ? { userProvide: process.env.BINGAI_TOKEN == 'user_provided' }
    : false;
  const chatGPTBrowser = process.env.CHATGPT_TOKEN
    ? {
      userProvide: process.env.CHATGPT_TOKEN == 'user_provided',
      availableModels: getChatGPTBrowserModels()
    }
    : false;

  res.send(JSON.stringify({ azureOpenAI, openAI, bingAI, chatGPTBrowser }));
});

module.exports = { router, getOpenAIModels, getChatGPTBrowserModels };
