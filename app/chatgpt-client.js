require('dotenv').config();
// const store = new Keyv(process.env.MONGODB_URI);
const Keyv = require('keyv');
const { KeyvFile } = require('keyv-file');

const clientOptions = {
  // (Optional) Support for a reverse proxy for the completions endpoint (private API server).
  // Warning: This will expose your `openaiApiKey` to a third-party. Consider the risks before using this.
  reverseProxyUrl: 'https://chatgpt.pawan.krd/api/completions',
  // (Optional) Parameters as described in https://platform.openai.com/docs/api-reference/completions
  modelOptions: {
    // You can override the model name and any other parameters here.
    model: 'text-davinci-002-render'
  },
  // (Optional) Set custom instructions instead of "You are ChatGPT...".
  // promptPrefix: 'You are Bob, a cowboy in Western times...',
  // (Optional) Set a custom name for the user
  // userLabel: 'User',
  // (Optional) Set a custom name for ChatGPT
  // chatGptLabel: 'ChatGPT',
  // (Optional) Set to true to enable `console.debug()` logging
  debug: false
};

const askClient = async (question, progressCallback, convo) => {
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const client = new ChatGPTClient(process.env.CHATGPT_TOKEN, clientOptions, {
    store: new KeyvFile({ filename: 'cache.json' })
  });
  let options = {
    onProgress: async (partialRes) => await progressCallback(partialRes)
    // onProgress: progressCallback
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(question, options);
  return res;
};

module.exports = { askClient };
