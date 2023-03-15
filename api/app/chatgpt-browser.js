require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const clientOptions = {
  // Warning: This will expose your access token to a third party. Consider the risks before using this.
  reverseProxyUrl: 'https://bypass.duti.tech/api/conversation',
  // Access token from https://chat.openai.com/api/auth/session
  accessToken: process.env.CHATGPT_TOKEN,
  // debug: true
  proxy: process.env.PROXY || null,
};

const browserClient = async ({ text, onProgress, convo }) => {
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');

  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const client = new ChatGPTBrowserClient(clientOptions, store);
  let options = { onProgress };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { browserClient };
