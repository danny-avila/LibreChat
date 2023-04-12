require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const browserClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  token,
  onProgress,
  abortController
}) => {
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const clientOptions = {
    // Warning: This will expose your access token to a third party. Consider the risks before using this.
    reverseProxyUrl: process.env.CHATGPT_REVERSE_PROXY || 'https://bypass.churchless.tech/api/conversation',
    // Access token from https://chat.openai.com/api/auth/session
    accessToken: process.env.CHATGPT_TOKEN == 'user_provided' ? token : process.env.CHATGPT_TOKEN ?? null,
    model: model,
    // debug: true
    proxy: process.env.PROXY || null
  };

  const client = new ChatGPTBrowserClient(clientOptions, store);
  let options = { onProgress, abortController };

  if (!!parentMessageId && !!conversationId) {
    options = { ...options, parentMessageId, conversationId };
  }

  console.log('gptBrowser clientOptions', clientOptions);

  if (parentMessageId === '00000000-0000-0000-0000-000000000000') {
    delete options.conversationId;
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { browserClient };
