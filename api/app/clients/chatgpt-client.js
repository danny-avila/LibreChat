require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const set = new Set(['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301']);

const clientOptions = {
  modelOptions: {
    model: 'gpt-3.5-turbo'
  },
  proxy: process.env.PROXY || null,
  debug: false
};

if (set.has(process.env.DEFAULT_API_GPT)) {
  clientOptions.modelOptions.model = process.env.DEFAULT_API_GPT;
}

const askClient = async ({ text, onProgress, convo, abortController }) => {
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const client = new ChatGPTClient(process.env.OPENAI_KEY, clientOptions, store);
  let options = { onProgress, abortController };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { askClient };
