const Keyv = require('keyv');
const { KeyvFile } = require('keyv-file');
const crypto = require('crypto');
const { saveMessage } = require('../../../models');

const addToCache = async ({
  endpointOption,
  conversationId,
  userMessage,
  latestMessage,
  parentMessageId
}) => {
  try {
    const conversationsCache = new Keyv({
      store: new KeyvFile({ filename: './data/cache.json' }),
      namespace: 'chatgpt', // should be 'bing' for bing/sydney
    });

    let conversation = await conversationsCache.get(conversationId);
    // used to generate a title for the conversation if none exists
    // let isNewConversation = false;
    if (!conversation) {
      conversation = {
        messages: [],
        createdAt: Date.now()
      };
      // isNewConversation = true;
    }

    // const shouldGenerateTitle = opts.shouldGenerateTitle && isNewConversation;

    const roles = (options) => {
      const { endpoint } = options;
      if (endpoint === 'openAI') {
        return options?.chatGptLabel || 'ChatGPT';
      } else if (endpoint === 'bingAI') {
        return options?.jailbreak ? 'Sydney' : 'BingAI';
      }
    };

    const messageId = crypto.randomUUID();

    let responseMessage = {
      id: messageId,
      parentMessageId,
      role: roles(endpointOption),
      message: latestMessage
    };

    await saveMessage({
      ...responseMessage,
      conversationId,
      messageId,
      sender: responseMessage.role,
      text: latestMessage
    });

    conversation.messages.push(userMessage, responseMessage);

    await conversationsCache.set(conversationId, conversation);
  } catch (error) {
    console.error('Trouble adding to cache', error);
  }
};

module.exports = addToCache;
