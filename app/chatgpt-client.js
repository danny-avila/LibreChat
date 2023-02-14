require('dotenv').config();
const Keyv = require('keyv');
const { KeyvFile } = require('keyv-file');

const proxyOptions = {
  reverseProxyUrl: 'https://chatgpt.pawan.krd/api/completions',
  modelOptions: {
    model: 'text-davinci-002-render'
  },
  debug: false
};

const davinciOptions = {
  modelOptions: {
    model: 'text-davinci-003'
  },
  debug: false
};

const askClient = async ({ model, text, progressCallback, convo }) => {
  const clientOptions = model === 'chatgpt' ? proxyOptions : davinciOptions;
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

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { askClient };
