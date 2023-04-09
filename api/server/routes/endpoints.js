const express = require('express');
const router = express.Router();

const getOpenAIModels = () => {
  let models = ['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'];
  if (process.env.OPENAI_MODELS) models = String(process.env.OPENAI_MODELS).split(',');

  return models;
};

const getChatGPTBrowserModels = () => {
  let models = ['text-davinci-002-render-sha', 'text-davinci-002-render-paid', 'gpt-4'];
  if (process.env.CHATGPT_MODELS) models = String(process.env.CHATGPT_MODELS).split(',');

  return models;
};

router.get('/', function (req, res) {
  const azureOpenAI = !!process.env.AZURE_OPENAI_KEY;
  const openAI = process.env.OPENAI_KEY ? { availableModels: getOpenAIModels() } : false;
  const bingAI = process.env.BINGAI_TOKEN
    ? { userProvide: process.env.BINGAI_TOKEN == 'user_provide' }
    : false;
  const chatGPTBrowser = process.env.CHATGPT_TOKEN
    ? {
        userProvide: process.env.CHATGPT_TOKEN == 'user_provide',
        availableModels: getChatGPTBrowserModels()
      }
    : false;

  res.send(JSON.stringify({ azureOpenAI, openAI, bingAI, chatGPTBrowser }));
});

module.exports = { router, getOpenAIModels, getChatGPTBrowserModels };
