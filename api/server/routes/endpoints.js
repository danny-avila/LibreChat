const express = require('express');
const router = express.Router();
const { availableTools } = require('../../app/clients/tools');

const getOpenAIModels = (opts = { azure: false }) => {
  let models = ['gpt-4', 'gpt-4-0613', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-0613', 'gpt-3.5-turbo-0301', 'text-davinci-003' ];
  const key = opts.azure ? 'AZURE_OPENAI_MODELS' : 'OPENAI_MODELS';
  if (process.env[key]) models = String(process.env[key]).split(',');

  return models;
};

const getChatGPTBrowserModels = () => {
  let models = ['text-davinci-002-render-sha', 'gpt-4'];
  if (process.env.CHATGPT_MODELS) models = String(process.env.CHATGPT_MODELS).split(',');

  return models;
};
const getAnthropicModels = () => {
  let models = ['claude-1', 'claude-1-100k', 'claude-instant-1', 'claude-instant-1-100k', 'claude-2'];
  if (process.env.ANTHROPIC_MODELS) models = String(process.env.ANTHROPIC_MODELS).split(',');

  return models;
};

const getPluginModels = () => {
  let models = ['gpt-4', 'gpt-4-0613', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-0613', 'gpt-3.5-turbo-0301'];
  if (process.env.PLUGIN_MODELS) models = String(process.env.PLUGIN_MODELS).split(',');

  return models;
};

let i = 0;
router.get('/', async function (req, res) {
  let key, palmUser;
  try {
    key = require('../../data/auth.json');
  } catch (e) {
    if (i === 0) {
      console.log('No \'auth.json\' file (service account key) found in /api/data/ for PaLM models');
      i++;
    }
  }

  if (process.env.PALM_KEY === 'user_provided') {
    palmUser = true;
    if (i <= 1) {
      console.log('User will provide key for PaLM models');
      i++;
    }
  }

  const google =
    key || palmUser
      ? { userProvide: palmUser, availableModels: ['chat-bison', 'text-bison', 'codechat-bison'] }
      : false;
  const openAIApiKey = process.env.OPENAI_API_KEY;
  const azureOpenAIApiKey = process.env.AZURE_API_KEY;
  const userProvidedOpenAI = openAIApiKey ? openAIApiKey === 'user_provided' : azureOpenAIApiKey === 'user_provided';
  const openAI = openAIApiKey
    ? { availableModels: getOpenAIModels(), userProvide: openAIApiKey === 'user_provided' }
    : false;
  const azureOpenAI = azureOpenAIApiKey
    ? { availableModels: getOpenAIModels({ azure: true }), userProvide: azureOpenAIApiKey === 'user_provided' }
    : false;
  const gptPlugins = openAIApiKey || azureOpenAIApiKey
    ? { availableModels: getPluginModels(), availableTools, availableAgents: ['classic', 'functions'], userProvide: userProvidedOpenAI }
    : false;
  const bingAI = process.env.BINGAI_TOKEN
    ? { userProvide: process.env.BINGAI_TOKEN == 'user_provided' }
    : false;
  const chatGPTBrowser = process.env.CHATGPT_TOKEN
    ? {
      userProvide: process.env.CHATGPT_TOKEN == 'user_provided',
      availableModels: getChatGPTBrowserModels()
    }
    : false;
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? {
      userProvide: process.env.ANTHROPIC_API_KEY == 'user_provided',
      availableModels: getAnthropicModels()
    }
    : false;

  res.send(JSON.stringify({ azureOpenAI, openAI, google, bingAI, chatGPTBrowser, gptPlugins, anthropic }));
});

module.exports = { router, getOpenAIModels, getChatGPTBrowserModels };
