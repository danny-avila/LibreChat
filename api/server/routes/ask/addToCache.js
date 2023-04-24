const Keyv = require('keyv');
const { KeyvFile } = require('keyv-file');

const addToCache = async ({ endpoint, endpointOption, userMessage, responseMessage }) => {
  try {
    const conversationsCache = new Keyv({
      store: new KeyvFile({ filename: './data/cache.json' }),
      namespace: 'chatgpt' // should be 'bing' for bing/sydney
    });

    const {
      conversationId,
      messageId: userMessageId,
      parentMessageId: userParentMessageId,
      text: userText
    } = userMessage;
    const {
      messageId: responseMessageId,
      parentMessageId: responseParentMessageId,
      text: responseText
    } = responseMessage;

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

    const roles = (options) => {
      if (endpoint === 'openAI') {
        return options?.chatGptLabel || 'ChatGPT';
      } else if (endpoint === 'bingAI') {
        return options?.jailbreak ? 'Sydney' : 'BingAI';
      }
    };

    let _userMessage = {
      id: userMessageId,
      parentMessageId: userParentMessageId,
      role: 'User',
      message: userText
    };

    let _responseMessage = {
      id: responseMessageId,
      parentMessageId: responseParentMessageId,
      role: roles(endpointOption),
      message: responseText
    };

    conversation.messages.push(_userMessage, _responseMessage);

    await conversationsCache.set(conversationId, conversation);
  } catch (error) {
    console.error('Trouble adding to cache', error);
  }
};

module.exports = addToCache;
