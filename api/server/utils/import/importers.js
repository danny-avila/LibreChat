const { EModelEndpoint } = require('librechat-data-provider');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const logger = require('~/config/winston');

// naive detection of export file type based on JSON structure
/**
 * Returns the appropriate importer function based on the provided JSON data.
 *
 * @param {Object} jsonData - The JSON data to import.
 * @returns {Function} - The importer function.
 * @throws {Error} - If the import type is not supported.
 */
function getImporter(jsonData) {
  // this is a naive detection of export file type based on JSON structure

  // For ChatGPT
  if (Array.isArray(jsonData)) {
    logger.info('Importing ChatGPT conversation');
    return importChatGptConvo;
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

/**
 * Imports a chatbot-ui V1  conversation from a JSON file and saves it to the database.
 *
 * @param {Object} jsonData - The JSON data containing the chatbot conversation.
 * @param {string} requestUserId - The ID of the user making the import request.
 * @param {Function} [builderFactory=createImportBatchBuilder] - The factory function to create an import batch builder.
 * @returns {Promise<void>} - A promise that resolves when the import is complete.
 * @throws {Error} - If there is an error creating the conversation from the JSON file.
 */
async function importChatBotUiConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
) {
  // this have been tested with chatbot-ui V1 export https://github.com/mckaywrigley/chatbot-ui/tree/b865b0555f53957e96727bc0bbb369c9eaecd83b#legacy-code
  try {
    const importBatchBuilder = builderFactory(requestUserId);

    for (const historyItem of jsonData.history) {
      importBatchBuilder.startConversation(EModelEndpoint.openAI);
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

/**
 * Imports a LibreChat conversation from JSON.
 *
 * @param {Object} jsonData - The JSON data representing the conversation.
 * @param {string} requestUserId - The ID of the user making the import request.
 * @param {Function} [builderFactory=createImportBatchBuilder] - The factory function to create an import batch builder.
 * @returns {Promise<void>} - A promise that resolves when the import is complete.
 */
async function importLibreChatConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    importBatchBuilder.startConversation(EModelEndpoint.openAI);

    let firstMessageDate = null;

    const traverseMessages = async (messages, parentMessageId = null) => {
      for (const message of messages) {
        if (!message.text) {
          continue;
        }

        let savedMessage;
        if (message.sender?.toLowerCase() === 'user') {
          savedMessage = await importBatchBuilder.saveMessage(
            message.text,
            'user',
            true,
            undefined,
            parentMessageId,
          );
        } else {
          savedMessage = await importBatchBuilder.saveMessage(
            message.text,
            message.sender,
            false,
            jsonData.options.model,
            parentMessageId,
          );
        }

        if (!firstMessageDate) {
          firstMessageDate = new Date(message.createdAt);
        }

        if (message.children) {
          await traverseMessages(message.children, savedMessage.messageId);
        }
      }
    };

    await traverseMessages(jsonData.messagesTree);

    await importBatchBuilder.finishConversation(jsonData.title, firstMessageDate);
    await importBatchBuilder.saveBatch();
    console.log(`Conversation ${jsonData.title} imported`);
  } catch (error) {
    console.error('Error creating conversation from LibreChat file', error);
  }
}

/**
 * Imports ChatGPT conversations from provided JSON data.
 * Initializes the import process by creating a batch builder and processing each conversation in the data.
 *
 * @param {ChatGPTConvo[]} jsonData - Array of conversation objects to be imported.
 * @param {string} requestUserId - The ID of the user who initiated the import process.
 * @param {Function} builderFactory - Factory function to create a new import batch builder instance, defaults to createImportBatchBuilder.
 * @returns {Promise<void>} Promise that resolves when all conversations have been imported.
 */
async function importChatGptConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    for (const conv of jsonData) {
      await processConversation(conv, importBatchBuilder);
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error('Error creating conversation from imported file', error);
  }
}

/**
 * Processes a single conversation, adding messages to the batch builder based on author roles and handling text content.
 * It directly manages the addition of messages for different roles and handles citations for assistant messages.
 *
 * @param {ChatGPTConvo} conv - A single conversation object that contains multiple messages and other details.
 * @param {any} importBatchBuilder - The batch builder instance used to manage and batch conversation data.
 * @returns {Promise<void>} - Promise that resolves when the conversation has been fully processed.
 */
async function processConversation(conv, importBatchBuilder) {
  importBatchBuilder.startConversation(EModelEndpoint.openAI);

  for (const [, value] of Object.entries(conv.mapping)) {
    if (!value.message || value.message.content?.content_type !== 'text') {
      continue;
    }

    let messageText = value.message.content.parts.join(' ');

    if (value.message.author?.role === 'assistant') {
      messageText = processAssistantMessage(value.message, messageText);
      await importBatchBuilder.addGptMessage(messageText, value.message.metadata.model_slug);
    } else if (value.message.author?.role === 'system') {
      // System messages processing can be implemented here if necessary
    } else {
      await importBatchBuilder.addUserMessage(messageText);
    }
  }

  await importBatchBuilder.finishConversation(conv.title, new Date(conv.create_time * 1000));
}

/**
 * Processes text content of messages authored by an assistant, inserting citation links as required.
 * Applies citation metadata to construct regex patterns and replacements for inserting links into the text.
 *
 * @param {ChatGPTMessage} messageData - The message data containing metadata about citations.
 * @param {string} messageText - The original text of the message which may be altered by inserting citation links.
 * @returns {string} - The updated message text after processing for citations.
 */
function processAssistantMessage(messageData, messageText) {
  const citations = messageData.metadata.citations ?? [];

  for (const citation of citations) {
    if (
      !citation.metadata ||
      !citation.metadata.extra ||
      !citation.metadata.extra.cited_message_idx ||
      (citation.metadata.type && citation.metadata.type !== 'webpage')
    ) {
      continue;
    }

    const pattern = new RegExp(
      `\\u3010${citation.metadata.extra.cited_message_idx}\\u2020.+?\\u3011`,
      'g',
    );
    const replacement = ` ([${citation.metadata.title}](${citation.metadata.url}))`;
    messageText = messageText.replace(pattern, replacement);
  }

  return messageText;
}

module.exports = { getImporter };
