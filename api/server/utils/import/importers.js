const { createImportBatchBuilder } = require('./importBatchBuilder');
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
  builderFactory = createImportBatchBuilder,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);

    for (const historyItem of jsonData.history) {
      importBatchBuilder.startConversation('openAI');
      for (const message of historyItem.messages) {
        if (message.role === 'assistant') {
          await importBatchBuilder.addGptMessage(message.content, historyItem.model.id);
        } else if (message.role === 'user') {
          await importBatchBuilder.addUserMessage(message.content);
        }
      }
      await importBatchBuilder.finishConversation(historyItem.name, new Date());
    }
    await importBatchBuilder.saveBatch();
    logger.info('ChatbotUI conversation imported');
  } catch (error) {
    console.error('Error creating conversation from ChatbotUI file', error);
  }
}

async function importLibreChatConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    importBatchBuilder.startConversation('openAI');

    const traverseMessages = async (messages) => {
      for (const message of messages) {
        // Leaf node: actual message
        if (message.text) {
          if (message.sender === 'assistant' /* Adapt as necessary for your data */) {
            await importBatchBuilder.addGptMessage(
              message.text,
              jsonData.options.model,
              message.sender,
            ); // Adapt model as necessary
          } else {
            await importBatchBuilder.addUserMessage(message.text);
          }
        }

        // Recursively handle child messages if any
        if (message.children) {
          await traverseMessages(message.children);
        }
      }
    };

    await traverseMessages(jsonData.messagesTree);

    await importBatchBuilder.finishConversation(jsonData.title, new Date(jsonData.exportAt));
    await importBatchBuilder.saveBatch();
    console.log(`Conversation ${jsonData.title} imported`);
  } catch (error) {
    console.error('Error creating conversation from LibreChat file', error);
  }
}

async function importChatGtpConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    for (const conv of jsonData) {
      importBatchBuilder.startConversation('openAI');

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

            await importBatchBuilder.addGptMessage(messageText, messageData.metadata.model_slug);
          } else if (messageData.author && messageData.author.role === 'system') {
            // TODO: Determine if we can handle system messages
            continue;
          } else {
            await importBatchBuilder.addUserMessage(messageData.content.parts.join(' '));
          }
        }
      }

      await importBatchBuilder.finishConversation(conv.title, new Date(conv.create_time * 1000));
      logger.info(`Conversation ${conv.title} imported`);
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error('Error creating conversation from imported file', error);
  }
}

module.exports = { getImporter };
