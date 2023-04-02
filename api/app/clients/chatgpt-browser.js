require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const modelMap = new Map([
  ['Default (GPT-3.5)', 'text-davinci-002-render-sha'],
  ['Legacy (GPT-3.5)', 'text-davinci-002-render-paid'],
  ['GPT-4', 'gpt-4']
]);

const browserClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  onProgress,
  abortController
}) => {
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const clientOptions = {
    // Warning: This will expose your access token to a third party. Consider the risks before using this.
    reverseProxyUrl: 'https://bypass.duti.tech/api/conversation',
    // Access token from https://chat.openai.com/api/auth/session
    accessToken: process.env.CHATGPT_TOKEN,
    model: modelMap.get(model),
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
