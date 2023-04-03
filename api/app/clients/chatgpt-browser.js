require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const set = new Set(["gpt-4", "text-davinci-002-render", "text-davinci-002-render-paid", "text-davinci-002-render-sha"]);

const clientOptions = {
  // Warning: This will expose your access token to a third party. Consider the risks before using this.
  reverseProxyUrl: process.env.CHATGPT_REVERSE_PROXY || 'https://bypass.churchless.tech/api/conversation',
  // Access token from https://chat.openai.com/api/auth/session
  accessToken: process.env.CHATGPT_TOKEN,
  // debug: true
  proxy: process.env.PROXY || null,
};

// You can check which models you have access to by opening DevTools and going to the Network tab. 
// Refresh the page and look at the response body for https://chat.openai.com/backend-api/models.
if (set.has(process.env.BROWSER_MODEL)) {
  clientOptions.model = process.env.BROWSER_MODEL;
}

const browserClient = async ({ text, onProgress, convo, abortController }) => {
  const { ChatGPTBrowserClient } = await import('@waylaidwanderer/chatgpt-api');

  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const client = new ChatGPTBrowserClient(clientOptions, store);
  let options = { onProgress, abortController };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  console.log('gptBrowser options', options, clientOptions);

  /* will error if given a convoId at the start */
  if (convo.parentMessageId.startsWith('0000')) {
    delete options.conversationId;
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { browserClient };
