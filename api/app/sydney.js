require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const askSydney = async ({ text, progressCallback, convo }) => {
  const { BingAIClient } = (await import('@waylaidwanderer/chatgpt-api'));

  const sydneyClient = new BingAIClient({
    // "_U" cookie from bing.com
    userToken: process.env.BING_TOKEN,
    // If the above doesn't work, provide all your cookies as a string instead
    // cookies: '',
    debug: false,
    cache: { store: new KeyvFile({ filename: './data/cache.json' }) }
  });

  let options = {
    jailbreakConversationId: true,
    onProgress: async (partialRes) => await progressCallback(partialRes),
  };

  if (convo.parentMessageId) {
    options = { ...options, jailbreakConversationId: convo.jailbreakConversationId, parentMessageId: convo.parentMessageId };
  }

  console.log('sydney options', options);

  const res = await sydneyClient.sendMessage(text, options
  );

  return res;

  // for reference:
  // https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/demos/use-bing-client.js
};

module.exports = { askSydney };
