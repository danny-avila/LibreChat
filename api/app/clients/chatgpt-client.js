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
  abortController,
  userId
}) => {
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const azure = process.env.AZURE_OPENAI_API_KEY ? true : false;

  const clientOptions = {
    reverseProxyUrl: azure ? process.env.AZURE_ENDPOINT : (process.env.OPENAI_REVERSE_PROXY || null),
    azure,
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
    debug: true,
    user: userId
  };

  let apiKey = azure && clientOptions.reverseProxyUrl ? process.env.AZURE_OPENAI_API_KEY : process.env.OPENAI_KEY;
  const client = new ChatGPTClient(apiKey, clientOptions, store);
  let options = { onProgress, abortController };

  if (!!parentMessageId && !!conversationId) {
    options = { ...options, parentMessageId, conversationId };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { askClient };
