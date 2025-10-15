const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, Constants, openAISettings, CacheKeys } = require('librechat-data-provider');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const { cloneMessagesWithTimestamps } = require('./fork');
const getLogStores = require('~/cache/getLogStores');

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
  if (jsonData.conversationId && (jsonData.messagesTree || jsonData.messages)) {
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
    const options = jsonData.options || {};

    /* Endpoint configuration */
    let endpoint = jsonData.endpoint ?? options.endpoint ?? EModelEndpoint.openAI;
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const endpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
    const endpointConfig = endpointsConfig?.[endpoint];
    if (!endpointConfig && endpointsConfig) {
      endpoint = Object.keys(endpointsConfig)[0];
    } else if (!endpointConfig) {
      endpoint = EModelEndpoint.openAI;
    }

    importBatchBuilder.startConversation(endpoint);

    let firstMessageDate = null;

    const messagesToImport = jsonData.messagesTree || jsonData.messages;

    if (jsonData.recursive) {
      /**
       * Flatten the recursive message tree into a flat array
       * @param {TMessage[]} messages
       * @param {string} parentMessageId
       * @param {TMessage[]} flatMessages
       */
      const flattenMessages = (
        messages,
        parentMessageId = Constants.NO_PARENT,
        flatMessages = [],
      ) => {
        for (const message of messages) {
          if (!message.text && !message.content) {
            continue;
          }

          const flatMessage = {
            ...message,
            parentMessageId: parentMessageId,
            children: undefined, // Remove children from flat structure
          };
          flatMessages.push(flatMessage);

          if (!firstMessageDate && message.createdAt) {
            firstMessageDate = new Date(message.createdAt);
          }

          if (message.children && message.children.length > 0) {
            flattenMessages(message.children, message.messageId, flatMessages);
          }
        }
        return flatMessages;
      };

      const flatMessages = flattenMessages(messagesToImport);
      cloneMessagesWithTimestamps(flatMessages, importBatchBuilder);
    } else if (messagesToImport) {
      cloneMessagesWithTimestamps(messagesToImport, importBatchBuilder);
      for (const message of messagesToImport) {
        if (!firstMessageDate && message.createdAt) {
          firstMessageDate = new Date(message.createdAt);
        }
      }
    } else {
      throw new Error('Invalid LibreChat file format');
    }

    if (firstMessageDate === 'Invalid Date') {
      firstMessageDate = null;
    }

    importBatchBuilder.finishConversation(jsonData.title, firstMessageDate ?? new Date(), options);
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

  /**
   * Helper function to find the nearest non-system parent
   * @param {string} parentId - The ID of the parent message.
   * @returns {string} The ID of the nearest non-system parent message.
   */
  const findNonSystemParent = (parentId) => {
    if (!parentId || !messageMap.has(parentId)) {
      return Constants.NO_PARENT;
    }

    const parentMapping = conv.mapping[parentId];
    if (!parentMapping?.message) {
      return Constants.NO_PARENT;
    }

    /* If parent is a system message, traverse up to find the nearest non-system parent */
    if (parentMapping.message.author?.role === 'system') {
      return findNonSystemParent(parentMapping.parent);
    }

    return messageMap.get(parentId);
  };

  // Create and save messages using the mapped IDs
  const messages = [];
  for (const [id, mapping] of Object.entries(conv.mapping)) {
    const role = mapping.message?.author?.role;
    if (!mapping.message) {
      messageMap.delete(id);
      continue;
    } else if (role === 'system') {
      // Skip system messages but keep their ID in messageMap for parent references
      continue;
    }

    const newMessageId = messageMap.get(id);
    const parentMessageId = findNonSystemParent(mapping.parent);

    const messageText = formatMessageText(mapping.message);

    const isCreatedByUser = role === 'user';
    let sender = isCreatedByUser ? 'user' : 'assistant';
    const model = mapping.message.metadata.model_slug || openAISettings.model.default;

    if (!isCreatedByUser) {
      /** Extracted model name from model slug */
      const gptMatch = model.match(/gpt-(.+)/i);
      if (gptMatch) {
        sender = `GPT-${gptMatch[1]}`;
      } else {
        sender = model || 'assistant';
      }
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
 * Uses citation start and end indices to place links at the correct positions.
 *
 * @param {ChatGPTMessage} messageData - The message data containing metadata about citations.
 * @param {string} messageText - The original text of the message which may be altered by inserting citation links.
 * @returns {string} - The updated message text after processing for citations.
 */
function processAssistantMessage(messageData, messageText) {
  if (!messageText) {
    return messageText;
  }

  const citations = messageData.metadata?.citations ?? [];

  const sortedCitations = [...citations].sort((a, b) => b.start_ix - a.start_ix);

  let result = messageText;
  for (const citation of sortedCitations) {
    if (
      !citation.metadata?.type ||
      citation.metadata.type !== 'webpage' ||
      typeof citation.start_ix !== 'number' ||
      typeof citation.end_ix !== 'number' ||
      citation.start_ix >= citation.end_ix
    ) {
      continue;
    }

    const replacement = ` ([${citation.metadata.title}](${citation.metadata.url}))`;

    result = result.slice(0, citation.start_ix) + replacement + result.slice(citation.end_ix);
  }

  return result;
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

module.exports = { getImporter, processAssistantMessage };
