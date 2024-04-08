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
            let messageText = messageData.content.parts.join(' ');

            // Insert citation links
            messageData.metadata.citations?.forEach((citation) => {
              const { metadata } = citation;
              if (metadata.type !== 'webpage') {
                return;
              }
              const pattern = new RegExp(
                `\\u3010${metadata.extra.cited_message_idx}\\u2020.+?\\u3011`,
                'g',
              );
              //const replacement = `<a href="${metadata.url}" target="_blank">${messageText.substring(start_ix, end_ix)}</a>`;
              const replacement = ` ([${metadata.title}](${metadata.url}))`;
              messageText = messageText.replace(pattern, replacement);
            });

            await convoBuilder.addGptMessage(messageText, messageData.metadata.model_slug);
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
