const { v4: uuidv4 } = require('uuid');
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
  // For array-based formats (ChatGPT, Claude, or OpenWebUI)
  if (Array.isArray(jsonData)) {
    // Claude format has chat_messages array in each conversation
    if (jsonData.length > 0 && jsonData[0]?.chat_messages) {
      logger.info('Importing Claude conversation');
      return importClaudeConvo;
    }
    // OpenWebUI format: array elements have a `chat` dict with history/messages
    if (
      jsonData.length > 0 &&
      jsonData[0]?.chat &&
      typeof jsonData[0].chat === 'object' &&
      (jsonData[0].chat.history || jsonData[0].chat.messages)
    ) {
      logger.info('Importing OpenWebUI conversation');
      return importOpenWebUiConvo;
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
      processConversation(conv, importBatchBuilder, requestUserId, defaultModel);
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from imported file`, error);
    throw error;
  }
}

/**
 * Processes a single conversation, adding messages to the batch builder based on author roles and handling text content.
 * It directly manages the addition of messages for different roles and handles citations for assistant messages.
 *
 * @param {ChatGPTConvo} conv - A single conversation object that contains multiple messages and other details.
 * @param {ImportBatchBuilder} importBatchBuilder - The batch builder instance used to manage and batch conversation data.
 * @param {string} requestUserId - The ID of the user who initiated the import process.
 * @param {string} [defaultModel] - Resolved default model for the openAI endpoint.
 * @returns {void}
 */
function processConversation(conv, importBatchBuilder, requestUserId, defaultModel) {
  importBatchBuilder.startConversation(EModelEndpoint.openAI);

  // Map all message IDs to new UUIDs
  const messageMap = new Map();
  for (const [id, mapping] of Object.entries(conv.mapping)) {
    if (mapping.message?.content?.content_type) {
      const newMessageId = uuidv4();
      messageMap.set(id, newMessageId);
    }
  }

  /**
   * Finds the nearest valid parent by traversing up through skippable messages
   * (system, reasoning_recap, thoughts). Uses iterative traversal to avoid
   * stack overflow on deep chains of skippable messages.
   *
   * @param {string} startId - The ID of the starting parent message.
   * @returns {string} The ID of the nearest valid parent message.
   */
  const findValidParent = (startId) => {
    const visited = new Set();
    let parentId = startId;

    while (parentId) {
      if (!messageMap.has(parentId) || visited.has(parentId)) {
        return Constants.NO_PARENT;
      }
      visited.add(parentId);

      const parentMapping = conv.mapping[parentId];
      if (!parentMapping?.message) {
        return Constants.NO_PARENT;
      }

      const contentType = parentMapping.message.content?.content_type;
      const shouldSkip =
        parentMapping.message.author?.role === 'system' ||
        contentType === 'reasoning_recap' ||
        contentType === 'thoughts';

      if (!shouldSkip) {
        return messageMap.get(parentId);
      }

      parentId = parentMapping.parent;
    }

    return Constants.NO_PARENT;
  };

  /**
   * Helper function to find thinking content from parent chain (thoughts messages)
   * @param {string} parentId - The ID of the parent message.
   * @param {Set} visited - Set of already-visited IDs to prevent cycles.
   * @returns {Array} The thinking content array (empty if not found).
   */
  const findThinkingContent = (parentId, visited = new Set()) => {
    // Guard against circular references in malformed imports
    if (!parentId || visited.has(parentId)) {
      return [];
    }
    visited.add(parentId);

    const parentMapping = conv.mapping[parentId];
    if (!parentMapping?.message) {
      return [];
    }

    const contentType = parentMapping.message.content?.content_type;

    // If this is a thoughts message, extract the thinking content
    if (contentType === 'thoughts') {
      const thoughts = parentMapping.message.content.thoughts || [];
      const thinkingText = thoughts
        .map((t) => t.content || t.summary || '')
        .filter(Boolean)
        .join('\n\n');

      if (thinkingText) {
        return [{ type: 'think', think: thinkingText }];
      }
      return [];
    }

    // If this is reasoning_recap, look at its parent for thoughts
    if (contentType === 'reasoning_recap') {
      return findThinkingContent(parentMapping.parent, visited);
    }

    return [];
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

    const contentType = mapping.message.content?.content_type;

    // Skip thoughts messages - they will be merged into the response message
    if (contentType === 'thoughts') {
      continue;
    }

    // Skip reasoning_recap messages (just summaries like "Thought for 44s")
    if (contentType === 'reasoning_recap') {
      continue;
    }

    const newMessageId = messageMap.get(id);
    if (!newMessageId) {
      continue;
    }
    const parentMessageId = findValidParent(mapping.parent);

    const messageText = formatMessageText(mapping.message);

    const isCreatedByUser = role === 'user';
    let sender = isCreatedByUser ? 'user' : 'assistant';
    const model =
      mapping.message.metadata?.model_slug || defaultModel || openAISettings.model.default;

    if (!isCreatedByUser) {
      /** Extracted model name from model slug */
      const gptMatch = model.match(/gpt-(.+)/i);
      if (gptMatch) {
        sender = `GPT-${gptMatch[1]}`;
      } else {
        sender = model || 'assistant';
      }
    }

    // Use create_time from ChatGPT export to ensure proper message ordering
    // For null timestamps, use the conversation's create_time as fallback, or current time as last resort
    const messageTime = mapping.message.create_time || conv.create_time;
    const createdAt = messageTime ? new Date(messageTime * 1000) : new Date();

    const message = {
      messageId: newMessageId,
      parentMessageId,
      text: messageText,
      sender,
      isCreatedByUser,
      model,
      user: requestUserId,
      endpoint: EModelEndpoint.openAI,
      createdAt,
    };

    // For assistant messages, check if there's thinking content in the parent chain
    if (!isCreatedByUser) {
      const thinkingContent = findThinkingContent(mapping.parent);
      if (thinkingContent.length > 0) {
        // Combine thinking content with the text response
        message.content = [...thinkingContent, { type: 'text', text: messageText }];
      }
    }

    messages.push(message);
  }

  const cycleDetected = adjustTimestampsForOrdering(messages);
  if (cycleDetected) {
    breakParentCycles(messages);
  }

  for (const message of messages) {
    importBatchBuilder.saveMessage(message);
  }

  importBatchBuilder.finishConversation(
    conv.title,
    new Date(conv.create_time * 1000),
    {},
    defaultModel,
  );
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
 * @returns {string} - The formatted message text.
 */
function formatMessageText(messageData) {
  const contentType = messageData.content.content_type;
  const isText = contentType === 'text';
  let messageText = '';

  if (isText && messageData.content.parts) {
    messageText = messageData.content.parts.join(' ');
  } else if (contentType === 'code') {
    messageText = `\`\`\`${messageData.content.language}\n${messageData.content.text}\n\`\`\``;
  } else if (contentType === 'execution_output') {
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

  if (isText && messageData.author?.role !== 'user') {
    messageText = processAssistantMessage(messageData, messageText);
  }

  return messageText;
}

/**
 * Adjusts message timestamps to ensure children always come after parents.
 * Messages are sorted by createdAt and buildTree expects parents to appear before children.
 * ChatGPT exports can have slight timestamp inversions (e.g., tool call results
 * arriving a few ms before their parent). Uses multiple passes to handle cascading adjustments.
 * Capped at N passes (where N = message count) to guarantee termination on cyclic graphs.
 *
 * @param {Array} messages - Array of message objects with messageId, parentMessageId, and createdAt.
 * @returns {boolean} True if cyclic parent relationships were detected.
 */
function adjustTimestampsForOrdering(messages) {
  if (messages.length === 0) {
    return false;
  }

  const timestampMap = new Map();
  for (const msg of messages) {
    timestampMap.set(msg.messageId, msg.createdAt);
  }

  let hasChanges = true;
  let remainingPasses = messages.length;
  while (hasChanges && remainingPasses > 0) {
    hasChanges = false;
    remainingPasses--;
    for (const message of messages) {
      if (message.parentMessageId && message.parentMessageId !== Constants.NO_PARENT) {
        const parentTimestamp = timestampMap.get(message.parentMessageId);
        if (parentTimestamp && message.createdAt <= parentTimestamp) {
          message.createdAt = new Date(parentTimestamp.getTime() + 1);
          timestampMap.set(message.messageId, message.createdAt);
          hasChanges = true;
        }
      }
    }
  }

  const cycleDetected = remainingPasses === 0 && hasChanges;
  if (cycleDetected) {
    logger.warn(
      '[importers] Detected cyclic parent relationships while adjusting import timestamps',
    );
  }
  return cycleDetected;
}

/**
 * Severs cyclic parentMessageId back-edges so saved messages form a valid tree.
 * Walks each message's parent chain; if a message is visited twice, its parentMessageId
 * is set to NO_PARENT to break the cycle.
 *
 * @param {Array} messages - Array of message objects with messageId and parentMessageId.
 */
function breakParentCycles(messages) {
  const parentLookup = new Map();
  for (const msg of messages) {
    parentLookup.set(msg.messageId, msg);
  }

  const settled = new Set();
  for (const message of messages) {
    const chain = new Set();
    let current = message;
    while (current && !settled.has(current.messageId)) {
      if (chain.has(current.messageId)) {
        current.parentMessageId = Constants.NO_PARENT;
        break;
      }
      chain.add(current.messageId);
      const parentId = current.parentMessageId;
      if (!parentId || parentId === Constants.NO_PARENT) {
        break;
      }
      current = parentLookup.get(parentId);
    }
    for (const id of chain) {
      settled.add(id);
    }
  }
}

/**
 * Joins text from a list of OpenWebUI output parts ({type, text} or bare strings).
 * @param {Array} source - The parts list.
 * @returns {string} The joined text.
 */
function joinOutputParts(source) {
  if (!Array.isArray(source)) {
    return '';
  }
  const bits = [];
  for (const p of source) {
    if (p && typeof p === 'object') {
      bits.push(p.text || '');
    } else if (typeof p === 'string') {
      bits.push(p);
    }
  }
  return bits.filter(Boolean).join('\n\n');
}

/**
 * Extracts reasoning/thinking text from an OpenWebUI `output` array
 * (items of type "reasoning"; text in `summary` or `content` parts).
 * @param {Array} output - The OpenWebUI output array.
 * @returns {string} The reasoning text (empty if none).
 */
function extractReasoningFromOutput(output) {
  if (!Array.isArray(output)) {
    return '';
  }
  const parts = [];
  for (const item of output) {
    if (!item || item.type !== 'reasoning') {
      continue;
    }
    const source = item.summary || item.content || [];
    const text = joinOutputParts(source);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join('\n\n');
}

/**
 * Extracts the assistant's visible text from an OpenWebUI `output` array
 * (items of type "message").
 * @param {Array} output - The OpenWebUI output array.
 * @returns {string} The message text (empty if none).
 */
function extractMessageTextFromOutput(output) {
  if (!Array.isArray(output)) {
    return '';
  }
  const parts = [];
  for (const item of output) {
    if (!item || item.type !== 'message') {
      continue;
    }
    const text = joinOutputParts(item.content || []);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join('\n\n');
}

/**
 * Builds a readable text block from OpenWebUI function_call + function_call_output
 * items (tool invocations and their results).
 * @param {Array} output - The OpenWebUI output array.
 * @returns {string} The tool block (empty if no tool calls).
 */
function extractToolBlockFromOutput(output) {
  if (!Array.isArray(output)) {
    return '';
  }
  /** @type {Record<string, {name: string, arguments: string}>} */
  const calls = {};
  const order = [];
  /** @type {Record<string, string>} */
  const results = {};
  for (const item of output) {
    if (!item) {
      continue;
    }
    if (item.type === 'function_call') {
      const callId = item.call_id || item.id || '';
      if (!(callId in calls)) {
        order.push(callId);
      }
      calls[callId] = { name: item.name || '', arguments: item.arguments || '' };
    } else if (item.type === 'function_call_output') {
      results[item.call_id || ''] = joinOutputParts(item.output || []);
    }
  }
  if (order.length === 0) {
    return '';
  }
  const lines = [];
  for (const callId of order) {
    const call = calls[callId];
    lines.push(`[Tool: ${call.name}(${call.arguments})]`);
    const result = results[callId];
    if (result) {
      lines.push(`Result: ${result}`);
    }
  }
  return lines.join('\n');
}

/**
 * Extracts text from the legacy OpenWebUI `content` field (string or list of parts).
 * @param {*} content - The content field.
 * @returns {string} The text.
 */
function extractLegacyContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  return joinOutputParts(Array.isArray(content) ? content : []);
}

/**
 * Collects the messages dict from an OpenWebUI chat blob. Prefers
 * `history.messages` (a dict keyed by id); falls back to a flat `messages` array.
 * @param {Object} chatBlob - The OpenWebUI `chat` object.
 * @returns {Object|null} The messages dict, or null if none found.
 */
function collectOpenWebUiMessages(chatBlob) {
  const history = chatBlob.history;
  if (history && typeof history === 'object' && history.messages && typeof history.messages === 'object') {
    return history.messages;
  }
  const msgs = chatBlob.messages;
  if (Array.isArray(msgs)) {
    const dict = {};
    for (const m of msgs) {
      if (m && m.id) {
        dict[m.id] = m;
      }
    }
    return dict;
  }
  if (msgs && typeof msgs === 'object') {
    return msgs;
  }
  return null;
}

/**
 * Processes a single OpenWebUI conversation, normalizing messages and adding
 * them to the batch builder. Reasoning content is attached as structured
 * `think` blocks; tool calls are appended to the message text.
 *
 * @param {Object} conv - A single OpenWebUI ChatResponse object.
 * @param {ImportBatchBuilder} importBatchBuilder - The batch builder instance.
 * @param {string} requestUserId - The ID of the user who initiated the import.
 * @param {string} defaultModel - Resolved default model for the openAI endpoint.
 */
function processOpenWebUiConversation(conv, importBatchBuilder, requestUserId, defaultModel) {
  const chatBlob = conv.chat || {};
  const messagesDict = collectOpenWebUiMessages(chatBlob);
  if (!messagesDict || Object.keys(messagesDict).length === 0) {
    return;
  }

  const models = chatBlob.models || [];
  const fallbackModel = models[0] || defaultModel || openAISettings.model.default;

  importBatchBuilder.startConversation(EModelEndpoint.openAI);

  // Map all original message IDs to new UUIDs up front so parent links resolve.
  const idMap = new Map();
  for (const id of Object.keys(messagesDict)) {
    idMap.set(id, uuidv4());
  }

  const messages = [];
  for (const [id, msg] of Object.entries(messagesDict)) {
    const role = msg.role || 'assistant';
    // Skip system/tool roles — they don't map to user/assistant.
    if (role !== 'user' && role !== 'assistant') {
      idMap.delete(id);
      continue;
    }

    const output = msg.output || [];
    const reasoning = extractReasoningFromOutput(output);
    let text = extractMessageTextFromOutput(output) || extractLegacyContent(msg.content);
    const toolBlock = extractToolBlockFromOutput(output);
    if (toolBlock) {
      text = text ? `${text}\n\n${toolBlock}` : toolBlock;
    }

    const isCreatedByUser = role === 'user';
    const model = msg.model || fallbackModel;
    const sender = isCreatedByUser ? 'user' : model;

    const parentMessageId = msg.parentId
      ? idMap.get(msg.parentId) || Constants.NO_PARENT
      : Constants.NO_PARENT;

    const timestamp = msg.timestamp || conv.created_at;
    const createdAt = timestamp ? new Date(timestamp * 1000) : new Date();

    const message = {
      messageId: idMap.get(id),
      parentMessageId,
      text,
      sender,
      isCreatedByUser,
      model,
      user: requestUserId,
      endpoint: EModelEndpoint.openAI,
      createdAt,
    };

    // Attach reasoning as a structured think block (renders collapsible in LibreChat).
    if (!isCreatedByUser && reasoning) {
      message.content = [{ type: 'think', think: reasoning }, { type: 'text', text }];
    }

    messages.push(message);
  }

  const cycleDetected = adjustTimestampsForOrdering(messages);
  if (cycleDetected) {
    breakParentCycles(messages);
  }

  for (const message of messages) {
    importBatchBuilder.saveMessage(message);
  }

  const convTime = conv.created_at ? new Date(conv.created_at * 1000) : new Date();
  importBatchBuilder.finishConversation(conv.title || chatBlob.title || 'Imported Chat', convTime, {}, fallbackModel);
}

/**
 * Imports conversations from an OpenWebUI chat export (a JSON array of
 * ChatResponse objects). Reasoning/thinking content is preserved as structured
 * `think` blocks; tool calls and their results are appended as a readable text
 * block (the OpenWebUI `output[]` items of type `function_call` /
 * `function_call_output`).
 *
 * @param {Array} jsonData - The OpenWebUI export data (array of ChatResponse).
 * @param {string} requestUserId - The ID of the user making the import request.
 * @param {Function} [builderFactory=createImportBatchBuilder] - The factory function.
 * @param {string} [userRole] - The role of the user making the request.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error creating conversations from the file.
 */
async function importOpenWebUiConvo(
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
      processOpenWebUiConversation(conv, importBatchBuilder, requestUserId, defaultModel);
    }
    await importBatchBuilder.saveBatch();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Error creating conversation from imported file`, error);
    throw error;
  }
}

module.exports = { getImporter, processAssistantMessage };
