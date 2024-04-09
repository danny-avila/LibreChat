const { createConversationBuilder } = require('./convoBuilder');
const logger = require('~/config/winston');

// naive detection of export file type based on JSON structure
function getImporter(jsonData) {
  // For ChatGPT
  if (Array.isArray(jsonData)) {
    logger.info('Importing ChatGPT conversation');
    return importChatGtpConvo;
  }

  // For ChatbotUI
  if (jsonData.version && Array.isArray(jsonData.history)) {
    logger.info('Importing ChatbotUI conversation');
    return importChatBotUiConvo;
  }

  // For LibreChat
  if (jsonData.conversationId && jsonData.messagesTree) {
    logger.info('Importing LibreChat conversation');
    return importLibreChatConvo;
  }

  throw new Error('Unsupported import type');
}

async function importChatBotUiConvo(
  jsonData,
  requestUserId,
  builderFactory = createConversationBuilder,
) {
  try {
    const convoBuilder = builderFactory(requestUserId, 'openAI');

    for (const historyItem of jsonData.history) {
      for (const message of historyItem.messages) {
        if (message.role === 'assistant') {
          await convoBuilder.addGptMessage(message.content, historyItem.model.id);
        } else if (message.role === 'user') {
          await convoBuilder.addUserMessage(message.content);
        }
      }
      await convoBuilder.finishConversation(historyItem.name, new Date());
    }

    console.log(`Conversation ${jsonData.title} imported`);
  } catch (error) {
    console.error('Error creating conversation from ChatbotUI file', error);
  }
}

async function importLibreChatConvo(
  jsonData,
  requestUserId,
  builderFactory = createConversationBuilder,
) {
  try {
    const convoBuilder = builderFactory(requestUserId, 'openAI');
    const traverseMessages = async (messages) => {
      for (const message of messages) {
        // Leaf node: actual message
        if (message.text) {
          if (message.sender === 'assistant' /* Adapt as necessary for your data */) {
            await convoBuilder.addGptMessage(message.text, jsonData.options.model, message.sender); // Adapt model as necessary
          } else {
            await convoBuilder.addUserMessage(message.text);
          }
        }

        // Recursively handle child messages if any
        if (message.children) {
          await traverseMessages(message.children);
        }
      }
    };

    await traverseMessages(jsonData.messagesTree);

    await convoBuilder.finishConversation(jsonData.title, new Date(jsonData.exportAt));
    console.log(`Conversation ${jsonData.title} imported`);
  } catch (error) {
    console.error('Error creating conversation from LibreChat file', error);
  }
}

async function importChatGtpConvo(
  jsonData,
  requestUserId,
  builderFactory = createConversationBuilder,
) {
  try {
    for (const conv of jsonData) {
      const convoBuilder = builderFactory(requestUserId, 'openAI');

      for (const [, value] of Object.entries(conv.mapping)) {
        const messageData = value.message;
        if (messageData && messageData.content?.content_type === 'text') {
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

      await convoBuilder.finishConversation(conv.title, new Date(conv.create_time * 1000));
      logger.info(`Conversation ${conv.title} imported`);
    }
  } catch (error) {
    logger.error('Error creating conversation from imported file', error);
  }
}

module.exports = { getImporter };
