const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint, Constants, openAISettings } = require('librechat-data-provider');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const logger = require('~/config/winston');

/**
 * Returns the appropriate importer function based on the provided JSON data.
 *
 * @param {Object} jsonData - The JSON data to import.
 * @returns {Function} - The importer function.
 * @throws {Error} - If the import type is not supported.
 */
function getImporter(jsonData) {
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
    /** @type {ImportBatchBuilder} */
    const importBatchBuilder = builderFactory(requestUserId);

    for (const historyItem of jsonData.history) {
      importBatchBuilder.startConversation(EModelEndpoint.openAI);
      for (const message of historyItem.messages) {
        if (message.role === 'assistant') {
          importBatchBuilder.addGptMessage(message.content, historyItem.model.id);
        } else if (message.role === 'user') {
          importBatchBuilder.addUserMessage(message.content);
        }
      }
      importBatchBuilder.finishConversation(historyItem.name, new Date());
    }
    await importBatchBuilder.saveBatch();
    logger.info(`user: ${requestUserId} | ChatbotUI conversation imported`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from ChatbotUI file`, error);
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
    /** @type {ImportBatchBuilder} */
    const importBatchBuilder = builderFactory(requestUserId);
    importBatchBuilder.startConversation(EModelEndpoint.openAI);

    let firstMessageDate = null;

    const traverseMessages = (messages, parentMessageId = null) => {
      for (const message of messages) {
        if (!message.text) {
          continue;
        }

        let savedMessage;
        if (message.sender?.toLowerCase() === 'user') {
          savedMessage = importBatchBuilder.saveMessage({
            text: message.text,
            sender: 'user',
            isCreatedByUser: true,
            parentMessageId: parentMessageId,
          });
        } else {
          savedMessage = importBatchBuilder.saveMessage({
            text: message.text,
            sender: message.sender,
            isCreatedByUser: false,
            model: jsonData.options.model,
            parentMessageId: parentMessageId,
          });
        }

        if (!firstMessageDate) {
          firstMessageDate = new Date(message.createdAt);
        }

        if (message.children) {
          traverseMessages(message.children, savedMessage.messageId);
        }
      }
    };

    traverseMessages(jsonData.messagesTree);

    importBatchBuilder.finishConversation(jsonData.title, firstMessageDate);
    await importBatchBuilder.saveBatch();
    logger.debug(`user: ${requestUserId} | Conversation "${jsonData.title}" imported`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from LibreChat file`, error);
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
      processConversation(conv, importBatchBuilder, requestUserId);
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from imported file`, error);
  }
}

/**
 * Processes a single conversation, adding messages to the batch builder based on author roles and handling text content.
 * It directly manages the addition of messages for different roles and handles citations for assistant messages.
 *
 * @param {ChatGPTConvo} conv - A single conversation object that contains multiple messages and other details.
 * @param {ImportBatchBuilder} importBatchBuilder - The batch builder instance used to manage and batch conversation data.
 * @param {string} requestUserId - The ID of the user who initiated the import process.
 * @returns {void}
 */
function processConversation(conv, importBatchBuilder, requestUserId) {
  importBatchBuilder.startConversation(EModelEndpoint.openAI);

  // Map all message IDs to new UUIDs
  const messageMap = new Map();
  for (const [id, mapping] of Object.entries(conv.mapping)) {
    if (mapping.message && mapping.message.content.content_type) {
      const newMessageId = uuidv4();
      messageMap.set(id, newMessageId);
    }
  }

  // Create and save messages using the mapped IDs
  const messages = [];
  for (const [id, mapping] of Object.entries(conv.mapping)) {
    const role = mapping.message?.author?.role;
    if (!mapping.message) {
      messageMap.delete(id);
      continue;
    } else if (role === 'system') {
      messageMap.delete(id);
      continue;
    }

    const newMessageId = messageMap.get(id);
    const parentMessageId =
      mapping.parent && messageMap.has(mapping.parent)
        ? messageMap.get(mapping.parent)
        : Constants.NO_PARENT;

    const messageText = formatMessageText(mapping.message);

    const isCreatedByUser = role === 'user';
    let sender = isCreatedByUser ? 'user' : 'GPT-3.5';
    const model = mapping.message.metadata.model_slug || openAISettings.model.default;
    if (model === 'gpt-4') {
      sender = 'GPT-4';
    }

    messages.push({
      messageId: newMessageId,
      parentMessageId,
      text: messageText,
      sender,
      isCreatedByUser,
      model,
      user: requestUserId,
      endpoint: EModelEndpoint.openAI,
    });
  }

  for (const message of messages) {
    importBatchBuilder.saveMessage(message);
  }

  importBatchBuilder.finishConversation(conv.title, new Date(conv.create_time * 1000));
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

/**
 * Formats the text content of a message based on its content type and author role.
 * @param {ChatGPTMessage} messageData - The message data.
 * @returns {string} - The updated message text after processing.
 */
function formatMessageText(messageData) {
  const isText = messageData.content.content_type === 'text';
  let messageText = '';

  if (isText && messageData.content.parts) {
    messageText = messageData.content.parts.join(' ');
  } else if (messageData.content.content_type === 'code') {
    messageText = `\`\`\`${messageData.content.language}\n${messageData.content.text}\n\`\`\``;
  } else if (messageData.content.content_type === 'execution_output') {
    messageText = `Execution Output:\n> ${messageData.content.text}`;
  } else if (messageData.content.parts) {
    for (const part of messageData.content.parts) {
      if (typeof part === 'string') {
        messageText += part + ' ';
      } else if (typeof part === 'object') {
        messageText = `\`\`\`json\n${JSON.stringify(part, null, 2)}\n\`\`\`\n`;
      }
    }
    messageText = messageText.trim();
  } else {
    messageText = `\`\`\`json\n${JSON.stringify(messageData.content, null, 2)}\n\`\`\``;
  }

  if (isText && messageData.author.role !== 'user') {
    messageText = processAssistantMessage(messageData, messageText);
  }

  return messageText;
}

module.exports = { getImporter };
