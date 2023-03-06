require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const clientOptions = {
  // Warning: This will expose your access token to a third party. Consider the risks before using this.
  reverseProxyUrl: 'https://chatgpt.duti.tech/api/conversation',
  // Access token from https://chat.openai.com/api/auth/session
  accessToken: process.env.CHATGPT_TOKEN
};

const browserClient = async ({ text, progressCallback, convo }) => {
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');

  const store = {
    store: new KeyvFile({ filename: './api/data/cache.json' })
  };

  const client = new ChatGPTBrowserClient(clientOptions, store);

  let options = {
    onProgress: async (partialRes) => await progressCallback(partialRes)
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { browserClient };
