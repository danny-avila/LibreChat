const { ConversationBuilder } = require('./convoBuilder');
const logger = require('~/config/winston');

async function importChatGtpConvo(data, requestUserId) {
  try {
    const jsonData = JSON.parse(data);

    for (const conv of jsonData) {
      const convoBuilder = new ConversationBuilder(requestUserId, 'openAI');

      for (const [, value] of Object.entries(conv.mapping)) {
        const messageData = value.message;
        // we support only text messages for now
        if (messageData && messageData.content?.content_type === 'text') {
          // Determine sender based on author role
          if (messageData.author && messageData.author.role === 'assistant') {
            await convoBuilder.addGptMessage(
              messageData.content.parts.join(' '),
              messageData.metadata.model_slug,
            );
          } else if (messageData.author && messageData.author.role === 'system') {
            // TODO: Determine if we can handle system messages
            continue;
          } else {
            await convoBuilder.addUserMessage(messageData.content.parts.join(' '));
          }
        }
      }

      await convoBuilder.finishConversation(conv.title);
      logger.info(`Conversation ${conv.title} imported`);
    }
  } catch (error) {
    logger.error('Error creating conversation from imported file', error);
  }
}

module.exports = { importChatGtpConvo };
