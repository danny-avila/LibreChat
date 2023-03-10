require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const askSydney = async ({ text, progressCallback, convo }) => {
  const { BingAIClient } = await import('@waylaidwanderer/chatgpt-api');

  const clientOptions = {
    userToken: process.env.BING_TOKEN,
    debug: false,
    cache: { store: new KeyvFile({ filename: './data/cache.json' }) }
  };

  const cookies = process.env.BING_COOKIES;

  if (cookies?.length > 0) {
    clientOptions.cookies = cookies;
    delete clientOptions.userToken;
  }

  const sydneyClient = new BingAIClient(clientOptions);

  let options = {
    jailbreakConversationId: true,
    onProgress: async (partialRes) => await progressCallback(partialRes)
  };

  if (convo.parentMessageId) {
    options = {
      ...options,
      jailbreakConversationId: convo.jailbreakConversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  console.log('sydney options', options);

  const res = await sydneyClient.sendMessage(text, options);

  return res;

  // for reference:
  // https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/demos/use-bing-client.js
};

module.exports = { askSydney };
