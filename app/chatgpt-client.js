require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const proxyOptions = {
  // Warning: This will expose your access token to a third party. Consider the risks before using this.
  reverseProxyUrl: 'https://chatgpt.duti.tech/api/conversation',
  // Access token from https://chat.openai.com/api/auth/session
  accessToken: process.env.CHATGPT_TOKEN
};

const davinciOptions = {
  modelOptions: {
    model: 'text-davinci-003'
  },
  debug: false
};

const askClient = async ({ model, text, progressCallback, convo }) => {
  const davinciClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');
  const clientOptions = model === 'chatgpt' ? proxyOptions : davinciOptions;
  const modelClient = model === 'chatgpt' ? ChatGPTBrowserClient : davinciClient;
  const store = {
    store: new KeyvFile({ filename: 'cache.json' })
  };

  const params =
    model === 'chatgpt'
      ? [clientOptions, store]
      : [
          process.env.OPENAI_KEY,
          clientOptions,
          store
        ];

  const client = new modelClient(...params);

  let options = {
    onProgress: async (partialRes) => await progressCallback(partialRes)
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { askClient };
