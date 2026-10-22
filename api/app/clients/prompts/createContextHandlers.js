const axios = require('axios');
const {
  isEnabled,
  generateShortLivedToken,
  logAxiosError,
  hasEntityEmbeddings,
  createRagContextHandlers,
} = require('@librechat/api');
const { getAgents } = require('~/models');

function createContextHandlers(req, userMessageContent) {
  return createRagContextHandlers({
    req,
    userMessageContent,
    ragApiUrl: process.env.RAG_API_URL,
    fullContextSetting: process.env.RAG_USE_FULL_CONTEXT,
    httpClient: axios,
    isEnabled,
    generateShortLivedToken,
    logAxiosError,
    getAgents,
    hasEntityEmbeddings,
  });
}

module.exports = createContextHandlers;
