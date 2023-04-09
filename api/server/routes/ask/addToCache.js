const Keyv = require('keyv');
const { KeyvFile } = require('keyv-file');
const crypto = require('crypto');

const addToCache = async ( { conversationId, parentMessageId }) => {
  const conversationsCache = new Keyv({
    store: new KeyvFile({ filename: './data/cache.json' })
  });

  let conversation = await conversationsCache.get(conversationId);
  let isNewConversation = false;
  if (!conversation) {
    conversation = {
      messages: [],
      createdAt: Date.now()
    };
    isNewConversation = true;
  }

  // const shouldGenerateTitle = opts.shouldGenerateTitle && isNewConversation;

  const userMessage = {
    id: crypto.randomUUID(),
    parentMessageId,
    role: 'User',
    message
  };
  conversation.messages.push(userMessage);
};

module.exports = { addToCache };
