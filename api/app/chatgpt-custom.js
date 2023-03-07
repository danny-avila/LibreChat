require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const clientOptions = {
  modelOptions: {
    model: 'gpt-3.5-turbo'
  },
  debug: false
};

const customClient = async ({ text, progressCallback, convo, promptPrefix, chatGptLabel }) => {
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  clientOptions.chatGptLabel = chatGptLabel;

  if (promptPrefix.length > 0) {
    clientOptions.promptPrefix = promptPrefix;
  }

  const client = new ChatGPTClient(process.env.OPENAI_KEY, clientOptions, store);

  let options = {
    onProgress: async (partialRes) => await progressCallback(partialRes)
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = customClient;
