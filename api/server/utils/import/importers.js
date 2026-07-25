const { v4: uuidv4 } = require('uuid');
const { convertConversation } = require('@librechat/api');
const { logger, getTenantId } = require('@librechat/data-schemas');
const { EModelEndpoint, Constants, openAISettings } = require('librechat-data-provider');
const { getEndpointsConfig } = require('~/server/services/Config');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const { resolveImportDefaultModel } = require('./defaults');
const { cloneMessagesWithTimestamps } = require('./fork');

/**
 * Returns the appropriate importer function based on the provided JSON data.
 *
 * @param {Object} jsonData - The JSON data to import.
 * @returns {Function} - The importer function.
 * @throws {Error} - If the import type is not supported.
 */
function getImporter(jsonData) {
  // For array-based formats (ChatGPT or Claude)
  if (Array.isArray(jsonData)) {
    // Claude format has chat_messages array in each conversation
    if (jsonData.length > 0 && jsonData[0]?.chat_messages) {
      logger.info('Importing Claude conversation');
      return importClaudeConvo;
    }
    // ChatGPT format has mapping object in each conversation
    if (jsonData.length === 0 || jsonData[0]?.mapping) {
      logger.info('Importing ChatGPT conversation');
      return importChatGptConvo;
    }
    throw new Error('Unsupported import type');
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
  userRole,
) {
  // this have been tested with chatbot-ui V1 export https://github.com/mckaywrigley/chatbot-ui/tree/b865b0555f53957e96727bc0bbb369c9eaecd83b#legacy-code
  try {
    /** @type {ImportBatchBuilder} */
    const importBatchBuilder = builderFactory(requestUserId);
    const defaultModel = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.openAI,
      requestUserId,
      userRole,
    });

    for (const historyItem of jsonData.history) {
      importBatchBuilder.startConversation(EModelEndpoint.openAI);
      for (const message of historyItem.messages) {
        if (message.role === 'assistant') {
          importBatchBuilder.addGptMessage(message.content, historyItem.model.id);
        } else if (message.role === 'user') {
          importBatchBuilder.addUserMessage(message.content);
        }
      }
      importBatchBuilder.finishConversation(historyItem.name, new Date(), {}, defaultModel);
    }
    await importBatchBuilder.saveBatch();
    logger.info(`user: ${requestUserId} | ChatbotUI conversation imported`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from ChatbotUI file`, error);
    throw error;
  }
}

/**
 * Extracts text and thinking content from a Claude message.
 * @param {Object} msg - Claude message object with content array and optional text field.
 * @returns {{textContent: string, thinkingContent: string}} Extracted text and thinking content.
 */
function extractClaudeContent(msg) {
  let textContent = '';
  let thinkingContent = '';

  for (const part of msg.content || []) {
    if (part.type === 'text' && part.text) {
      textContent += part.text;
    } else if (part.type === 'thinking' && part.thinking) {
      thinkingContent += part.thinking;
    }
  }

  // Use the text field as fallback if content array is empty
  if (!textContent && msg.text) {
    textContent = msg.text;
  }

  return { textContent, thinkingContent };
}

/**
 * Imports Claude conversations from provided JSON data.
 * Claude export format: array of conversations with chat_messages array.
 *
 * @param {Array} jsonData - Array of Claude conversation objects to be imported.
 * @param {string} requestUserId - The ID of the user who initiated the import process.
 * @param {Function} builderFactory - Factory function to create a new import batch builder instance.
 * @returns {Promise<void>} Promise that resolves when all conversations have been imported.
 */
async function importClaudeConvo(
  jsonData,
  requestUserId,
  builderFactory = createImportBatchBuilder,
  userRole,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    const defaultModel = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.anthropic,
      requestUserId,
      userRole,
    });

    for (const conv of jsonData) {
      importBatchBuilder.startConversation(EModelEndpoint.anthropic);

      let lastMessageId = Constants.NO_PARENT;
      let lastTimestamp = null;

      for (const msg of conv.chat_messages || []) {
        const isCreatedByUser = msg.sender === 'human';
        const messageId = uuidv4();

        const { textContent, thinkingContent } = extractClaudeContent(msg);

        // Skip empty messages
        if (!textContent && !thinkingContent) {
          continue;
        }

        // Parse timestamp, fallback to conversation create_time or current time
        const messageTime = msg.created_at || conv.created_at;
        let createdAt = messageTime ? new Date(messageTime) : new Date();

        // Ensure timestamp is after the previous message.
        // Messages are sorted by createdAt and buildTree expects parents to appear before children.
        // This guards against any potential ordering issues in exports.
        if (lastTimestamp && createdAt <= lastTimestamp) {
          createdAt = new Date(lastTimestamp.getTime() + 1);
        }
        lastTimestamp = createdAt;

        const message = {
          messageId,
          parentMessageId: lastMessageId,
          text: textContent,
          sender: isCreatedByUser ? 'user' : 'Claude',
          isCreatedByUser,
          user: requestUserId,
          endpoint: EModelEndpoint.anthropic,
          createdAt,
        };

        // Add content array with thinking if present
        if (thinkingContent && !isCreatedByUser) {
          message.content = [
            { type: 'think', think: thinkingContent },
            { type: 'text', text: textContent },
          ];
        }

        importBatchBuilder.saveMessage(message);
        lastMessageId = messageId;
      }

      const createdAt = conv.created_at ? new Date(conv.created_at) : new Date();
      importBatchBuilder.finishConversation(
        conv.name || 'Imported Claude Chat',
        createdAt,
        {},
        defaultModel,
      );
    }

    await importBatchBuilder.saveBatch();
    logger.info(`user: ${requestUserId} | Claude conversation imported`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from Claude file`, error);
    throw error;
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
  userRole,
) {
  try {
    /** @type {ImportBatchBuilder} */
    const importBatchBuilder = builderFactory(requestUserId);
    const options = jsonData.options || {};

    /* Endpoint configuration */
    let endpoint = jsonData.endpoint ?? options.endpoint ?? EModelEndpoint.openAI;
    const endpointsConfig = await getEndpointsConfig({
      user: { id: requestUserId, role: userRole, tenantId: getTenantId() },
    });
    const endpointConfig = endpointsConfig?.[endpoint];
    if (!endpointConfig && endpointsConfig) {
      endpoint = Object.keys(endpointsConfig)[0];
    } else if (!endpointConfig) {
      endpoint = EModelEndpoint.openAI;
    }

    importBatchBuilder.startConversation(endpoint);

    const defaultModel = await resolveImportDefaultModel({
      endpoint,
      requestUserId,
      userRole,
    });

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

    importBatchBuilder.finishConversation(
      jsonData.title,
      firstMessageDate ?? new Date(),
      options,
      defaultModel,
    );
    await importBatchBuilder.saveBatch();
    logger.debug(`user: ${requestUserId} | Conversation "${jsonData.title}" imported`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from LibreChat file`, error);
    throw error;
  }
}

/**
 * Builds the payload `ImportBatchBuilder.saveMessage` expects from one
 * message produced by the shared `convertConversation` engine (the same
 * conversion used for zipped ChatGPT export imports), so a bare `.json`
 * upload and a zip archive share one conversion implementation.
 *
 * @param {import('@librechat/api').ConvertedMessage} message
 * @returns {object}
 */
function toSaveMessageDetails(message) {
  return {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId,
    text: message.text,
    sender: message.sender,
    isCreatedByUser: message.isCreatedByUser,
    model: message.model,
    createdAt: message.createdAt,
    endpoint: EModelEndpoint.openAI,
    content: message.content,
    attachments: message.attachments,
    files: message.files,
  };
}

/**
 * Imports ChatGPT conversations from provided JSON data.
 * Delegates conversion of each conversation to `convertConversation`, the
 * same engine `runImport` uses for zipped ChatGPT exports, so a bare `.json`
 * upload and a zip archive produce identical messages. A bare JSON upload
 * never carries the export's asset files, so pointers are resolved against
 * an empty asset map: any image/audio references are dropped rather than
 * attached, exactly as before this delegation.
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
  userRole,
) {
  try {
    const importBatchBuilder = builderFactory(requestUserId);
    const defaultModel = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.openAI,
      requestUserId,
      userRole,
    });

    for (const conv of jsonData) {
      const converted = convertConversation(conv, {
        userId: requestUserId,
        assets: new Map(),
        defaultModel: defaultModel || openAISettings.model.default,
      });

      importBatchBuilder.startConversation(EModelEndpoint.openAI);
      for (const message of converted.messages) {
        importBatchBuilder.saveMessage(toSaveMessageDetails(message));
      }
      importBatchBuilder.finishConversation(
        converted.title,
        converted.createdAt,
        {
          isArchived: converted.isArchived,
          pinned: converted.pinned,
          model: converted.model,
          importedFrom: { source: 'chatgpt', externalId: converted.externalId },
        },
        converted.model,
      );
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from imported file`, error);
    throw error;
  }
}

module.exports = { getImporter };
