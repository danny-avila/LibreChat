require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const askBing = async ({
  text,
  parentMessageId,
  conversationId,
  jailbreak,
  jailbreakConversationId,
  context,
  systemMessage,
  conversationSignature,
  clientId,
  invocationId,
  toneStyle,
  token,
  onProgress
}) => {
  const { BingAIClient } = await import('@waylaidwanderer/chatgpt-api');
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const bingAIClient = new BingAIClient({
    // "_U" cookie from bing.com
    // userToken:
    //   process.env.BINGAI_TOKEN == 'user_provided' ? token : process.env.BINGAI_TOKEN ?? null,
    // If the above doesn't work, provide all your cookies as a string instead
    cookies: process.env.BINGAI_TOKEN == 'user_provided' ? token : process.env.BINGAI_TOKEN ?? null,
    debug: false,
    cache: store,
    host: process.env.BINGAI_HOST || null,
    proxy: process.env.PROXY || null
  });

  let options = {};

  if (jailbreakConversationId == 'false') {
    jailbreakConversationId = false;
  }

  if (jailbreak)
    options = {
      jailbreakConversationId: jailbreakConversationId || jailbreak,
      context,
      systemMessage,
      parentMessageId,
      toneStyle,
      onProgress
    };
  else {
    options = {
      conversationId,
      context,
      systemMessage,
      parentMessageId,
      toneStyle,
      onProgress
    };

    // don't give those parameters for new conversation
    // for new conversation, conversationSignature always is null
    if (conversationSignature) {
      options.conversationSignature = conversationSignature;
      options.clientId = clientId;
      options.invocationId = invocationId;
    }
  }

  console.log('bing options', options);

  const res = await bingAIClient.sendMessage(text, options);

  return res;

  // for reference:
  // https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/demos/use-bing-client.js
};

module.exports = { askBing };
