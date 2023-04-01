require('dotenv').config();
const { KeyvFile } = require('keyv-file');
// const set = new Set(['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301']);

const askClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  chatGptLabel,
  promptPrefix,
  temperature,
  top_p,
  presence_penalty,
  frequency_penalty,
  onProgress,
  abortController
}) => {
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const clientOptions = {
    modelOptions: {
      model: model,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty
    },
    chatGptLabel,
    promptPrefix,
    proxy: process.env.PROXY || null,
    debug: false
  };

  const client = new ChatGPTClient(process.env.OPENAI_KEY, clientOptions, store);
  let options = { onProgress, abortController };

  if (!!parentMessageId && !!conversationId) {
    options = { ...options, parentMessageId, conversationId };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { askClient };
